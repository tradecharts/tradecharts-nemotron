/**
 * Pure validator. Raw model JSON never reaches the canvas without this gate.
 * Spec: docs/VALIDATOR-SCOPE.md
 */

import type {
  MeasureBounds,
  Proposal,
  ReasonClass,
  RuleResult,
  Severity,
  ValidateOpts,
  ValidationResult,
  WavePattern,
  WavePivot,
  WaveShape,
} from "./types.js";

export type {
  AdvisoryReport,
  MeasureBounds,
  MeasureLast,
  Proposal,
  ReasonClass,
  RuleResult,
  Severity,
  ValidateOpts,
  ValidationResult,
  WavePattern,
  WavePivot,
} from "./types.js";

export { applyAdvisory, parseAdvisory } from "./judge.js";
export type { AdvisoryPayload } from "./judge.js";

export function structureOf(pattern: WavePattern): "impulse" | "corrective" {
  return pattern === "impulse" || pattern === "diagonal" ? "impulse" : "corrective";
}

const PATTERNS = new Set<WavePattern>([
  "impulse",
  "diagonal",
  "zigzag",
  "flat",
  "triangle",
  "combination",
  "unresolved",
]);

export function resolvePattern(raw: Record<string, unknown>): WavePattern | null {
  const p = raw.pattern;
  if (typeof p === "string" && PATTERNS.has(p as WavePattern)) return p as WavePattern;
  if (raw.structure === "impulse") return "impulse";
  if (raw.structure === "corrective") return "zigzag";
  return null;
}

const KINDS = new Set<WavePivot["kind"]>(["impulse", "corrective", "forecast-up", "forecast-down", "origin"]);
const ANCHORS = new Set<WavePivot["anchor"]>(["high", "low"]);

const IMPULSE = /^(?:\(?([1-5])\)?|wave\s*([1-5]))$/i;
const CORRECTIVE = /^(?:\(?([abc])\)?|wave\s*([abc]))$/i;

function rule(id: string, pass: boolean, message: string, severity: Severity): RuleResult {
  return { id, pass, message, severity };
}

function worst(rules: RuleResult[]): Severity {
  if (rules.some((r) => !r.pass && r.severity === "rejected")) return "rejected";
  if (rules.some((r) => !r.pass && r.severity === "flagged")) return "flagged";
  return "valid";
}

