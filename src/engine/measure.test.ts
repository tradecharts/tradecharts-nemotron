// Deterministic measure tests — no network, no key.

import { describe, expect, it } from "vitest";
import { measure, parseCsv, type Bar } from "./measure.js";

/** One straight leg per stretch of bars: open at the previous close, close
 *  `step` further, high/low spanning both endpoints. Bar times are weekly. */
function legTape(legs: Array<{ bars: number; step: number }>, startPrice = 100): Bar[] {
  const bars: Bar[] = [];
  let t = Date.parse("2020-01-06T00:00:00Z");
  let price = startPrice;
  for (const leg of legs) {
    for (let i = 0; i < leg.bars; i++) {
      const next = price + leg.step;
      bars.push({
        t: new Date(t).toISOString().slice(0, 10),
        time: t,
        o: price,
        h: Math.max(price, next) + 0.01,
        l: Math.min(price, next) - 0.01,
        c: next,
      });
      price = next;
      t += 7 * 86_400_000;
    }
  }
  return bars;
}

/** 8 alternating legs of ±5/bar × 5 bars: every leg is 25 wide, so the
 *  default 3.5×ATR band (≈17.5 with ATR≈5) confirms exactly one swing per
 *  leg extreme and ignores nothing else. */
function zigzagTape(): Bar[] {
  const legs = Array.from({ length: 8 }, (_, i) => ({ bars: 5, step: i % 2 === 0 ? 5 : -5 }));
  return legTape(legs);
}

describe("parseCsv (examples header format)", () => {
  it("parses the t,o,h,l,c header format into sorted numeric bars", () => {
    const text = [
      "t,o,h,l,c",
      "2024-01-15,10,12,9,11",
      "2024-01-08,5,6,4,10", // newest row given first — must sort oldest-first
      "2024-01-22,11,13,10,12",
    ].join("\n");
    const bars = parseCsv(text);
    expect(bars.map(b => b.t)).toEqual(["2024-01-08", "2024-01-15", "2024-01-22"]);
    expect(bars[0]).toMatchObject({ o: 5, h: 6, l: 4, c: 10, time: Date.parse("2024-01-08") });
  });

  it("accepts the time,o,h,l,c header spelling and skips junk rows", () => {
    const text = [
      "time,o,h,l,c",
      "not-a-date,1,2,3,4",
      "2024-01-08,NaN,2,1,1.5",
      "2024-01-08,5,6,4,10",
    ].join("\n");
    expect(parseCsv(text)).toHaveLength(1);
  });

  it("does not throw on empty and single-bar inputs", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("t,o,h,l,c\n2024-01-08,5,6,4,10\n")).toHaveLength(1);
  });
});

describe("measure (synthetic zigzag tape)", () => {
  it("finds swings whose anchors strictly alternate high/low", () => {
    const packet = measure(zigzagTape(), undefined, "ZZ-USD", "1W");
    expect(packet.swings.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < packet.swings.length; i++) {
      expect(packet.swings[i]!.anchor).not.toBe(packet.swings[i - 1]!.anchor);
    }
    // the first leg is up, so the first confirmed swing is its high
    expect(packet.swings[0]).toMatchObject({ anchor: "high", price: 125.01 });
    // 8 alternating ±25 legs between 100 and 125: 7 confirmed swings + 1 provisional
    expect(packet.swings).toHaveLength(8);
    // range + last come off the tape, not the model
    expect(packet.range).toMatchObject({ high: 125.01, low: 99.99 });
    expect(packet.last.c).toBe(100);
  });

  it("changes swing count with k: a finer band keeps the wiggles, a wider one drops them", () => {
    // 4 macro legs of ±5/bar × 6 bars with a 2-bar counter-move of ±6 in the
    // middle of each leg: the default band sees 4 macro swings only.
    const legs: Array<{ bars: number; step: number }> = [];
    for (let i = 0; i < 4; i++) {
      const up = i % 2 === 0;
      legs.push({ bars: 3, step: up ? 5 : -5 });
      legs.push({ bars: 1, step: up ? -6 : 6 }); // the wiggle
      legs.push({ bars: 3, step: up ? 5 : -5 });
    }
    const bars = legTape(legs);
    const fine = measure(bars, 0.5).swings.length; // band ≈ 0.5×ATR: wiggles confirm
    const mid = measure(bars, undefined).swings.length; // default 3.5: macro only
    const coarse = measure(bars, 9).swings.length; // band swallows some macro legs too
    expect(fine).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(coarse);
    expect(coarse).toBeGreaterThanOrEqual(1);
  });

  it("guards short tapes with the intended error instead of crashing", () => {
    expect(() => measure([])).toThrow("need ≥ 20 bars");
    expect(() => measure(zigzagTape().slice(0, 1))).toThrow("need ≥ 20 bars");
  });
});
