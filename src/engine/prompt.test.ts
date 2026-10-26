// Classification prompt tests — the contract text carries the measured facts.

import { describe, expect, it } from "vitest";
import { measure, renderFacts, type Bar } from "./measure.js";
import { CLASSIFY_SYSTEM, buildClassifyPrompt } from "./prompt.js";

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

const packet = measure(
  legTape(Array.from({ length: 8 }, (_, i) => ({ bars: 5, step: i % 2 === 0 ? 5 : -5 }))),
  undefined,
  "ZZ-USD",
  "1W",
);
const facts = renderFacts(packet);

describe("renderFacts (deterministic facts the model classifies from)", () => {
  it("carries the symbol, timeframe, bar count and swing list", () => {
    expect(facts).toContain("ZZ-USD 1W — 40 bars.");
    // first confirmed swing: top of leg 0 on its 5th weekly bar
    expect(facts).toContain("[1] 2020-02-03 high 125.0 @");
    expect(facts).toContain("high 125.0 (2020-02-03)"); // working range
    expect(facts).toContain("Fib of range:");
    expect(facts).toContain("Last bar "); //  + date + close
    expect(facts).toContain("Impulse arithmetic");
  });

  it("caps the swing list at maxSwings and says how many were omitted", () => {
    // 40 alternating 4-bar legs → ~40 swings, well past the cap
    const long = measure(
      legTape(Array.from({ length: 40 }, (_, i) => ({ bars: 4, step: i % 2 === 0 ? 6 : -6 }))),
      undefined,
      "ZZ-USD",
      "1W",
    );
    expect(long.swings.length).toBeGreaterThan(20);
    const shown = renderFacts(long);
    expect(shown).toMatch(/showing last 15, \d+ earlier omitted/);
    expect(shown.match(/^(\[\d+\].+)$/gm)).toHaveLength(15);
    expect(shown).not.toMatch(/^\[1\] /m); // the oldest swings are the omitted ones
    expect(renderFacts(long, 5)).toMatch(/showing last 5, /);
  });
});

describe("buildClassifyPrompt", () => {
  it("wraps the facts with the classification instruction", () => {
    const prompt = buildClassifyPrompt(facts);
    expect(prompt).toContain(facts);
    expect(prompt).toContain("Classify the working degree");
    expect(prompt).toContain("Copy swing prices/times exactly");
  });

  it("system contract demands one JSON object", () => {
    expect(CLASSIFY_SYSTEM).toContain("ONE JSON object");
    expect(CLASSIFY_SYSTEM).toContain('"unresolved"');
  });
});
