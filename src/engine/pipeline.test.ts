// Pipeline tests with a canned provider — no network, no key. The gate is
// the production validator; these cover how the pipeline maps completions
// to verdicts and ranks samples.

import { describe, expect, it } from "vitest";
import { measure, type Bar, type Swing } from "./measure.js";
import { runPipeline } from "./pipeline.js";
import { CLASSIFY_SYSTEM } from "./prompt.js";
import { fakeProvider } from "../../test/fake-provider.js";

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

function pivot(s: Swing, label: string, kind: "origin" | "impulse" | "corrective") {
  return { label, price: s.price, time: s.time, anchor: s.anchor, kind };
}

const s = packet.swings;
/** Sound corrective count copied from the measured swings: passes the gate
 *  (F7 may flag — B/A is exactly 1.0, off the zigzag catalog — never rejects). */
const zigzagOk = JSON.stringify({
  status: "ok",
  reason: "weekly zigzag between the range extremes — no larger degree on this tape",
  pattern: "zigzag",
  degree: "weekly",
  origin: pivot(s[0]!, "(0)", "origin"),
  pivots: [pivot(s[1]!, "(A)", "corrective"), pivot(s[2]!, "(B)", "corrective"), pivot(s[3]!, "(C)", "corrective")],
  long: { pivots: [], target: 0, invalidation: 0 },
  short: { pivots: [], target: 0, invalidation: 0 },
});
const unresolved = JSON.stringify({
  status: "unresolved",
  reason: "no honest count exists at this degree",
  pattern: "unresolved",
});
const brokenImpulse = JSON.stringify({
  status: "ok",
  reason: "five wave impulse up",
  pattern: "impulse",
  degree: "weekly",
  origin: pivot(s[0]!, "(0)", "origin"),
  pivots: [pivot(s[1]!, "(1)", "impulse"), pivot(s[2]!, "(2)", "impulse"), pivot(s[3]!, "(3)", "impulse")],
  long: { pivots: [], target: 0, invalidation: 0 },
  short: { pivots: [], target: 0, invalidation: 0 },
});

describe("runPipeline with a canned provider", () => {
  it("a proposal copied from the swings gates to valid/flagged", async () => {
    const provider = fakeProvider([zigzagOk]);
    const v = await runPipeline(provider, packet, { samples: 1 });
    expect(v.severity).toBe("flagged"); // F7 off-catalog flag, nothing harder
    expect(v.valid).toBe(true);
    expect(v.proposal?.pattern).toBe("zigzag");
    expect(v.violations[0]).toMatch(/^F7:/);
    // the model saw the system contract and the measured facts
    expect(provider.calls[0]!.messages[0]).toMatchObject({ role: "system", content: CLASSIFY_SYSTEM });
    expect(provider.calls[0]!.messages[1]!.content).toContain("ZZ-USD 1W");
  });

  it("status unresolved maps to the honest-abstain class", async () => {
    const v = await runPipeline(fakeProvider([unresolved]), packet, { samples: 1 });
    const cls = v.proposal?.status === "unresolved" ? "abstain" : v.severity;
    expect(cls).toBe("abstain");
    expect(v.proposal?.reason).toContain("no honest count");
  });

  it("non-JSON output is rejected as malformed output", async () => {
    const v = await runPipeline(fakeProvider(["Sorry, I cannot answer in JSON."]), packet, { samples: 1 });
    expect(v.severity).toBe("rejected");
    expect(v.reasonClass).toBe("malformed_output");
    expect(v.violations[0]).toContain("no parsable JSON");
    expect(v.proposal).toBeNull();
  });

  it("a proposal that breaks a hard rule is rejected with the rule named", async () => {
    const v = await runPipeline(fakeProvider([brokenImpulse]), packet, { samples: 1 });
    expect(v.severity).toBe("rejected");
    expect(v.reasonClass).toBe("rule_violation");
    expect(v.valid).toBe(false);
    expect(v.violations.join("\n")).toMatch(/H3: Impulse needs 1–5/);
  });

  it("surfaces a provider failure instead of inventing a verdict", async () => {
    await expect(
      runPipeline(fakeProvider([new Error("nebius HTTP 503: ResourceExhausted")]), packet, { samples: 1 }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("ranks two samples: a sound count beats a rejected one, regardless of order", async () => {
    for (const queue of [[brokenImpulse, zigzagOk], [zigzagOk, brokenImpulse]]) {
      const v = await runPipeline(fakeProvider(queue), packet, { samples: 2 });
      expect(v.severity).not.toBe("rejected");
      expect(v.proposal?.pattern).toBe("zigzag");
    }
  });
});