function reasonOf(rules: RuleResult[]): ReasonClass {
  const bad = rules.find((r) => !r.pass && r.severity === "rejected");
  if (bad?.id.startsWith("P")) return "malformed_output";
  return "rule_violation";
}

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const iso = Date.parse(value.length === 7 ? `${value}-01T00:00:00Z` : `${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(iso)) return Math.floor(iso / 1000);
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function parsePivot(raw: unknown): WavePivot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const price = typeof o.price === "string" ? Number(o.price) : o.price;
  const time = parseTime(o.time ?? o.t);
  const label = o.label;
  const anchor = o.anchor;
  const kind = o.kind;
  if (typeof label !== "string" || !label.trim()) return null;
  if (!isNum(price) || price <= 0) return null;
  if (time == null) return null;
  if (anchor !== "high" && anchor !== "low") return null;
  if (typeof kind !== "string" || !KINDS.has(kind as WavePivot["kind"])) return null;
  if (!ANCHORS.has(anchor)) return null;
  return { label: label.trim(), price, time, anchor, kind: kind as WavePivot["kind"] };
}

function schemaRules(pivots: WavePivot[], rawOk: boolean, stringPrice: boolean): RuleResult[] {
  const out: RuleResult[] = [];
  if (!rawOk || stringPrice) {
    out.push(rule("P1", false, "Pivots must parse as numbers. No NaN, no string prices.", "rejected"));
    return out;
  }
  out.push(rule("P1", pivots.length > 0, pivots.length ? "Pivots parsed." : "No usable pivots.", "rejected"));
  if (!pivots.length) return out;

  const times = pivots.map((p) => p.time);
  const ordered = times.every((t, i) => i === 0 || t >= times[i - 1]!);
  const dup = new Set(times).size !== times.length;
  out.push(rule("P2", ordered && !dup, ordered && !dup ? "Times are chronological." : "Pivots must be chronological with no duplicate times.", "rejected"));

  const fields = pivots.every((p) => p.label && isNum(p.price) && isNum(p.time) && ANCHORS.has(p.anchor) && KINDS.has(p.kind));
  out.push(rule("P3", fields, fields ? "Required fields present." : "Each pivot needs label, price, time, anchor, kind.", "rejected"));

  const prices = pivots.map((p) => p.price);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const spanOk = min > 0 && max / min <= 1000;
  out.push(rule("P4", spanOk, spanOk ? "Price range is plausible." : "Prices span more than 1000× — likely a decimal error.", "flagged"));
  return out;
}

/**
 * P5 — a printed count must zigzag. Anchors alternate along origin → 1–5
 * (or A-B-C / A-E / W-X-Y), and each swing moves in its anchor's direction:
 * a high after a low prints a higher price, a low after a high a lower one.
 * Catches inverted counts (two lows in a row, "high" below the prior low)
 * that arithmetic overlap checks alone let through.
 */
function alternationRules(pivots: WavePivot[]): RuleResult[] {
  if (pivots.length < 2) return [];
  let altFail = 0;
  let dirFail = 0;
  for (let i = 1; i < pivots.length; i++) {
    const a = pivots[i - 1]!;
    const b = pivots[i]!;
    if (a.anchor === b.anchor) altFail++;
    else if (b.anchor === "high" ? b.price <= a.price : b.price >= a.price) dirFail++;
  }
  const ok = altFail === 0 && dirFail === 0;
  return [
    rule(
      "P5",
      ok,
      ok
        ? "Printed pivots zigzag — anchors alternate and each swing moves in its anchor's direction."
        : altFail
          ? "Printed pivots must alternate high/low — two same-anchor pivots in a row is not a wave structure. Copy the count from the measured swing list in order."
          : "Each swing must move in its anchor's direction — a high after a low must print a higher price; a low after a high a lower price.",
      "rejected",
    ),
  ];
}

function impulseIndex(label: string): number | null {
  const m = label.trim().match(IMPULSE);
  if (!m) return null;
  return Number(m[1] || m[2]);
}

function abcIndex(label: string): "A" | "B" | "C" | null {
  const m = label.trim().match(CORRECTIVE);
  if (!m) return null;
  return (m[1] || m[2] || "").toUpperCase() as "A" | "B" | "C";
}

const LETTER = /^(?:\(?([ABCDEWXY])\)?)$/i;

function letterIndex(label: string): string | null {
  const m = label.trim().match(LETTER);
  if (!m) return null;
  return (m[1] || "").toUpperCase();
}

function pickLetters(pivots: WavePivot[], wanted: string[]): WavePivot[] {
  const map = new Map<string, WavePivot>();
  for (const p of pivots) {
    const n = letterIndex(p.label);
    if (n) map.set(n, p);
  }
  return wanted.map((n) => map.get(n)).filter((p): p is WavePivot => p != null);
}

function pickImpulse(pivots: WavePivot[]): WavePivot[] {
  const map = new Map<number, WavePivot>();
  for (const p of pivots) {
    const n = impulseIndex(p.label);
    if (n) map.set(n, p);
  }
  return [1, 2, 3, 4, 5].map((n) => map.get(n)).filter((p): p is WavePivot => p != null);
}

function pickAbc(pivots: WavePivot[]): WavePivot[] {
  const map = new Map<string, WavePivot>();
  for (const p of pivots) {
    const n = abcIndex(p.label);
    if (n) map.set(n, p);
  }
  return (["A", "B", "C"] as const).map((n) => map.get(n)).filter((p): p is WavePivot => p != null);
}

function findOrigin(pivots: WavePivot[]): WavePivot | undefined {
  return pivots.find((p) => p.kind === "origin") ?? pivots.find((p) => p.label === "0" || p.label === "(0)");
}

const ROMAN_LEG = /^(?:\(?((?:iii|ii|iv|v|i))\)?)$/i;
const ROMAN_TO_N: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

function motiveIndex(label: string): number | null {
  const head = label.trim().split("/")[0] ?? "";
  const arabic = impulseIndex(head);
  if (arabic != null) return arabic;
  const m = head.match(ROMAN_LEG);
  if (!m) return null;
  return ROMAN_TO_N[m[1]!.toLowerCase()] ?? null;
}

function pickMotive(pivots: WavePivot[]): WavePivot[] {
  const map = new Map<number, WavePivot>();
  for (const p of pivots) {
    const n = motiveIndex(p.label);
    if (n) map.set(n, p);
  }
  return [1, 2, 3, 4, 5].map((n) => map.get(n)).filter((p): p is WavePivot => p != null);
}

function measureMotive(legs: WavePivot[], origin: WavePivot | undefined) {
  if (legs.length !== 5) {
    return { overlap: false, w3Shortest: false, w2ThroughOrigin: false, exceeded: true };
  }
  const [w1, w2, w3, w4, w5] = legs;
  const bull = w5.price > w1.price;
  const overlap = bull ? w4.price <= w1.price : w4.price >= w1.price;
  const exceeded = bull ? w3.price > w1.price : w3.price < w1.price;
  let w3Shortest = false;
  let w2ThroughOrigin = false;
  if (origin) {
    const l1 = Math.abs(w1.price - origin.price);
    const l3 = Math.abs(w3.price - w2.price);
    const l5 = Math.abs(w5.price - w4.price);
    w3Shortest = l3 <= l1 && l3 <= l5;
    w2ThroughOrigin = bull ? w2.price <= origin.price : w2.price >= origin.price;
  }
  return { overlap, w3Shortest, w2ThroughOrigin, exceeded };
}

function motiveLegs(pivots: WavePivot[]): {
  legs: WavePivot[];
  origin: WavePivot | undefined;
  overlap: boolean;
  w3Shortest: boolean;
  w2ThroughOrigin: boolean;
} {
  const legs = pickImpulse(pivots);
  const origin = findOrigin(pivots);
  return { legs, origin, ...measureMotive(legs, origin) };
}

function inferTriangleShape(legs: WavePivot[]): WaveShape {
  if (legs.length < 5) return "contracting";
  const first = Math.abs(legs[1]!.price - legs[0]!.price);
  const last = Math.abs(legs[4]!.price - legs[3]!.price);
  return last > first * 1.12 ? "expanding" : "contracting";
}

function inferDiagonalShape(m: ReturnType<typeof motiveLegs>): WaveShape {
  if (m.legs.length !== 5) return "contracting";
  const [w1, w2, w3, w4, w5] = m.legs;
  const fourLonger = Math.abs(w4.price - w3.price) > Math.abs(w2.price - w1.price);
  const bull = w5.price > w1.price;
  const fiveBeyond = bull ? w5.price > w3.price : w5.price < w3.price;
  return fourLonger && fiveBeyond ? "expanding" : "contracting";
}

function elliottRules(pivots: WavePivot[], pattern: WavePattern, context = "", shape?: WaveShape): RuleResult[] {
  const out: RuleResult[] = [];
  if (pattern === "impulse") {
    const m = motiveLegs(pivots);
    out.push(rule("H3", m.legs.length === 5, m.legs.length === 5 ? "Impulse has 1–5." : `Impulse needs 1–5 (found ${m.legs.length}).`, "rejected"));
    if (m.legs.length === 5) {
      if (!m.origin) {
        out.push(rule("H1", false, "Impulse origin required to measure whether wave 3 is shortest.", "rejected"));
        out.push(rule("H4", false, "Impulse origin required to measure wave 2 vs origin.", "rejected"));
      } else {
        out.push(rule("H1", !m.w3Shortest, m.w3Shortest ? "Wave 3 cannot be the shortest of 1/3/5." : "Wave 3 is not the shortest.", "rejected"));
        out.push(rule("H4", !m.w2ThroughOrigin, m.w2ThroughOrigin ? "Wave 2 retraced through the origin." : "Wave 2 holds the origin.", "rejected"));
      }
      out.push(rule("H2", !m.overlap, m.overlap ? "Wave 4 overlaps wave 1 in a cash impulse." : "Wave 4 does not overlap wave 1.", "rejected"));
    }
    return out;
  }

  if (pattern === "diagonal") {
    const m = motiveLegs(pivots);
    out.push(rule("H3", m.legs.length === 5, m.legs.length === 5 ? "Diagonal has 1–5." : `Diagonal needs 1–5 (found ${m.legs.length}).`, "rejected"));
    if (m.legs.length === 5) {
      if (!m.origin) {
        out.push(rule("D3", false, "Diagonal origin required to measure wave 3.", "rejected"));
        out.push(rule("H4", false, "Diagonal origin required to measure wave 2 vs origin.", "rejected"));
      } else {
        out.push(rule("D3", !m.w3Shortest, m.w3Shortest ? "Wave 3 cannot be the shortest of 1/3/5." : "Wave 3 is not the shortest.", "rejected"));
        out.push(rule("H4", !m.w2ThroughOrigin, m.w2ThroughOrigin ? "Wave 2 retraced through the origin." : "Wave 2 holds the origin.", "rejected"));
      }
      out.push(rule("D1", m.overlap, m.overlap ? "Wave 4 overlaps wave 1 — diagonal type." : "Diagonal requires wave 4 to overlap wave 1. If it does not, this is an impulse.", "rejected"));
      const placed = /\b(leading|ending)\b/i.test(context);
      out.push(
        rule(
          "D2",
          placed,
          placed
            ? "Diagonal is placed on 1 / A or 5 / C."
            : "Diagonal belongs on wave 1 / A or 5 / C of a parent. Name that in degree.",
          "flagged",
        ),
      );
    }
    return out;
  }

  if (pattern === "triangle") {
    const legs = pickLetters(pivots, ["A", "B", "C", "D", "E"]);
    out.push(rule("H3", legs.length === 5, legs.length === 5 ? "Triangle has A–E." : `Triangle needs A–E (found ${legs.length}).`, "rejected"));
    if (legs.length === 5) {
      const coil = (shape ?? inferTriangleShape(legs)) === "contracting";
      if (coil) {
        const [a, , c, , e] = legs;
        const lo = Math.min(a.price, c.price);
        const hi = Math.max(a.price, c.price);
        const span = hi - lo;
        const through = span > 0 && (e.price < lo - span * 0.12 || e.price > hi + span * 0.12);
        out.push(rule("T3", !through, through ? "E blew through the A–C range." : "E holds the A–C range.", "flagged"));
      }
    }
    return out;
  }

  if (pattern === "combination") {
    const legs = pickLetters(pivots, ["W", "X", "Y"]);
    out.push(rule("H3", legs.length === 3, legs.length === 3 ? "Combination has W–X–Y." : `Combination needs W–X–Y (found ${legs.length}).`, "rejected"));
    if (legs.length === 3) {
      const origin = findOrigin(pivots);
      const [w, x] = legs;
      if (origin) {
        const bull = w.price > origin.price;
        const through = bull ? x.price <= origin.price : x.price >= origin.price;
        out.push(rule("X1", !through, through ? "X retraced W through the origin." : "X holds the W origin.", "rejected"));
      }
    }
    return out;
  }

  const abc = pickAbc(pivots);
  out.push(rule("H3", abc.length === 3, abc.length === 3 ? "Corrective has A-B-C." : `Corrective needs A-B-C (found ${abc.length}).`, "rejected"));
  return out;
}

function lineAt(a: WavePivot, b: WavePivot, t: number): number {
  const dt = b.time - a.time;
  if (dt === 0) return a.price;
  return a.price + ((t - a.time) / dt) * (b.price - a.price);
}

/** Flag-only guides (time, channel, alternate). Never reject. */
function guideFlags(pivots: WavePivot[], pattern: WavePattern, shape?: WaveShape): RuleResult[] {
  const out: RuleResult[] = [];
  if (pattern === "impulse" || pattern === "diagonal") {
    const m = motiveLegs(pivots);
    if (m.legs.length === 5 && m.origin) {
      const [w1, w2, w3, w4] = m.legs;
      const t1 = w1.time - m.origin.time;
      const t3 = w3.time - w2.time;
      const t1ok = !(t1 > 0 && t3 >= 0 && t3 < t1 * 0.33);
      out.push(
        rule(
          "T1",
          t1ok,
          t1ok ? "Wave 3 is not drastically shorter in time than wave 1." : "Wave 3 is much shorter in time than wave 1.",
          "flagged",
        ),
      );
      if (pattern === "impulse") {
        const proj = lineAt(m.origin, w2, w4.time);
        const slack = Math.abs(w3.price - w2.price) * 0.25;
        const bull = m.legs[4]!.price > w1.price;
        const threw = bull ? w4.price < proj - slack : w4.price > proj + slack;
        out.push(
          rule(
            "C1",
            !threw,
            threw ? "Wave 4 threw through the 0–2 channel line." : "Wave 4 holds the 0–2 channel.",
            "flagged",
          ),
        );
      }
      const d1 = Math.abs(w1.price - m.origin.price);
      const d3 = Math.abs(w3.price - w2.price);
      const r2 = d1 > 0 ? Math.abs(w2.price - w1.price) / d1 : 0;
      const r4 = d3 > 0 ? Math.abs(w4.price - w3.price) / d3 : 0;
      const same = (r2 >= 0.618 && r4 >= 0.618) || (r2 <= 0.382 && r4 <= 0.382);
      out.push(
        rule(
          "S7",
          !same,
          same ? "Waves 2 and 4 do not alternate (both deep or both shallow)." : "Waves 2 and 4 alternate.",
          "flagged",
        ),
      );
    }
    if (pattern === "impulse" && m.legs.length === 5) {
      out.push(
        rule(
          "A1",
          !m.overlap,
          m.overlap
            ? "Wave 4 overlapped wave 1. Name diagonal, triangle, or ABC — do not leave this as impulse."
            : "Impulse 4/1 is clean; no forced alternate.",
          "flagged",
        ),
      );
    }
  }
  if (pattern === "triangle") {
    const legs = pickLetters(pivots, ["A", "B", "C", "D", "E"]);
    if (legs.length === 5) {
      const [a, b, c, d, e] = legs;
      const path =
        Math.abs(b.price - a.price) +
        Math.abs(c.price - b.price) +
        Math.abs(d.price - c.price) +
        Math.abs(e.price - d.price);
      const net = Math.abs(e.price - a.price);
      const inferred = shape ?? inferTriangleShape(legs);
      if (inferred === "contracting") {
        const coil = !(net > 0 && path / net < 1.4);
        out.push(
          rule(
            "T2",
            coil,
            coil ? "Triangle legs coil (path vs net)." : "Legs do not coil — price is trending. This may not be a triangle.",
            "flagged",
          ),
        );
      }
    }
  }
  return out;
}

function killRules(longKill?: number, shortKill?: number): RuleResult[] {
  const ok = isNum(longKill) && longKill > 0 && isNum(shortKill) && shortKill > 0;
  return [rule("H5", ok, ok ? "Both paths carry an invalidation." : "Every forecast must have a kill price.", "rejected")];
}

/** Band on the *ratio* (parent lengths): 50% pocket accepts ~40–60%. */
const FIB_BAND = 0.1;

function nearRatio(value: number, targets: number[], tol = FIB_BAND): boolean {
  return targets.some((t) => Math.abs(value - t) <= tol);
}

const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786, 0.886, 1, 1.236, 1.618, 2.618];

function majorRange(pivots: WavePivot[]): { low: number; high: number } | null {
  if (pivots.length < 2) return null;
  const prices = pivots.map((p) => p.price);
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

function nearFibOfRange(price: number, range: { low: number; high: number }): boolean {
  const span = range.high - range.low;
  if (span <= 0) return false;
  const pos = (price - range.low) / span;
  return nearRatio(pos, FIB_RATIOS) || nearRatio(price / range.high, FIB_RATIOS);
}

function fibRules(
  pivots: WavePivot[],
  _structure: "impulse" | "corrective",
  extra?: { hold?: number; longTarget?: number; shortTarget?: number; anchors?: WavePivot[] },
): RuleResult[] {
  const out: RuleResult[] = [];
  const range = majorRange(pivots);

  if (range) {
    const interior = pivots.filter((p) => p.kind !== "origin" && p.label !== "0");
    const near = interior.filter((p) => nearFibOfRange(p.price, range));
    const f1 = interior.length === 0 || near.length > 0;
    out.push(rule("F1", f1, f1 ? "Key pivots sit near a standard Fib of the major range." : "No interior pivot sits near a standard Fib of the major range.", "flagged"));
  }

  if (extra && range) {
    const anchors = extra.anchors ?? pivots;
    const hits = (price: number) =>
      nearFibOfRange(price, range) || anchors.some((p) => Math.abs(p.price - price) / Math.max(price, 1e-9) < 0.01);
    const longOk = extra.longTarget == null || hits(extra.longTarget);
    const shortOk = extra.shortTarget == null || hits(extra.shortTarget);
    const f5 = longOk && shortOk;
    out.push(rule("F5", f5, f5 ? "Targets sit on the measured range or a printed pivot." : "A target is not near a Fib of the major range or a printed pivot.", "flagged"));
    if (extra.hold != null) {
      const f6 = nearFibOfRange(extra.hold, range);
      out.push(rule("F6", f6, f6 ? "Hold line sits near a Fib of the major range." : "Hold line is not near a Fib of the major range.", "flagged"));
    }
  }
  return out;
}

const POCKET = {
  two: [0.382, 0.5, 0.618, 0.786, 0.887],
  three: [1, 1.236, 1.618, 1.75, 2, 2.272, 2.618, 3.618, 4.236],
  four: [0.236, 0.382, 0.5, 0.618, 0.786],
  five: [0.618, 0.786, 1, 1.236, 1.618, 2.618],
  zigzagB: [0.382, 0.5, 0.618, 0.786, 0.887],
  zigzagC: [0.5, 0.618, 0.786, 1, 1.236, 1.618],
  flatB: [0.9, 1, 1.272],
  flatC: [0.618, 0.786, 1, 1.236, 1.618],
  tri: [0.5, 0.618, 0.786, 0.887, 1.236, 1.618],
  x: [0.382, 0.5, 0.618, 0.786],
  y: [1, 1.272, 1.618],
};

function len(a: WavePivot, b: WavePivot): number {
  return Math.abs(b.price - a.price);
}

function pairOk(value: number, pockets: number[]): boolean {
  return value > 0 && nearRatio(value, pockets);
}

function pairLine(label: string, value: number, pockets: number[]): string {
  const pct = (value * 100).toFixed(1);
  return pairOk(value, pockets) ? `${label} ${pct}%` : `${label} ${pct}% off-catalog`;
}

/** Wave + Fib are one proof. Every printed wave is a ratio of its parent. Flag only. */
function fibProofRules(pivots: WavePivot[], pattern: WavePattern): RuleResult[] {
  const origin = findOrigin(pivots);
  const lines: string[] = [];
  let ok = true;

  if (pattern === "impulse" || pattern === "diagonal") {
    const legs = pickImpulse(pivots);
    if (legs.length === 5 && origin) {
      const [w1, w2, w3, w4, w5] = legs;
      const l1 = len(origin, w1);
      const r2 = l1 > 0 ? len(w1, w2) / l1 : 0;
      const r3 = l1 > 0 ? len(w2, w3) / l1 : 0;
      const l3 = len(w2, w3);
      const r4 = l3 > 0 ? len(w3, w4) / l3 : 0;
      const l4 = len(w3, w4);
      const r5of1 = l1 > 0 ? len(w4, w5) / l1 : 0;
      const r5of4 = l4 > 0 ? len(w4, w5) / l4 : 0;
      const fiveOk = pairOk(r5of1, POCKET.five) || pairOk(r5of4, POCKET.five);
      const checks = [
        pairOk(r2, POCKET.two),
        pairOk(r3, POCKET.three),
        pairOk(r4, POCKET.four),
        fiveOk,
      ];
      ok = checks.every(Boolean);
      lines.push(
        pairLine("2/1", r2, POCKET.two),
        pairLine("3/1", r3, POCKET.three),
        pairLine("4/3", r4, POCKET.four),
        fiveOk ? `5 ${((r5of1 || r5of4) * 100).toFixed(1)}%` : `5/1 ${(r5of1 * 100).toFixed(1)}% and 5/4 ${(r5of4 * 100).toFixed(1)}% off-catalog`,
      );
    } else {
      ok = false;
      lines.push("need origin + 1–5 to measure Fib proof");
    }
  } else if (pattern === "zigzag" || pattern === "flat") {
    const abc = pickAbc(pivots);
    if (abc.length === 3 && origin) {
      const [a, b, c] = abc;
      const lA = len(origin, a);
      const rB = lA > 0 ? len(a, b) / lA : 0;
      const rC = lA > 0 ? len(b, c) / lA : 0;
      const pb = pattern === "flat" ? POCKET.flatB : POCKET.zigzagB;
      const pc = pattern === "flat" ? POCKET.flatC : POCKET.zigzagC;
      ok = pairOk(rB, pb) && pairOk(rC, pc);
      lines.push(pairLine("B/A", rB, pb), pairLine("C/A", rC, pc));
    } else {
      ok = false;
      lines.push("need origin + A-B-C to measure Fib proof");
    }
  } else if (pattern === "triangle") {
    const legs = pickLetters(pivots, ["A", "B", "C", "D", "E"]);
    if (legs.length === 5) {
      const names = ["A", "B", "C", "D", "E"];
      const o = origin ?? legs[0]!;
      for (let i = 1; i < legs.length; i++) {
        const prior = i === 1 ? len(o, legs[0]!) : len(legs[i - 2]!, legs[i - 1]!);
        const r = prior > 0 ? len(legs[i - 1]!, legs[i]!) / prior : 0;
        if (!pairOk(r, POCKET.tri)) ok = false;
        lines.push(pairLine(`${names[i]}/${names[i - 1]}`, r, POCKET.tri));
      }
    } else {
      ok = false;
      lines.push("need A–E to measure Fib proof");
    }
  } else if (pattern === "combination") {
    const legs = pickLetters(pivots, ["W", "X", "Y"]);
    if (legs.length === 3 && origin) {
      const [w, x, y] = legs;
      const lW = len(origin, w);
      const rX = lW > 0 ? len(w, x) / lW : 0;
      const rY = lW > 0 ? len(x, y) / lW : 0;
      ok = pairOk(rX, POCKET.x) && pairOk(rY, POCKET.y);
      lines.push(pairLine("X/W", rX, POCKET.x), pairLine("Y/W", rY, POCKET.y));
    } else {
      ok = false;
      lines.push("need origin + W-X-Y to measure Fib proof");
    }
  } else {
    return [];
  }

  return [
    rule(
      "F7",
      ok,
      ok
        ? `Fib proof holds (${lines.join("; ")}).`
        : `Wave + Fib are one proof. Off-catalog or unmeasured: ${lines.join("; ")}.`,
      "flagged",
    ),
  ];
}

const PRICE_NEAR = 0.02;
const SPAN_FRAC = 0.5;

export type WaveFibRow = {
  /** e.g. "2/1", "B/A", "C/B", "X/W" */
  pair: string;
  /** Ratio as percent of parent (61.8 = 61.8% of parent). */
  pct: number;
  onCatalog: boolean;
};

/**
 * Per-wave Fib derivation for an actual proposed count — the same legs and
 * pockets as the F7 rule, returned as structured rows so the desk can SHOW
 * each wave's ratio (Analysis rows, chat bubble, detail-stage context)
 * instead of only surfacing ratios when F7 fails.
 */
export function waveFibTable(pivots: WavePivot[], pattern: WavePattern): WaveFibRow[] {
  const origin = findOrigin(pivots);
  const row = (pair: string, value: number, pockets: number[]): WaveFibRow => ({
    pair,
    pct: Math.round(value * 1000) / 10,
    onCatalog: pairOk(value, pockets),
  });
  if (pattern === "impulse" || pattern === "diagonal") {
    const legs = pickImpulse(pivots);
    if (legs.length !== 5 || !origin) return [];
    const [w1, w2, w3, w4, w5] = legs;
    const l1 = len(origin, w1);
    const l3 = len(w2, w3);
    const l4 = len(w3, w4);
    const r5of1 = l1 > 0 ? len(w4, w5) / l1 : 0;
    const r5of4 = l4 > 0 ? len(w4, w5) / l4 : 0;
    return [
      row("2/1", l1 > 0 ? len(w1, w2) / l1 : 0, POCKET.two),
      row("3/1", l1 > 0 ? len(w2, w3) / l1 : 0, POCKET.three),
      row("4/3", l3 > 0 ? len(w3, w4) / l3 : 0, POCKET.four),
      { ...row("5", r5of1, POCKET.five), onCatalog: pairOk(r5of1, POCKET.five) || pairOk(r5of4, POCKET.five) },
    ];
  }
  if (pattern === "zigzag" || pattern === "flat") {
    const abc = pickAbc(pivots);
    if (abc.length !== 3 || !origin) return [];
    const [a, b, c] = abc;
    const lA = len(origin, a);
    return [
      row("B/A", lA > 0 ? len(a, b) / lA : 0, pattern === "flat" ? POCKET.flatB : POCKET.zigzagB),
      row("C/A", lA > 0 ? len(b, c) / lA : 0, pattern === "flat" ? POCKET.flatC : POCKET.zigzagC),
    ];
  }
  if (pattern === "triangle") {
    const legs = pickLetters(pivots, ["A", "B", "C", "D", "E"]);
    if (legs.length !== 5) return [];
    const names = ["A", "B", "C", "D", "E"];
    const o = origin ?? legs[0]!;
    const out: WaveFibRow[] = [];
    for (let i = 1; i < legs.length; i++) {
      const prior = i === 1 ? len(o, legs[0]!) : len(legs[i - 2]!, legs[i - 1]!);
      out.push(row(`${names[i]}/${names[i - 1]}`, prior > 0 ? len(legs[i - 1]!, legs[i]!) / prior : 0, POCKET.tri));
    }
    return out;
  }
  if (pattern === "combination") {
    const legs = pickLetters(pivots, ["W", "X", "Y"]);
    if (legs.length !== 3 || !origin) return [];
    const [w, x, y] = legs;
    const lW = len(origin, w);
    return [row("X/W", lW > 0 ? len(w, x) / lW : 0, POCKET.x), row("Y/W", lW > 0 ? len(x, y) / lW : 0, POCKET.y)];
  }
  return [];
}

/** Compact one-line proof for chat/panels: "2/1 61.8% · 3/1 168% · 4/3 45.2%". */
export function waveFibLine(pivots: WavePivot[], pattern: WavePattern): string {
  const rows = waveFibTable(pivots, pattern);
  if (!rows.length) return "";
  return rows.map((r) => `${r.pair} ${r.pct}%${r.onCatalog ? "" : "?"}`).join(" · ");
}

function nearRel(a: number, b: number): boolean {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom <= PRICE_NEAR;
}

/** Printed 0–5 / ABC must cover the measured working range — not a last-swing sketch. */
export function spanRules(printed: WavePivot[], bounds?: MeasureBounds): RuleResult[] {
  if (!bounds || printed.length < 2) return [];
  const hitsHigh = printed.some((p) => nearRel(p.price, bounds.high));
  const hitsLow = printed.some((p) => nearRel(p.price, bounds.low));
  if (hitsHigh && hitsLow) {
    return [rule("S5", true, "Printed count includes both working-range extremes.", "flagged")];
  }
  const r0 = parseTime(bounds.highT);
  const r1 = parseTime(bounds.lowT);
  const t0 = Math.min(...printed.map((p) => p.time));
  const t1 = Math.max(...printed.map((p) => p.time));
  const rangeSpan = r0 != null && r1 != null ? Math.abs(r1 - r0) : 0;
  const countSpan = t1 - t0;
  const spanOk = (hitsHigh || hitsLow) && rangeSpan > 0 && countSpan >= rangeSpan * SPAN_FRAC;
  return [
    rule(
      "S5",
      spanOk,
      spanOk
        ? "Printed count spans most of the working range."
        : `Map is a local sketch. Label both working-range extremes (${bounds.highT} ${bounds.high} and ${bounds.lowT} ${bounds.low}) or span most of that range.`,
      "flagged",
    ),
  ];
}

const WEEK = 7 * 86_400;

function isoToTime(t: string): number | undefined {
  const ms = Date.parse(t.includes("T") ? t : `${t}T00:00:00Z`);
  return Number.isFinite(ms) ? ms / 1000 : undefined;
}

function nearPrice(a: number, b: number, frac = 0.008): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) < frac;
}

/** Live legs after the last printed parent — last print may start the line (HUBS C → (i)). */
export function pathTowardLast(
  path: WavePivot[],
  lastPrinted?: WavePivot,
  lastBar?: { time: number; c: number },
): boolean {
  if (path.length < 2) return false;
  const after = lastPrinted
    ? path.filter((p) => p.time > lastPrinted.time && !nearPrice(p.price, lastPrinted.price))
    : path;
  if (after.length < 2) return false;
  if (lastPrinted && lastBar && lastBar.time - lastPrinted.time > 14 * 86_400) {
    const onTape = after.some((p) => p.time <= lastBar.time + WEEK);
    const nearNow = after.some((p) => nearPrice(p.price, lastBar.c, 0.08));
    if (!onTape && !nearNow) return false;
  }
  return true;
}

function structuralRules(
  longPivots: WavePivot[],
  shortPivots: WavePivot[],
  printed: WavePivot[],
  lastBar?: { time: number; c: number },
): RuleResult[] {
  const two = longPivots.length > 0 && shortPivots.length > 0;
  const altCopy =
    two &&
    longPivots.length === shortPivots.length &&
    longPivots.every((p, i) => p.price === shortPivots[i]?.price);
  const mixedForecast = printed.some((p) => p.kind === "forecast-up" || p.kind === "forecast-down");
  const lastPrinted = printed[printed.length - 1];
  const complete =
    pathTowardLast(longPivots, lastPrinted, lastBar) && pathTowardLast(shortPivots, lastPrinted, lastBar);
  return [
    rule("S1", two, two ? "Two forward paths present." : "Need both Long and Short paths.", "flagged"),
    rule("S2", two && !altCopy, altCopy ? "Alternate path is a copy of Long." : two ? "Alternate path preserved." : "Alternate path missing.", "flagged"),
    rule("S3", !mixedForecast, mixedForecast ? "Forecast labels mixed into the printed count." : "Printed count stays on its pane.", "flagged"),
    rule(
      "S6",
      complete,
      complete
        ? "Long and Short complete toward the last print."
        : "Long and Short must be full paths from the last printed label toward the last bar. Do not park one label on 5 / C — emit the printed legs already on the tape, then the next Fib legs.",
      "flagged",
    ),
  ];
}

/** Long labeled (i)–(v) / 1–5 must hold impulse shape from the last print. Flag only. */
function pathMotiveRules(longPivots: WavePivot[], lastPrinted?: WavePivot): RuleResult[] {
  const legs = pickMotive(longPivots);
  if (legs.length !== 5) return [];
  const origin = lastPrinted && !legs.some((p) => p.time === lastPrinted.time && nearPrice(p.price, lastPrinted.price))
    ? lastPrinted
    : findOrigin(longPivots) ?? lastPrinted;
  const m = measureMotive(legs, origin);
  const ok = !m.w3Shortest && m.exceeded && !m.w2ThroughOrigin;
  return [
    rule(
      "S8",
      ok,
      ok
        ? "Long five holds impulse shape from the last print."
        : "Long labeled as a five is not a cash impulse — (iii) does not exceed (i), or wave 3 is shortest. Name a three or leave unresolved.",
      "flagged",
    ),
  ];
}

/** Zigzag / flat C nest must actually prove a five. Missing nest stays S4; a broken five flags S9. */
function nestMotiveRules(
  internals: WavePivot[] | undefined,
  printed: WavePivot[],
  pattern: WavePattern,
  reason?: string,
): RuleResult[] {
  if (pattern !== "zigzag" && pattern !== "flat") return [];
  if (reason && C_IS_THREE.test(reason)) return [];
  const nest = (internals ?? []).filter((p) => internalParent(p.label) === "C");
  const legs = pickMotive(nest);
  if (legs.length !== 5) return [];
  const abc = pickAbc(printed);
  const origin = abc.find((p) => abcIndex(p.label) === "B") ?? findOrigin(printed);
  const m = measureMotive(legs, origin);
  const ok = !m.w3Shortest && !m.overlap;
  return [
    rule(
      "S9",
      ok,
      ok
        ? "C internals hold impulse type-proof."
        : m.w3Shortest
          ? "C internals are not a cash five — wave 3 is the shortest of i / iii / v."
          : "C internals overlap i and iv — name a diagonal or a three, not a cash impulse.",
      "flagged",
    ),
  ];
}

function internalParent(label: string): string {
  const i = label.lastIndexOf("/");
  return i >= 0 ? label.slice(i + 1).replace(/[()]/g, "").toUpperCase() : "";
}

function hasParentNest(internals: WavePivot[] | undefined, parent: string): boolean {
  if (!internals?.length) return false;
  const want = parent.toUpperCase();
  return internals.some((p) => internalParent(p.label) === want);
}

function childStem(label: string): string {
  return label.split("/")[0]?.replace(/[()]/g, "").toLowerCase() ?? "";
}

function nestFamily(internals: WavePivot[] | undefined, parent: string): "motive" | "corrective" | "none" {
  const kids = (internals ?? []).filter((p) => internalParent(p.label) === parent.toUpperCase());
  if (!kids.length) return "none";
  const stems = kids.map((p) => childStem(p.label));
  if (stems.some((s) => ["i", "ii", "iii", "iv", "v"].includes(s))) return "motive";
  if (stems.some((s) => ["a", "b", "c"].includes(s))) return "corrective";
  if (kids.some((p) => p.kind === "corrective")) return "corrective";
  if (kids.some((p) => p.kind === "impulse")) return "motive";
  return "none";
}

const C_IS_THREE = /\bc\b.{0,24}\bthree\b|\bthree\b.{0,16}\bc\b|do not (?:force|5-count)/i;

function internalRules(
  internals: WavePivot[] | undefined,
  pattern: WavePattern,
  reason?: string,
  opts?: { typeProof?: boolean },
): RuleResult[] {
  const out: RuleResult[] = [];
  const typeProof = opts?.typeProof !== false;
  if (typeProof && pattern === "impulse") {
    const nested = hasParentNest(internals, "1") && hasParentNest(internals, "3") && hasParentNest(internals, "5");
    out.push(
      rule(
        "S4",
        nested,
        nested ? "Motive legs 1/3/5 have subwaves." : "Impulse missing i–v under 1, 3, or 5. Skeleton only — finer swings unused.",
        "flagged",
      ),
    );
    const f2 = nestFamily(internals, "2");
    const f4 = nestFamily(internals, "4");
    const named2 = Boolean(reason && /wave\s*2.{0,48}(zigzag|flat|three|a-b-c|abc)/i.test(reason));
    const named4 = Boolean(reason && /wave\s*4.{0,48}(zigzag|flat|three|triangle|a-b-c|abc)/i.test(reason));
    const pair =
      (f2 === "corrective" || named2) && (f4 === "corrective" || named4) && f2 !== "motive" && f4 !== "motive";
    out.push(
      rule(
        "S10",
        pair,
        pair
          ? "Waves 2 and 4 are matching corrections (a-b-c, not another 1–5)."
          : "Every motive needs its correction: nest a-b-c under 2 (corrects 1) and 4 (corrects 3). Do not nest i–v under 2 or 4.",
        "flagged",
      ),
    );
    const w3diag = Boolean(reason && /wave\s*3.{0,28}diagonal/i.test(reason));
    out.push(
      rule(
        "S11",
        !w3diag,
        w3diag ? "Wave 3 is never a diagonal. Name an impulse for 3." : "Wave 3 is not labeled as a diagonal.",
        "flagged",
      ),
    );
  } else if (typeProof && pattern === "diagonal") {
    const f2 = nestFamily(internals, "2");
    const f4 = nestFamily(internals, "4");
    const named2 = Boolean(reason && /wave\s*2.{0,48}(zigzag|zz)/i.test(reason));
    const named4 = Boolean(reason && /wave\s*4.{0,48}(zigzag|zz)/i.test(reason));
    const pair =
      (f2 === "corrective" || named2) && (f4 === "corrective" || named4) && f2 !== "motive" && f4 !== "motive";
    out.push(
      rule(
        "S10",
        pair,
        pair
          ? "Diagonal 2 and 4 are zigzag-family corrections."
          : "A diagonal’s 2 and 4 are zigzags of the same degree. Nest a-b-c under both, or name them in reason.",
        "flagged",
      ),
    );
  } else if (typeProof && pattern === "triangle") {
    const nested =
      hasParentNest(internals, "A") || hasParentNest(internals, "C") || hasParentNest(internals, "E");
    out.push(
      rule(
        "S4",
        nested,
        nested ? "Triangle has a nested three." : "Triangle missing a-b-c under A, C, or E. Skeleton only.",
        "flagged",
      ),
    );
  } else if (typeProof && (pattern === "zigzag" || pattern === "flat")) {
    const cThree = Boolean(reason && C_IS_THREE.test(reason));
    const cNest = hasParentNest(internals, "C");
    const ok = cNest || cThree;
    out.push(
      rule(
        "S4",
        ok,
        cThree
          ? "C stays a three — no forced 5-count."
          : cNest
            ? "C has type-proof internals."
            : `${pattern === "flat" ? "Flat" : "Zigzag"} C has no i–v. Say C is a three, or nest from the finer list.`,
        "flagged",
      ),
    );
    const famB = nestFamily(internals, "B");
    const namedB = Boolean(reason && /wave\s*b.{0,48}(zigzag|flat|three|triangle|a-b-c|abc)|b\s+is\s+a\s+(zigzag|flat|three)/i.test(reason));
    const bPair = (famB === "corrective" || namedB) && famB !== "motive";
    out.push(
      rule(
        "S10",
        bPair,
        bPair
          ? "B is the matching correction of A."
          : "A is a motive (or three). B must be its matching correction — nest a-b-c under B, or name B’s pattern in reason.",
        "flagged",
      ),
    );
  } else if (typeProof && pattern === "combination") {
    const fW = nestFamily(internals, "W");
    const fX = nestFamily(internals, "X");
    const fY = nestFamily(internals, "Y");
    const familyNamed = Boolean(
      reason &&
        ((/\bsharp\b/i.test(reason) && /double\s+zigzag/i.test(reason)) ||
          (/\bsideways\b/i.test(reason) && /double\s+three/i.test(reason))),
    );
    const namedW = Boolean(
      reason && (/wave\s*w.{0,48}(zigzag|zz|flat|three|a-b-c|abc)|\bw\s+is\s+a\s+(zigzag|flat|three)|\bw\s+and\s+y\s+are\s+/i.test(reason) || familyNamed),
    );
    const namedY = Boolean(
      reason && (/wave\s*y.{0,48}(zigzag|zz|flat|three|a-b-c|abc)|\by\s+is\s+a\s+(zigzag|flat|three)|\bw\s+and\s+y\s+are\s+/i.test(reason) || familyNamed),
    );
    const namedX = Boolean(
      reason &&
        (/wave\s*x.{0,48}(zigzag|flat|three|triangle|a-b-c|abc)|\bx\s+is\s+a\s+(zigzag|flat|three|triangle)/i.test(reason) ||
          familyNamed),
    );
    const wOk = fW !== "none" || namedW;
    const yOk = fY !== "none" || namedY;
    out.push(
      rule(
        "S4",
        wOk && yOk,
        wOk && yOk
          ? "Combination W and Y have type-proof nests."
          : "Combination missing a-b-c under W or Y. Name them as zigzag / three in reason, or nest from the finer list.",
        "flagged",
      ),
    );
    const pair =
      (fW === "corrective" || namedW) &&
      (fY === "corrective" || namedY) &&
      (fX === "corrective" || namedX) &&
      fW !== "motive" &&
      fY !== "motive" &&
      fX !== "motive";
    out.push(
      rule(
        "S10",
        pair,
        pair
          ? "W and Y are matching zigzags / threes; X is the connecting three."
          : "W and Y nest a-b-c (not i–v). X is a three — nest a-b-c under X, or name W / X / Y in reason.",
        "flagged",
      ),
    );
  }
  if (internals && internals.length > 1) {
    const times = internals.map((p) => p.time);
    const ordered = times.every((t, i) => i === 0 || t > times[i - 1]!);
    out.push(
      rule(
        "I1",
        ordered,
        ordered ? "Subwaves are chronological." : "Subwaves must be strictly later each step (no shared dates).",
        "flagged",
      ),
    );
  }
  return out;
}

export function validatePivots(
  pivots: WavePivot[],
  pattern: WavePattern | "impulse" | "corrective" = "impulse",
): ValidationResult {
  const resolved: WavePattern = pattern === "corrective" ? "zigzag" : pattern;
  const inferred: WaveShape | undefined =
    resolved === "triangle"
      ? inferTriangleShape(pickLetters(pivots, ["A", "B", "C", "D", "E"]))
      : resolved === "diagonal"
        ? inferDiagonalShape(motiveLegs(pivots))
        : undefined;
  const rules = [
    ...schemaRules(pivots, true, false),
    ...alternationRules(pivots),
    ...elliottRules(pivots, resolved, "", inferred),
    ...guideFlags(pivots, resolved, inferred),
    ...fibProofRules(pivots, resolved),
  ];
  const severity = worst(rules);
  return { severity, reasonClass: reasonOf(rules), rules };
}

export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(body.slice(start, end + 1));
}

function parseSide(raw: unknown): { side: Proposal["long"] | null; stringPrice: boolean } {
  if (!raw || typeof raw !== "object") return { side: null, stringPrice: false };
  const o = raw as Record<string, unknown>;
  const target = typeof o.target === "string" ? Number(o.target) : o.target;
  const invalidation = typeof o.invalidation === "string" ? Number(o.invalidation) : o.invalidation;
  const stringPrice = typeof o.target === "string" || typeof o.invalidation === "string";
  const pivots = Array.isArray(o.pivots) ? o.pivots.map(parsePivot).filter((p): p is WavePivot => p != null) : [];
  if (!isNum(target) || !isNum(invalidation)) return { side: null, stringPrice };
  return { side: { pivots, target, invalidation }, stringPrice };
}

export function parseProposal(raw: unknown, opts?: { lanes?: "required" | "optional" }): { proposal: Proposal | null; stringPrice: boolean } {
  if (!raw || typeof raw !== "object") return { proposal: null, stringPrice: false };
  const o = raw as Record<string, unknown>;
  if (o.status === "unresolved") {
    const pattern = resolvePattern(o) ?? "unresolved";
    return {
      proposal: {
        status: "unresolved",
        reason: typeof o.reason === "string" ? o.reason : "unresolved",
        pattern,
        structure: structureOf(pattern),
        degree: typeof o.degree === "string" ? o.degree : undefined,
        pivots: [],
        long: { pivots: [], target: 0, invalidation: 0 },
        short: { pivots: [], target: 0, invalidation: 0 },
      },
      stringPrice: false,
    };
  }
  const pattern = resolvePattern(o);
  if (!pattern || pattern === "unresolved") return { proposal: null, stringPrice: false };
  const structure = structureOf(pattern);
  let stringPrice = false;
  const pivots: WavePivot[] = [];
  if (Array.isArray(o.pivots)) {
    for (const row of o.pivots) {
      if (row && typeof row === "object" && typeof (row as { price?: unknown }).price === "string") stringPrice = true;
      const p = parsePivot(row);
      if (p) pivots.push(p);
    }
  }
  const origin = o.origin ? parsePivot(o.origin) : undefined;
  if (origin && typeof (o.origin as { price?: unknown }).price === "string") stringPrice = true;
  const long = parseSide(o.long);
  const short = parseSide(o.short);
  if (long.stringPrice || short.stringPrice) stringPrice = true;
  const lanesOptional = opts?.lanes === "optional";
  if ((!long.side || !short.side) && !lanesOptional) return { proposal: null, stringPrice };
  const decision = o.decision && typeof o.decision === "object" ? (o.decision as Proposal["decision"]) : undefined;
  const hold = o.hold && typeof o.hold === "object" ? (o.hold as Proposal["hold"]) : undefined;
  const weights = o.weights && typeof o.weights === "object" ? (o.weights as Proposal["weights"]) : undefined;
  const internals: WavePivot[] = [];
  if (Array.isArray(o.internals)) {
    for (const row of o.internals) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      if (typeof rec.price === "string") stringPrice = true;
      const parent = typeof rec.parent === "string" ? rec.parent.trim() : "";
      const parsed = parsePivot(row);
      if (!parsed) continue;
      const label = parent && !parsed.label.includes("/") ? `${parsed.label}/${parent}` : parsed.label;
      internals.push({ ...parsed, label });
    }
  }
  const macro: WavePivot[] = [];
  if (Array.isArray(o.macro)) {
    for (const row of o.macro) {
      if (row && typeof row === "object" && typeof (row as { price?: unknown }).price === "string") stringPrice = true;
      const p = parsePivot(row);
      if (p) macro.push(p);
    }
  }
  return {
    proposal: {
      status: "ok",
      reason: typeof o.reason === "string" ? o.reason : undefined,
      pattern,
      structure,
      shape: o.shape === "expanding" || o.shape === "contracting" ? o.shape : undefined,
      degree: typeof o.degree === "string" && o.degree.trim() ? o.degree.trim() : undefined,
      origin: origin ?? undefined,
      pivots,
      macro: macro.length ? macro : undefined,
      internals: internals.length ? internals : undefined,
      hold,
      long: long.side ?? { pivots: [], target: 0, invalidation: 0 },
      short: short.side ?? { pivots: [], target: 0, invalidation: 0 },
      decision,
      weights,
    },
    stringPrice,
  };
}

export function validateProposal(raw: unknown, opts?: ValidateOpts): ValidationResult & { proposal?: Proposal } {
  const parsed = parseProposal(raw, { lanes: opts?.lanes });
  if (!parsed.proposal) {
    const rules = [rule("P1", false, "Proposal JSON did not match the schema.", "rejected")];
    return { severity: "rejected", reasonClass: "malformed_output", rules };
  }
  if (parsed.proposal.status === "unresolved") {
    const rules = [rule("P1", false, parsed.proposal.reason || "Model abstained.", "rejected")];
    return { severity: "rejected", reasonClass: "malformed_output", rules, proposal: parsed.proposal };
  }

  const printed = [...(parsed.proposal.origin ? [parsed.proposal.origin] : []), ...parsed.proposal.pivots];
  const lastPrinted = printed[printed.length - 1];
  const lastTime = opts?.last ? isoToTime(opts.last.t) : undefined;
  const lastBar = opts?.last && lastTime != null ? { time: lastTime, c: opts.last.c } : undefined;
  // Map stage (lanes optional + both sides empty): the proposal is the
  // macro + working degree. Lane rules would flag "need both paths" on
  // sides that do not exist yet — scenarios are built after Confirm.
  // Nest stage: lock Propose may omit internals; S4/S10 wait for Map analysis.
  const mapStage = opts?.lanes === "optional" && !parsed.proposal.long.pivots.length && !parsed.proposal.short.pivots.length;
  const nestStage = opts?.nests === "optional" && !parsed.proposal.internals?.length;
  const scopedNest = opts?.nests === "optional";

  const rules = [
    ...schemaRules(printed, true, parsed.stringPrice),
    ...alternationRules(printed),
    ...elliottRules(
      printed,
      parsed.proposal.pattern,
      [parsed.proposal.degree, parsed.proposal.reason].filter(Boolean).join(" "),
      parsed.proposal.shape,
    ),
    ...guideFlags(printed, parsed.proposal.pattern, parsed.proposal.shape),
    ...(mapStage
      ? []
      : killRules(parsed.proposal.long.invalidation, parsed.proposal.short.invalidation)),
    ...fibRules(printed, parsed.proposal.structure, {
      hold: parsed.proposal.hold?.price,
      longTarget: mapStage ? undefined : parsed.proposal.long.target,
      shortTarget: mapStage ? undefined : parsed.proposal.short.target,
      anchors: mapStage ? printed : [...printed, ...parsed.proposal.long.pivots, ...parsed.proposal.short.pivots],
    }),
    ...fibProofRules(printed, parsed.proposal.pattern),
    ...(mapStage
      ? []
      : structuralRules(parsed.proposal.long.pivots, parsed.proposal.short.pivots, printed, lastBar)),
    ...(nestStage
      ? []
      : internalRules(parsed.proposal.internals, parsed.proposal.pattern, parsed.proposal.reason, {
          typeProof: !scopedNest,
        })),
    ...(mapStage ? [] : pathMotiveRules(parsed.proposal.long.pivots, lastPrinted)),
    ...(nestStage || scopedNest
      ? []
      : nestMotiveRules(parsed.proposal.internals, printed, parsed.proposal.pattern, parsed.proposal.reason)),
    ...spanRules(printed, opts?.range),
    ...stackRules(parsed.proposal.macro, printed, parsed.proposal.reason, parsed.proposal.degree),
  ];
  const severity = worst(rules);
  return { severity, reasonClass: reasonOf(rules), rules, proposal: parsed.proposal };
}

const MACRO_NAMED = /working degree is the macro|this (map|lock|propose) is the macro|no larger degree on this tape/i;

/** Fractal stack: macro motive/corrective contains micro motive/corrective. */
function stackRules(
  macro: WavePivot[] | undefined,
  printed: WavePivot[],
  reason?: string,
  degree?: string,
): RuleResult[] {
  const ctx = `${degree ?? ""} ${reason ?? ""}`;
  if (!macro?.length) {
    const named = MACRO_NAMED.test(ctx);
    return [
      rule(
        "S12",
        named,
        named
          ? "Working degree is the macro for this lock."
          : "Elliott is fractal. Emit macro pivots for the larger motive/corrective, or say in reason that this lock is the macro.",
        "flagged",
      ),
    ];
  }
  const n = macro.length;
  const countOk = n >= 3;
  const t0 = Math.min(...macro.map((p) => p.time));
  const t1 = Math.max(...macro.map((p) => p.time));
  const inside =
    printed.length === 0 ||
    printed.every((p) => p.time >= t0 - 1 && p.time <= t1 + 7 * 86_400 * 8);
  const ok = countOk && inside;
  return [
    rule(
      "S12",
      ok,
      ok
        ? `Macro layer drawn (${n} pivots); working micro sits inside it.`
        : !countOk
          ? "Macro layer needs a full motive (1–5) or corrective (A-B-C) of the larger degree."
          : "Working (micro) pivots must sit in time inside the macro wave they belong to.",
      "flagged",
    ),
  ];
}

export function caveats(result: ValidationResult): string[] {
  return result.rules.filter((r) => !r.pass).map((r) => `${r.id}: ${r.message}`);
}

/**
 * Chronology + zigzag checks (P2/P5 core) without any pattern rules —
 * used by the staged macro pass, where a 3-pivot skeleton must not be
 * held to complete-set rules like H3.
 */
export function zigzagChainIssues(pivots: WavePivot[]): string[] {
  const out: string[] = [];
  const times = pivots.map((p) => p.time);
  const dup = new Set(times).size !== times.length;
  const ordered = times.every((t, i) => i === 0 || t > times[i - 1]!);
  if (!ordered || dup) {
    out.push("P2: Pivots must be chronological with no duplicate times.");
  }
  for (let i = 1; i < pivots.length; i++) {
    const a = pivots[i - 1]!;
    const b = pivots[i]!;
    if (a.anchor === b.anchor) {
      out.push("P5: Anchors must alternate high/low — two same-anchor pivots in a row is not a wave structure.");
      break;
    }
    if (b.anchor === "high" ? b.price <= a.price : b.price >= a.price) {
      out.push("P5: Each swing must move in its anchor's direction.");
      break;
    }
  }
  return out;
}

/** Fib proof + matching correction — Confirm needs these, or an explicit ack. */
export const PROOF_IDS = ["F7", "S10"] as const;

export function proofGaps(notes: string[]): string[] {
  return notes.filter((n) => n.startsWith("F7:") || n.startsWith("S10:"));
}
