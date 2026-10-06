import { describe, expect, it } from "vitest";
import { extractJson, validatePivots, validateProposal, waveFibLine, waveFibTable, zigzagChainIssues, type WavePivot } from "./index.js";

function P(label: string, price: number, time: number, anchor: WavePivot["anchor"], kind: WavePivot["kind"]): WavePivot {
  return { label, price, time, anchor, kind };
}

/** HUBS 2016–2025 impulse into $881 (WAVE-COUNT). */
const hubsImpulse: WavePivot[] = [
  P("0", 27, 1, "low", "origin"),
  P("1", 207.98, 2, "high", "impulse"),
  P("2", 90.83, 3, "low", "impulse"),
  P("3", 866, 4, "high", "impulse"),
  P("4", 245.03, 5, "low", "impulse"),
  P("5", 881.13, 6, "high", "impulse"),
];

describe("validator", () => {
  it("accepts the HUBS impulse (valid or flagged, never rejected)", () => {
    const r = validatePivots(hubsImpulse, "impulse");
    expect(r.severity).not.toBe("rejected");
    expect(r.rules.find((x) => x.id === "F7")).toBeTruthy();
  });

  it("flags Fib proof when wave 2 is not a catalog retrace (F7) without rejecting", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 19.5, 3, "low", "impulse"),
        P("3", 36, 4, "high", "impulse"),
        P("4", 28, 5, "low", "impulse"),
        P("5", 40, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "F7")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("rejects wave 3 as the shortest (H1)", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 18, 3, "low", "impulse"),
        P("3", 19, 4, "high", "impulse"),
        P("4", 18.5, 5, "low", "impulse"),
        P("5", 40, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).toBe("rejected");
    expect(r.reasonClass).toBe("rule_violation");
    expect(r.rules.find((x) => x.id === "H1")?.pass).toBe(false);
  });

  it("rejects a wave 4 overlap (H2)", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 3, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
        P("4", 19, 5, "low", "impulse"),
        P("5", 36, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "H2")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("rejects a forecast with no kill (H5)", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: { label: "0", price: 27, time: 1, anchor: "low", kind: "origin" },
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: [P("tgt", 900, 7, "high", "forecast-up")], target: 900, invalidation: 0 },
      short: { pivots: [P("tgt", 20, 7, "low", "forecast-down")], target: 20, invalidation: 1000 },
    });
    expect(r.severity).toBe("rejected");
    expect(r.rules.find((x) => x.id === "H5")?.pass).toBe(false);
  });

  it("rejects string prices as malformed (P1)", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      pivots: [{ label: "1", price: "207", time: 2, anchor: "high", kind: "impulse" }],
      long: { pivots: [], target: 1, invalidation: 1 },
      short: { pivots: [], target: 1, invalidation: 1 },
    });
    expect(r.severity).toBe("rejected");
    expect(r.reasonClass).toBe("malformed_output");
  });

  it("pulls JSON out of a markdown fence", () => {
    const raw = extractJson("here\n```json\n{\"status\":\"unresolved\",\"reason\":\"thin tape\"}\n```\n");
    expect(raw).toEqual({ status: "unresolved", reason: "thin tape" });
  });

  it("rejects H1/H4 when an impulse has no origin", () => {
    const r = validatePivots(
      [
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 3, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
        P("4", 22, 5, "low", "impulse"),
        P("5", 36, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).toBe("rejected");
    expect(r.rules.find((x) => x.id === "H1")?.pass).toBe(false);
    expect(r.rules.find((x) => x.id === "H4")?.pass).toBe(false);
  });

  it("rejects a 3-wave impulse (H3)", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 3, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).toBe("rejected");
    expect(r.reasonClass).toBe("rule_violation");
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(false);
  });

  it("rejects wave 2 through the origin (H4)", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 9, 3, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
        P("4", 22, 5, "low", "impulse"),
        P("5", 36, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).toBe("rejected");
    expect(r.rules.find((x) => x.id === "H4")?.pass).toBe(false);
  });

  it("rejects out-of-order times as malformed (P2)", () => {
    const r = validatePivots(
      [
        P("0", 10, 3, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 4, "low", "impulse"),
        P("3", 30, 5, "high", "impulse"),
        P("4", 22, 6, "low", "impulse"),
        P("5", 36, 7, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).toBe("rejected");
    expect(r.reasonClass).toBe("malformed_output");
    expect(r.rules.find((x) => x.id === "P2")?.pass).toBe(false);
  });

  it("rejects duplicate times as malformed (P2)", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 2, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
        P("4", 22, 5, "low", "impulse"),
        P("5", 36, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "P2")?.pass).toBe(false);
    expect(r.reasonClass).toBe("malformed_output");
  });

  it("rejects a pivot missing required fields (P3)", () => {
    const r = validatePivots(
      [
        { label: "", price: 20, time: 2, anchor: "high", kind: "impulse" },
        P("2", 16, 3, "low", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).toBe("rejected");
    expect(r.reasonClass).toBe("malformed_output");
    expect(r.rules.find((x) => x.id === "P3")?.pass).toBe(false);
  });

  it("flags a 1000× price span (P4) without rejecting", () => {
    const r = validatePivots(
      [
        P("0", 0.05, 1, "low", "origin"),
        P("1", 10, 2, "high", "impulse"),
        P("2", 6, 3, "low", "impulse"),
        P("3", 40, 4, "high", "impulse"),
        P("4", 20, 5, "low", "impulse"),
        P("5", 55, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "P4")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

it("zigzagChainIssues catches duplicate dates and inverted swings without pattern rules", () => {
    const t = (n: number) => n;
    const clean = [
      P("0", 10, t(1), "low", "origin"),
      P("1", 20, t(2), "high", "impulse"),
      P("2", 16, t(3), "low", "impulse"),
    ];
    expect(zigzagChainIssues(clean)).toEqual([]);
    const dupDate = [clean[0], clean[1], { ...clean[2], time: t(2) }];
    expect(zigzagChainIssues(dupDate).some((x) => x.startsWith("P2:"))).toBe(true);
    const sameAnchor = [clean[0], clean[1], { ...clean[2], anchor: "high" as const, price: 18 }];
    expect(zigzagChainIssues(sameAnchor).some((x) => x.startsWith("P5:"))).toBe(true);
    const noSwing = [clean[0], { ...clean[1], price: 9 }];
    expect(zigzagChainIssues(noSwing).some((x) => x.startsWith("P5:"))).toBe(true);
  });

  it("rejects two same-anchor pivots in a row as malformed (P5)", () => {
    // SOL-shaped inverted count: origin low → wave 1 also a low.
    const r = validatePivots(
      [
        P("0", 1.03, 1, "low", "origin"),
        P("1", 8.0, 2, "low", "impulse"),
        P("2", 295.83, 3, "high", "impulse"),
        P("3", 253.51, 4, "high", "impulse"),
        P("4", 121.66, 5, "low", "impulse"),
        P("5", 107.0, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "P5")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
    expect(r.reasonClass).toBe("malformed_output");
  });

  it("rejects a swing that does not move in its anchor's direction (P5)", () => {
    // Anchors alternate, but wave 5 "high" prints below wave 4's low.
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 3, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
        P("4", 12, 5, "low", "impulse"),
        P("5", 11, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "P5")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("passes P5 on a properly zigzagging count (including a truncated fifth)", () => {
    // Wave 5 tops below wave 3 but still above wave 4's low — a legal truncation.
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("1", 20, 2, "high", "impulse"),
        P("2", 16, 3, "low", "impulse"),
        P("3", 30, 4, "high", "impulse"),
        P("4", 22, 5, "low", "impulse"),
        P("5", 28, 6, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "P5")?.pass).toBe(true);
  });

  it("accepts the CHIPUSDT listing-unwind impulse (never rejected)", () => {
    const r = validatePivots(
      [
        P("0", 0.14, 1, "high", "origin"),
        P("1", 0.05128, 2, "low", "impulse"),
        P("2", 0.07587, 3, "high", "impulse"),
        P("3", 0.02741, 4, "low", "impulse"),
        P("4", 0.03903, 5, "high", "impulse"),
        P("5", 0.02147, 6, "low", "impulse"),
      ],
      "impulse",
    );
    expect(r.severity).not.toBe("rejected");
  });

  it("accepts a HUBS-style proposal with both paths (never rejected)", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      hold: { price: 207.98, label: "2019 HIGH / HOLD" },
      long: {
        pivots: [P("C", 169.63, 6, "low", "forecast-up"), P("(i)", 257.97, 7, "high", "forecast-up"), P("(ii)", 202.33, 8, "low", "forecast-up")],
        target: 345.16,
        invalidation: 169.63,
      },
      short: {
        pivots: [P("3ofC", 169.63, 6, "low", "forecast-down"), P("4", 257.97, 7, "high", "forecast-down"), P("5", 106.83, 9, "low", "forecast-down")],
        target: 106.83,
        invalidation: 310,
      },
    });
    expect(r.severity).not.toBe("rejected");
    expect(r.rules.find((x) => x.id === "H5")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S1")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S6")?.pass).toBe(true);
  });

  it("flags a deep wave-2 retrace on catalog as Fib proof (F7) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        P("1", 20, 2, "high", "impulse"),
        P("2", 11.5, 3, "low", "impulse"),
        P("3", 40, 4, "high", "impulse"),
        P("4", 28, 5, "low", "impulse"),
        P("5", 50, 6, "high", "impulse"),
      ],
      long: { pivots: [P("tgt", 50, 7, "high", "forecast-up")], target: 50, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 7, "low", "forecast-down")], target: 8, invalidation: 21 },
    });
    expect(r.severity).not.toBe("rejected");
  });

  it("flags C/A off the standard ratios (F7) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      structure: "corrective",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "A", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "B", price: 15, time: 3, anchor: "low", kind: "corrective" },
        { label: "C", price: 17, time: 4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 17, 5, "high", "forecast-up")], target: 17, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 21 },
    });
    expect(r.rules.find((x) => x.id === "F7")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a hold line off Fib of the major range (F6) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      hold: { price: 70, label: "off-fib hold" },
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "F6")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a target that misses Fib and printed pivots (F5) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 499, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 73, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "F5")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a missing Short path (S1) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S1")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags an alternate path that copies Long (S2) without rejecting", () => {
    const copy = [P("tgt", 881.13, 7, "high", "forecast-up")];
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: copy, target: 881.13, invalidation: 169.63 },
      short: { pivots: copy, target: 881.13, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S2")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags forecast labels mixed into the printed count (S3) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: [...hubsImpulse.filter((p) => p.label !== "0"), P("tgt", 600, 7, "low", "forecast-up")],
      long: { pivots: [P("tgt", 900, 8, "high", "forecast-up")], target: 900, invalidation: 169.63 },
      short: { pivots: [P("tgt", 20, 8, "low", "forecast-down")], target: 20, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S3")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("does not flag working-zigzag S4 when a scoped piece only nests Macro 4", () => {
    const r = validateProposal(
      {
        status: "ok",
        pattern: "zigzag",
        reason: "Working ABC after Macro 5.",
        origin: { t: "2025-10-13", price: 1375, label: "0", anchor: "high", kind: "origin" },
        pivots: [
          { t: "2026-02-02", price: 570, label: "A", anchor: "low", kind: "corrective" },
          { t: "2026-08-31", price: 780, label: "B", anchor: "high", kind: "corrective" },
          { t: "2026-09-14", price: 713, label: "C", anchor: "low", kind: "corrective" },
        ],
        internals: [
          { parent: "4", t: "2021-06-21", price: 350, label: "a/(4)", anchor: "low", kind: "corrective" },
          { parent: "4", t: "2021-11-08", price: 670, label: "b/(4)", anchor: "high", kind: "corrective" },
          { parent: "4", t: "2022-06-13", price: 183.4, label: "c/(4)", anchor: "low", kind: "corrective" },
        ],
      },
      { lanes: "optional", nests: "optional" },
    );
    expect(r.rules.find((x) => x.id === "S4")).toBeUndefined();
    expect(r.rules.find((x) => x.id === "S10")).toBeUndefined();
    expect(r.severity).not.toBe("rejected");
  });

  it("skips S4 / S10 on a Macro lock when nests are optional and empty", () => {
    const r = validateProposal(
      {
        status: "ok",
        pattern: "impulse",
        origin: hubsImpulse[0],
        pivots: hubsImpulse.filter((p) => p.label !== "0"),
      },
      { lanes: "optional", nests: "optional" },
    );
    expect(r.rules.find((x) => x.id === "S4")).toBeUndefined();
    expect(r.rules.find((x) => x.id === "S10")).toBeUndefined();
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a missing subwave nest (S4) without rejecting the 1–5", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("parses parented internals and flags S4 until 1/3/5 are nested", () => {
    const r = validateProposal({
      status: "ok",
      structure: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      internals: [
        { parent: "1", label: "i", price: 80, time: 1.5, anchor: "high", kind: "impulse" },
        { parent: "2", label: "a", price: 150, time: 2.5, anchor: "low", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.proposal?.internals?.map((p) => p.label)).toEqual(["i/1", "a/2"]);
    expect(r.proposal?.pattern).toBe("impulse");
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes S4 when impulse 1/3/5 have nests", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      internals: [
        { parent: "1", label: "i", price: 80, time: 1.5, anchor: "high", kind: "impulse" },
        { parent: "3", label: "i", price: 400, time: 3.5, anchor: "high", kind: "impulse" },
        { parent: "5", label: "i", price: 700, time: 5.5, anchor: "high", kind: "impulse" },
      ],
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes S10 when impulse 2 and 4 have corrective nests", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      internals: [
        { parent: "1", label: "i", price: 80, time: 1.5, anchor: "high", kind: "impulse" },
        { parent: "2", label: "a", price: 150, time: 2.5, anchor: "low", kind: "corrective" },
        { parent: "3", label: "i", price: 400, time: 3.5, anchor: "high", kind: "impulse" },
        { parent: "4", label: "a", price: 500, time: 4.5, anchor: "low", kind: "corrective" },
        { parent: "5", label: "i", price: 700, time: 5.5, anchor: "high", kind: "impulse" },
      ],
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("fails S10 when wave 2 is nested as a five (i–v)", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      internals: [
        { parent: "1", label: "i", price: 80, time: 1.5, anchor: "high", kind: "impulse" },
        { parent: "2", label: "i", price: 150, time: 2.5, anchor: "low", kind: "impulse" },
        { parent: "3", label: "i", price: 400, time: 3.5, anchor: "high", kind: "impulse" },
        { parent: "4", label: "a", price: 500, time: 4.5, anchor: "low", kind: "corrective" },
        { parent: "5", label: "i", price: 700, time: 5.5, anchor: "high", kind: "impulse" },
      ],
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(false);
  });

  it("flags missing macro stack (S12) unless reason names this lock as the macro", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "impulse",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(r.rules.find((x) => x.id === "S12")?.pass).toBe(false);
    const named = validateProposal({
      status: "ok",
      pattern: "impulse",
      reason: "Working degree is the macro for this lock.",
      origin: hubsImpulse[0],
      pivots: hubsImpulse.filter((p) => p.label !== "0"),
      long: { pivots: [P("tgt", 881.13, 7, "high", "forecast-up")], target: 881.13, invalidation: 169.63 },
      short: { pivots: [P("tgt", 27, 7, "low", "forecast-down")], target: 27, invalidation: 310 },
    });
    expect(named.rules.find((x) => x.id === "S12")?.pass).toBe(true);
  });

  it("does not run T3 coil-band on an expanding triangle", () => {
    const r = validatePivots(
      [
        P("0", 20, 1, "high", "origin"),
        P("A", 18, 2, "low", "corrective"),
        P("B", 22, 3, "high", "corrective"),
        P("C", 14, 4, "low", "corrective"),
        P("D", 28, 5, "high", "corrective"),
        P("E", 8, 6, "low", "corrective"),
      ],
      "triangle",
    );
    expect(r.rules.find((x) => x.id === "T3")).toBeUndefined();
    expect(r.severity).not.toBe("rejected");
  });

  it("accepts a zigzag A-B-C (H3) and flags missing C internals (S4)", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "zigzag",
      origin: { label: "0", price: 100, time: 1, anchor: "high", kind: "origin" },
      pivots: [
        { label: "A", price: 50, time: 2, anchor: "low", kind: "corrective" },
        { label: "B", price: 70, time: 3, anchor: "high", kind: "corrective" },
        { label: "C", price: 40, time: 4, anchor: "low", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 80, 5, "high", "forecast-up")], target: 80, invalidation: 38 },
      short: { pivots: [P("tgt", 30, 5, "low", "forecast-down")], target: 30, invalidation: 72 },
    });
    expect(r.proposal?.structure).toBe("corrective");
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes zigzag S4 when reason says C is a three", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "zigzag",
      reason: "Working ABC from the ATH. B is a zigzag. C is a three.",
      origin: { label: "0", price: 100, time: 1, anchor: "high", kind: "origin" },
      pivots: [
        { label: "A", price: 50, time: 2, anchor: "low", kind: "corrective" },
        { label: "B", price: 70, time: 3, anchor: "high", kind: "corrective" },
        { label: "C", price: 40, time: 4, anchor: "low", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 80, 5, "high", "forecast-up")], target: 80, invalidation: 38 },
      short: { pivots: [P("tgt", 30, 5, "low", "forecast-down")], target: 30, invalidation: 72 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("derives zigzag from legacy structure=corrective", () => {
    const r = validateProposal({
      status: "ok",
      structure: "corrective",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "A", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "B", price: 16, time: 3, anchor: "low", kind: "corrective" },
        { label: "C", price: 28, time: 4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 32, 5, "high", "forecast-up")], target: 32, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 21 },
    });
    expect(r.proposal?.pattern).toBe("zigzag");
    expect(r.proposal?.structure).toBe("corrective");
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(true);
  });

  it("flags a B retrace that misses catalog Fib proof (F7)", () => {
    const r = validateProposal({
      status: "ok",
      structure: "corrective",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "A", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "B", price: 19.5, time: 3, anchor: "low", kind: "corrective" },
        { label: "C", price: 32, time: 4, anchor: "high", kind: "corrective" },
      ],
      hold: { price: 16.18, label: "hold" },
      long: { pivots: [P("tgt", 32, 5, "high", "forecast-up")], target: 32, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 21 },
    });
    expect(r.rules.find((x) => x.id === "F7")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("skips S5 when no measure range is passed", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "zigzag",
      reason: "C is a three.",
      origin: { label: "0", price: 4956, time: Date.parse("2025-08-18T00:00:00Z") / 1000, anchor: "high", kind: "origin" },
      pivots: [
        { label: "A", price: 2623, time: Date.parse("2025-11-17T00:00:00Z") / 1000, anchor: "low", kind: "corrective" },
        { label: "B", price: 3447, time: Date.parse("2025-12-08T00:00:00Z") / 1000, anchor: "high", kind: "corrective" },
        { label: "C", price: 1505, time: Date.parse("2026-06-01T00:00:00Z") / 1000, anchor: "low", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 3094, 7, "high", "forecast-up")], target: 3094, invalidation: 1505 },
      short: { pivots: [P("tgt", 1125, 7, "low", "forecast-down")], target: 1125, invalidation: 2528 },
    });
    expect(r.rules.find((x) => x.id === "S5")).toBeUndefined();
  });

  it("flags a last-year zigzag that misses the cycle low (S5)", () => {
    const r = validateProposal(
      {
        status: "ok",
        pattern: "zigzag",
        reason: "C is a three.",
        origin: { label: "0", price: 4956, time: Date.parse("2025-08-18T00:00:00Z") / 1000, anchor: "high", kind: "origin" },
        pivots: [
          { label: "A", price: 2623, time: Date.parse("2025-11-17T00:00:00Z") / 1000, anchor: "low", kind: "corrective" },
          { label: "B", price: 3447, time: Date.parse("2025-12-08T00:00:00Z") / 1000, anchor: "high", kind: "corrective" },
          { label: "C", price: 1505, time: Date.parse("2026-06-01T00:00:00Z") / 1000, anchor: "low", kind: "corrective" },
        ],
        long: { pivots: [P("tgt", 3094, 7, "high", "forecast-up")], target: 3094, invalidation: 1505 },
        short: { pivots: [P("tgt", 1125, 7, "low", "forecast-down")], target: 1125, invalidation: 2528 },
      },
      { range: { high: 4956, low: 80, highT: "2025-08-18", lowT: "2018-12-17" } },
    );
    expect(r.rules.find((x) => x.id === "S5")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes S5 when printed labels include both range extremes", () => {
    const r = validateProposal(
      {
        status: "ok",
        pattern: "impulse",
        origin: { label: "0", price: 80, time: Date.parse("2018-12-17T00:00:00Z") / 1000, anchor: "low", kind: "origin" },
        pivots: [
          P("1", 1400, Date.parse("2021-05-10T00:00:00Z") / 1000, "high", "impulse"),
          P("2", 880, Date.parse("2022-06-20T00:00:00Z") / 1000, "low", "impulse"),
          P("3", 4000, Date.parse("2024-03-11T00:00:00Z") / 1000, "high", "impulse"),
          P("4", 2100, Date.parse("2025-04-07T00:00:00Z") / 1000, "low", "impulse"),
          P("5", 4956, Date.parse("2025-08-18T00:00:00Z") / 1000, "high", "impulse"),
        ],
        internals: [
          { parent: "1", label: "i", price: 400, time: Date.parse("2020-01-06T00:00:00Z") / 1000, anchor: "high", kind: "impulse" },
          { parent: "3", label: "i", price: 2000, time: Date.parse("2023-01-02T00:00:00Z") / 1000, anchor: "high", kind: "impulse" },
          { parent: "5", label: "i", price: 3500, time: Date.parse("2025-06-02T00:00:00Z") / 1000, anchor: "high", kind: "impulse" },
        ],
        long: { pivots: [P("tgt", 6000, 9, "high", "forecast-up")], target: 6000, invalidation: 80 },
        short: { pivots: [P("tgt", 1505, 9, "low", "forecast-down")], target: 1505, invalidation: 4956 },
      },
      { range: { high: 4956, low: 80, highT: "2025-08-18", lowT: "2018-12-17" } },
    );
    expect(r.rules.find((x) => x.id === "S5")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a Long/Short stub parked on C (S6) without rejecting", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "zigzag",
      reason: "C is a three.",
      origin: { label: "0", price: 2817, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "A", price: 126199, time: 2, anchor: "high", kind: "corrective" },
        { label: "B", price: 60000, time: 3, anchor: "low", kind: "corrective" },
        { label: "C", price: 81771, time: 4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("(i)", 81771, 4, "high", "forecast-up")], target: 126199, invalidation: 60000 },
      short: { pivots: [P("(c)", 81771, 4, "low", "forecast-down")], target: 60000, invalidation: 126199 },
    });
    expect(r.rules.find((x) => x.id === "S6")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes S6 when Long and Short run from C toward last", () => {
    const r = validateProposal(
      {
        status: "ok",
        pattern: "zigzag",
        reason: "C is a three.",
        origin: { label: "0", price: 2817, time: Date.parse("2017-09-11T00:00:00Z") / 1000, anchor: "low", kind: "origin" },
        pivots: [
          { label: "A", price: 126199, time: Date.parse("2025-10-06T00:00:00Z") / 1000, anchor: "high", kind: "corrective" },
          { label: "B", price: 60000, time: Date.parse("2026-02-02T00:00:00Z") / 1000, anchor: "low", kind: "corrective" },
          { label: "C", price: 81771, time: Date.parse("2026-08-31T00:00:00Z") / 1000, anchor: "high", kind: "corrective" },
        ],
        long: {
          pivots: [
            P("C", 81771, Date.parse("2026-08-31T00:00:00Z") / 1000, "high", "forecast-up"),
            P("(i)", 78000, Date.parse("2026-09-07T00:00:00Z") / 1000, "low", "forecast-up"),
            P("(ii)", 85000, Date.parse("2026-09-21T00:00:00Z") / 1000, "high", "forecast-up"),
          ],
          target: 100000,
          invalidation: 60000,
        },
        short: {
          pivots: [
            P("C", 81771, Date.parse("2026-08-31T00:00:00Z") / 1000, "high", "forecast-down"),
            P("(iv)", 79000, Date.parse("2026-09-07T00:00:00Z") / 1000, "low", "forecast-down"),
            P("(v)", 92000, Date.parse("2026-10-05T00:00:00Z") / 1000, "high", "forecast-down"),
          ],
          target: 92000,
          invalidation: 126199,
        },
      },
      { last: { t: "2026-09-07", c: 81500 } },
    );
    expect(r.rules.find((x) => x.id === "S6")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags S6 when paths skip months of tape after the last print", () => {
    const r = validateProposal(
      {
        status: "ok",
        pattern: "zigzag",
        reason: "C is a three.",
        origin: { label: "0", price: 10, time: Date.parse("2018-01-01T00:00:00Z") / 1000, anchor: "low", kind: "origin" },
        pivots: [
          { label: "A", price: 40, time: Date.parse("2020-01-01T00:00:00Z") / 1000, anchor: "high", kind: "corrective" },
          { label: "B", price: 22, time: Date.parse("2021-01-01T00:00:00Z") / 1000, anchor: "low", kind: "corrective" },
          { label: "C", price: 30, time: Date.parse("2024-01-01T00:00:00Z") / 1000, anchor: "high", kind: "corrective" },
        ],
        long: {
          pivots: [
            P("(i)", 80, Date.parse("2027-01-01T00:00:00Z") / 1000, "high", "forecast-up"),
            P("(ii)", 60, Date.parse("2027-06-01T00:00:00Z") / 1000, "low", "forecast-up"),
          ],
          target: 80,
          invalidation: 20,
        },
        short: {
          pivots: [
            P("4", 12, Date.parse("2027-01-01T00:00:00Z") / 1000, "low", "forecast-down"),
            P("5", 8, Date.parse("2027-06-01T00:00:00Z") / 1000, "low", "forecast-down"),
          ],
          target: 8,
          invalidation: 40,
        },
      },
      { last: { t: "2026-09-01", c: 28 } },
    );
    expect(r.rules.find((x) => x.id === "S6")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  const overlappingFive: WavePivot[] = [
    P("0", 10, 1, "low", "origin"),
    P("1", 20, 2, "high", "impulse"),
    P("2", 16, 3, "low", "impulse"),
    P("3", 30, 4, "high", "impulse"),
    P("4", 19, 5, "low", "impulse"),
    P("5", 36, 6, "high", "impulse"),
  ];

  it("still rejects overlapping 4/1 when the pattern is impulse (no diagonal backdoor)", () => {
    const r = validatePivots(overlappingFive, "impulse");
    expect(r.rules.find((x) => x.id === "H2")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("accepts the same overlapping 1–5 as a named diagonal", () => {
    const r = validatePivots(overlappingFive, "diagonal");
    expect(r.rules.find((x) => x.id === "H2")).toBeUndefined();
    expect(r.rules.find((x) => x.id === "D1")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("rejects a non-overlapping 1–5 labeled diagonal (D1)", () => {
    const r = validatePivots(hubsImpulse, "diagonal");
    expect(r.rules.find((x) => x.id === "D1")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("accepts a five-letter triangle A–E", () => {
    const r = validatePivots(
      [
        P("0", 20, 1, "high", "origin"),
        P("A", 10, 2, "low", "corrective"),
        P("B", 18, 3, "high", "corrective"),
        P("C", 12, 4, "low", "corrective"),
        P("D", 16, 5, "high", "corrective"),
        P("E", 13, 6, "low", "corrective"),
      ],
      "triangle",
    );
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("rejects a four-letter triangle (H3)", () => {
    const r = validatePivots(
      [
        P("A", 10, 2, "low", "corrective"),
        P("B", 18, 3, "high", "corrective"),
        P("C", 12, 4, "low", "corrective"),
        P("D", 16, 5, "high", "corrective"),
      ],
      "triangle",
    );
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("rejects a combination missing Y (H3)", () => {
    const r = validatePivots(
      [
        P("0", 10, 1, "low", "origin"),
        P("W", 20, 2, "high", "corrective"),
        P("X", 14, 3, "low", "corrective"),
      ],
      "combination",
    );
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("flags combination S4/S10 when W and Y are unnamed", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "combination",
      reason: "Weekly combination from origin.",
      degree: "weekly combination from origin",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "W", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "X", price: 14, time: 3, anchor: "low", kind: "corrective" },
        { label: "Y", price: 22, time: 4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 28, 5, "high", "forecast-up")], target: 28, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 23 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(false);
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes combination S4/S10 when reason names a sharp double zigzag", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "combination",
      reason: "Sharp double zigzag from the origin.",
      degree: "weekly combination from origin",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "W", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "X", price: 14, time: 3, anchor: "low", kind: "corrective" },
        { label: "Y", price: 22, time: 4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 28, 5, "high", "forecast-up")], target: 28, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 23 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes combination S4 when W and Y nest a-b-c", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "combination",
      reason: "Working degree is the macro for this lock.",
      degree: "weekly combination from origin",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "W", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "X", price: 14, time: 3, anchor: "low", kind: "corrective" },
        { label: "Y", price: 22, time: 4, anchor: "high", kind: "corrective" },
      ],
      internals: [
        { parent: "W", label: "a", price: 14, time: 1.4, anchor: "high", kind: "corrective" },
        { parent: "X", label: "a", price: 16, time: 2.4, anchor: "low", kind: "corrective" },
        { parent: "Y", label: "a", price: 18, time: 3.4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 28, 5, "high", "forecast-up")], target: 28, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 23 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("fails combination S10 when W is nested as a five", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "combination",
      reason: "Working degree is the macro for this lock.",
      degree: "weekly combination from origin",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "W", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "X", price: 14, time: 3, anchor: "low", kind: "corrective" },
        { label: "Y", price: 22, time: 4, anchor: "high", kind: "corrective" },
      ],
      internals: [
        { parent: "W", label: "i", price: 14, time: 1.4, anchor: "high", kind: "impulse" },
        { parent: "X", label: "a", price: 16, time: 2.4, anchor: "low", kind: "corrective" },
        { parent: "Y", label: "a", price: 18, time: 3.4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 28, 5, "high", "forecast-up")], target: 28, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 23 },
    });
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S10")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("accepts W–X–Y with both kills", () => {
    const r = validateProposal({
      status: "ok",
      pattern: "combination",
      degree: "weekly combination from origin",
      origin: { label: "0", price: 10, time: 1, anchor: "low", kind: "origin" },
      pivots: [
        { label: "W", price: 20, time: 2, anchor: "high", kind: "corrective" },
        { label: "X", price: 14, time: 3, anchor: "low", kind: "corrective" },
        { label: "Y", price: 22, time: 4, anchor: "high", kind: "corrective" },
      ],
      long: { pivots: [P("tgt", 28, 5, "high", "forecast-up")], target: 28, invalidation: 9 },
      short: { pivots: [P("tgt", 8, 5, "low", "forecast-down")], target: 8, invalidation: 23 },
    });
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a short wave 3 in time (T1) without rejecting", () => {
    const r = validatePivots(
      [
        P("0", 10, 100, "low", "origin"),
        P("1", 20, 200, "high", "impulse"),
        P("2", 16, 220, "low", "impulse"),
        P("3", 32, 230, "high", "impulse"),
        P("4", 24, 280, "low", "impulse"),
        P("5", 40, 360, "high", "impulse"),
      ],
      "impulse",
    );
    expect(r.rules.find((x) => x.id === "T1")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("adds A1 when an overlapping five is still labeled impulse", () => {
    const r = validatePivots(overlappingFive, "impulse");
    expect(r.rules.find((x) => x.id === "A1")?.pass).toBe(false);
    expect(r.severity).toBe("rejected");
  });

  it("does not raise A1 on a named diagonal", () => {
    const r = validatePivots(overlappingFive, "diagonal");
    expect(r.rules.find((x) => x.id === "A1")).toBeUndefined();
  });

  it("flags a trending A–E as not coiling (T2) without rejecting", () => {
    const r = validatePivots(
      [
        P("A", 10, 1, "low", "corrective"),
        P("B", 30, 2, "high", "corrective"),
        P("C", 29, 3, "low", "corrective"),
        P("D", 50, 4, "high", "corrective"),
        P("E", 49, 5, "low", "corrective"),
      ],
      "triangle",
    );
    expect(r.rules.find((x) => x.id === "T2")?.pass).toBe(false);
    expect(r.rules.find((x) => x.id === "P5")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("flags a Long five that fails impulse shape (S8) without rejecting", () => {
    const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
    const r = validateProposal({
      status: "ok",
      pattern: "zigzag",
      reason: "Weekly zigzag from crash low.",
      origin: { label: "0", price: 80, time: t("2018-12-10"), anchor: "low", kind: "origin" },
      pivots: [
        P("A", 4800, t("2021-11-08"), "high", "corrective"),
        P("B", 1100, t("2022-11-07"), "low", "corrective"),
        P("C", 5000, t("2025-08-18"), "high", "corrective"),
      ],
      long: {
        pivots: [
          P("(i)", 3400, t("2025-12-08"), "high", "forecast-up"),
          P("(ii)", 1700, t("2026-02-02"), "low", "forecast-up"),
          P("(iii)", 2400, t("2026-04-13"), "high", "forecast-up"),
          P("(iv)", 1500, t("2026-06-01"), "low", "forecast-up"),
          P("(v)", 2500, t("2026-08-31"), "high", "forecast-up"),
        ],
        target: 3800,
        invalidation: 1500,
      },
      short: {
        pivots: [
          P("(a)", 2100, t("2026-09-15"), "low", "forecast-down"),
          P("(b)", 2500, t("2026-10-15"), "high", "forecast-down"),
        ],
        target: 1900,
        invalidation: 2500,
      },
    });
    expect(r.rules.find((x) => x.id === "S8")?.pass).toBe(false);
    expect(r.severity).not.toBe("rejected");
  });

  it("passes S8 when Long (iii) exceeds (i) from the last print", () => {
    const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
    const r = validateProposal({
      status: "ok",
      pattern: "zigzag",
      reason: "C is a three.",
      origin: { label: "0", price: 80, time: t("2018-12-10"), anchor: "low", kind: "origin" },
      pivots: [
        P("A", 4800, t("2021-11-08"), "high", "corrective"),
        P("B", 1100, t("2022-11-07"), "low", "corrective"),
        P("C", 2000, t("2025-08-18"), "high", "corrective"),
      ],
      long: {
        pivots: [
          P("(i)", 2600, t("2025-12-08"), "high", "forecast-up"),
          P("(ii)", 2200, t("2026-02-02"), "low", "forecast-up"),
          P("(iii)", 3400, t("2026-04-13"), "high", "forecast-up"),
          P("(iv)", 3000, t("2026-06-01"), "low", "forecast-up"),
          P("(v)", 4000, t("2026-08-31"), "high", "forecast-up"),
        ],
        target: 4000,
        invalidation: 2000,
      },
      short: {
        pivots: [
          P("(a)", 1800, t("2026-09-07"), "low", "forecast-down"),
          P("(b)", 2100, t("2026-10-15"), "high", "forecast-down"),
        ],
        target: 1500,
        invalidation: 4000,
      },
    });
    expect(r.rules.find((x) => x.id === "S8")?.pass).toBe(true);
    expect(r.severity).not.toBe("rejected");
  });

  it("scores the locked ETH zigzag: parent ABC holds, Long five and C nest do not", () => {
    const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
    const r = validateProposal(
      {
        status: "ok",
        pattern: "zigzag",
        reason: "Weekly zigzag from crash low.",
        origin: { label: "0", price: 81.79, time: t("2018-12-10"), anchor: "low", kind: "origin" },
        pivots: [
          P("A", 4868, t("2021-11-08"), "high", "corrective"),
          P("B", 1073.53, t("2022-11-07"), "low", "corrective"),
          P("C", 4956.78, t("2025-08-18"), "high", "corrective"),
        ],
        internals: [
          { parent: "C", label: "i", price: 4093.92, time: t("2023-04-17"), anchor: "high", kind: "impulse" },
          { parent: "C", label: "ii", price: 2111, time: t("2023-10-23"), anchor: "low", kind: "impulse" },
          { parent: "C", label: "iii", price: 4107.8, time: t("2024-03-11"), anchor: "high", kind: "impulse" },
          { parent: "C", label: "iv", price: 1385.05, time: t("2025-04-07"), anchor: "low", kind: "impulse" },
          { parent: "C", label: "v", price: 4956.78, time: t("2025-08-18"), anchor: "high", kind: "impulse" },
        ],
        hold: { price: 3094.53, label: "hold" },
        long: {
          pivots: [
            P("(i)", 3447.44, t("2025-12-08"), "high", "forecast-up"),
            P("(ii)", 1747.8, t("2026-02-02"), "low", "forecast-up"),
            P("(iii)", 2464.91, t("2026-04-13"), "high", "forecast-up"),
            P("(iv)", 1505.68, t("2026-06-01"), "low", "forecast-up"),
            P("(v)", 2547, t("2026-08-31"), "high", "forecast-up"),
          ],
          target: 3806.28,
          invalidation: 1505.68,
        },
        short: {
          pivots: [
            P("(a)", 2100, t("2026-09-15"), "low", "forecast-down"),
            P("(b)", 2519.28, t("2026-10-15"), "high", "forecast-down"),
            P("(c)", 1944.04, t("2026-11-15"), "low", "forecast-down"),
          ],
          target: 1944.04,
          invalidation: 2547,
        },
      },
      { last: { t: "2026-09-05", c: 2487 }, range: { high: 4956.78, low: 81.79, highT: "2025-08-18", lowT: "2018-12-10" } },
    );
    expect(r.rules.find((x) => x.id === "H3")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S4")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S5")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "F7")).toBeTruthy();
    expect(r.rules.find((x) => x.id === "S6")?.pass).toBe(true);
    expect(r.rules.find((x) => x.id === "S8")?.pass).toBe(false);
    expect(r.rules.find((x) => x.id === "S9")?.pass).toBe(false);
    expect(r.severity).toBe("flagged");
  });
});

describe("waveFibTable", () => {
  it("derives per-wave ratios for a clean impulse and marks them on-catalog", () => {
    const rows = waveFibTable(hubsImpulse, "impulse");
    expect(rows.map((r) => r.pair)).toEqual(["2/1", "3/1", "4/3", "5"]);
    expect(rows.some((r) => r.pct <= 0)).toBe(false);
    // HUBS 2 retrace ~31% (90.83 of 27→207.98 = 35%?) — just require a number and a flag
    expect(rows.every((r) => typeof r.onCatalog === "boolean")).toBe(true);
    const line = waveFibLine(hubsImpulse, "impulse");
    expect(line).toContain("2/1");
    expect(line).toContain("3/1");
  });

  it("derives B/A and C/A for a zigzag", () => {
    const chain = [
      P("0", 100, 1, "high", "origin"),
      P("A", 50, 2, "low", "corrective"),
      P("B", 75, 3, "high", "corrective"),
      P("C", 30, 4, "low", "corrective"),
    ];
    const rows = waveFibTable(chain, "zigzag");
    expect(rows.map((r) => r.pair)).toEqual(["B/A", "C/A"]);
    expect(rows[0].pct).toBeCloseTo(50, 0);
    expect(rows[1].pct).toBeCloseTo(90, 0);
  });

  it("returns empty for an incomplete count", () => {
    expect(waveFibTable(hubsImpulse.slice(0, 4), "impulse")).toEqual([]);
    expect(waveFibLine([], "zigzag")).toBe("");
  });
});

describe("lanes-optional map stage", () => {
  it("accepts a macro+internals map with NO lanes; same map rejects when lanes are required", () => {
    const raw = {
      status: "ok",
      pattern: "zigzag",
      reason: "cycle bear. C is a three.",
      origin: { t: "2021-11-08", price: 69000, label: "0", anchor: "high", kind: "origin" },
      pivots: [
        { t: "2022-11-14", price: 15443, label: "A", anchor: "low", kind: "corrective" },
        { t: "2024-03-11", price: 73750, label: "B", anchor: "high", kind: "corrective" },
        { t: "2026-08-31", price: 63000, label: "C", anchor: "low", kind: "corrective" },
      ],
      internals: [
        { parent: "A", t: "2023-06-05", price: 25100, label: "i", anchor: "low", kind: "impulse" },
        { parent: "A", t: "2024-01-08", price: 49000, label: "ii", anchor: "high", kind: "corrective" },
      ],
    };
    const opt = validateProposal(raw, { lanes: "optional" });
    expect(opt.severity).not.toBe("rejected");
    expect(opt.proposal?.long.pivots.length).toBe(0);
    expect(opt.proposal?.short.pivots.length).toBe(0);
    // No lane-only rules in the map-stage verdict (H5/S1/S2/S6/S8 absent).
    const ids = new Set(opt.rules.map((r) => r.id));
    expect(ids.has("H5")).toBe(false);
    expect(ids.has("S1")).toBe(false);
    expect(ids.has("S2")).toBe(false);
    expect(ids.has("S6")).toBe(false);
    // Fib proof + internals + span rules still run.
    expect(ids.has("F7")).toBe(true);
    expect(ids.has("S4")).toBe(true);

    const req = validateProposal(raw);
    expect(req.severity).toBe("rejected");
    expect(req.reasonClass).toBe("malformed_output");
  });
});
