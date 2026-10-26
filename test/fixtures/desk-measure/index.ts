/**
 * Verbatim copy of the TradeCharts desk measure, for swing-agreement checks.
 * Source: C:\Users\dean\Projects\tradecharts\src\lib\measure\index.ts
 * Desk commit: 383525b (2026-10-26).
 * Only change: the two import paths below now point at the local
 * ./pivots.js and ./types.js copies in this directory (the desk originals
 * live at ../pivots and ../../types with bundler-style specifiers).
 *
 * Deterministic measure packet for Propose-map.
 * Runs before any provider call. No wave labels here — swings and Fib only.
 *
 * Spec: docs/ADD-SYMBOL.md §4 step 7, docs/AI-ACTIVATION.md step 2.
 */

import { fibLines } from "./pivots.js";
import type { Bar, FibLine, Interval } from "./types.js";

export const MIN_WEEKLY_BARS = 52;
export const MIN_SWINGS = 4;

export type Swing = {
  t: string;
  time: number;
  price: number;
  kind: "high" | "low";
};

export type WorkingRange = {
  high: number;
  low: number;
  highT: string;
  lowT: string;
  /** High then low = crash / C. Low then high = impulse up. */
  bias: "up" | "down";
};

export type MeasureOk = {
  ok: true;
  interval: Interval;
  barsCount: number;
  last: { t: string; o: number; h: number; l: number; c: number };
  atr: number;
  swings: Swing[];
  /** Finer zig-zag for i–v / a-b-c under each parent. Never invent off this list. */
  detail: Swing[];
  range: WorkingRange;
  fib: FibLine[];
};

export type MeasureFail = {
  ok: false;
  reason: "too-short" | "no-swings";
};

export type MeasurePacket = MeasureOk | MeasureFail;

export type MeasureOpts = {
  minBars?: number;
  minSwings?: number;
  lookback?: number;
  atrPeriod?: number;
  minAtrMult?: number;
};

function trueRange(bar: Bar, prev: Bar): number {
  return Math.max(bar.h - bar.l, Math.abs(bar.h - prev.c), Math.abs(bar.l - prev.c));
}

/** Wilder ATR. Returns 0 if the tape is shorter than period + 1. */
export function wilderAtr(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRange(bars[i], bars[i - 1]);
  let atr = sum / period;
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + trueRange(bars[i], bars[i - 1])) / period;
  }
  return atr;
}

function isSwingHigh(bars: Bar[], i: number, lookback: number): boolean {
  const h = bars[i].h;
  for (let j = i - lookback; j <= i + lookback; j++) {
    if (j === i) continue;
    if (bars[j].h > h) return false;
  }
  return bars[i - lookback].h < h || bars[i + lookback].h < h;
}

function isSwingLow(bars: Bar[], i: number, lookback: number): boolean {
  const l = bars[i].l;
  for (let j = i - lookback; j <= i + lookback; j++) {
    if (j === i) continue;
    if (bars[j].l < l) return false;
  }
  return bars[i - lookback].l > l || bars[i + lookback].l > l;
}

function collapseSameKind(raw: Swing[]): Swing[] {
  if (!raw.length) return [];
  const out: Swing[] = [{ ...raw[0] }];
  for (let i = 1; i < raw.length; i++) {
    const s = raw[i];
    const last = out[out.length - 1];
    if (s.kind === last.kind) {
      if (s.kind === "high" && s.price >= last.price) out[out.length - 1] = s;
      else if (s.kind === "low" && s.price <= last.price) out[out.length - 1] = s;
    } else {
      out.push(s);
    }
  }
  return out;
}

/** Fractal swings, then zigzag, then drop legs smaller than k × ATR. */
export function findSwings(bars: Bar[], opts?: { lookback?: number; atr?: number; minAtrMult?: number }): Swing[] {
  const lookback = opts?.lookback ?? 2;
  const atr = opts?.atr ?? 0;
  const k = opts?.minAtrMult ?? 0.5;
  if (bars.length < lookback * 2 + 1) return [];

  const raw: Swing[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    if (isSwingHigh(bars, i, lookback)) {
      raw.push({ t: bars[i].t, time: bars[i].time, price: bars[i].h, kind: "high" });
    }
    if (isSwingLow(bars, i, lookback)) {
      raw.push({ t: bars[i].t, time: bars[i].time, price: bars[i].l, kind: "low" });
    }
  }
  raw.sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind));

  let swings = collapseSameKind(pinEnds(bars, raw));
  if (atr > 0 && k > 0 && swings.length >= 2) {
    const kept: Swing[] = [swings[0]];
    for (let i = 1; i < swings.length; i++) {
      const s = swings[i];
      const prev = kept[kept.length - 1];
      const move = Math.abs(s.price - prev.price);
      if (s.kind === prev.kind) {
        if (s.kind === "high" && s.price >= prev.price) kept[kept.length - 1] = s;
        if (s.kind === "low" && s.price <= prev.price) kept[kept.length - 1] = s;
        continue;
      }
      if (move >= k * atr) kept.push(s);
    }
    swings = collapseSameKind(kept);
  }
  return swings;
}


/** Fractals miss the first/last `lookback` bars. Pin tape ends so the live print is in the packet. */
function pinEnds(bars: Bar[], swings: Swing[]): Swing[] {
  if (!bars.length) return swings;
  const first = bars[0];
  const last = bars[bars.length - 1];
  const out = [...swings];

  if (!out.length || out[0].time > first.time) {
    const next = out[0];
    const kind: Swing["kind"] = !next ? (first.h - first.o >= first.o - first.l ? "high" : "low") : next.kind === "high" ? "low" : "high";
    out.unshift({
      t: first.t,
      time: first.time,
      price: kind === "high" ? first.h : first.l,
      kind,
    });
  }

  const tail = out[out.length - 1];
  if (tail && tail.time < last.time) {
    if (tail.kind === "high") {
      if (last.l < tail.price) out.push({ t: last.t, time: last.time, price: last.l, kind: "low" });
      else if (last.h > tail.price) out[out.length - 1] = { t: last.t, time: last.time, price: last.h, kind: "high" };
    } else if (last.h > tail.price) {
      out.push({ t: last.t, time: last.time, price: last.h, kind: "high" });
    } else if (last.l < tail.price) {
      out[out.length - 1] = { t: last.t, time: last.time, price: last.l, kind: "low" };
    }
  }
  return out;
}
export function workingRange(swings: Swing[]): WorkingRange | null {
  if (swings.length < 2) return null;
  let hi = swings[0];
  let lo = swings[0];
  for (const s of swings) {
    if (s.kind === "high" && s.price >= hi.price) hi = s;
    if (s.kind === "low" && s.price <= lo.price) lo = s;
  }
  if (hi.kind !== "high" || lo.kind !== "low") return null;
  if (hi.price <= lo.price) return null;
  return {
    high: hi.price,
    low: lo.price,
    highT: hi.t,
    lowT: lo.t,
    bias: hi.time <= lo.time ? "down" : "up",
  };
}

function minBarsFor(interval: Interval): number {
  if (interval === "60m") return 80;
  if (interval === "1d") return 60;
  if (interval === "1mo") return 24;
  return MIN_WEEKLY_BARS;
}

/** Measure packet for Propose-map. Fail closed if the tape is too short or swings cannot form. */
export function measureTape(bars: Bar[], interval: Interval = "1wk", opts?: MeasureOpts): MeasurePacket {
  const minBars = opts?.minBars ?? minBarsFor(interval);
  const minSwings = opts?.minSwings ?? MIN_SWINGS;
  const last = bars[bars.length - 1];
  if (!last || bars.length < minBars) return { ok: false, reason: "too-short" };

  const atr = wilderAtr(bars, opts?.atrPeriod ?? 14);
  const swings = findSwings(bars, {
    lookback: opts?.lookback ?? 2,
    atr,
    minAtrMult: opts?.minAtrMult ?? 0.5,
  });
  const range = workingRange(swings);
  if (!range || swings.length < minSwings) return { ok: false, reason: "no-swings" };

  const finer = findSwings(bars, {
    lookback: 1,
    atr,
    minAtrMult: 0.25,
  });
  const detail = finer.length > swings.length ? finer.slice(0, 80) : swings;

  return {
    ok: true,
    interval,
    barsCount: bars.length,
    last: { t: last.t, o: last.o, h: last.h, l: last.l, c: last.c },
    atr,
    swings,
    detail,
    range,
    fib: fibLines(range.high, range.low),
  };
}

/** Finer zig-zag inside one date window. Lock Propose caps detail at 80 from tape start — a late Macro 4→5 is not in that list. */
export function detailSwingsInWindow(bars: Bar[], fromT: number, toT: number, atr: number): Swing[] {
  const lo = Math.min(fromT, toT);
  const hi = Math.max(fromT, toT);
  const win = bars.filter((b) => b.time >= lo && b.time <= hi);
  if (win.length < 3) return [];
  return findSwings(win, { lookback: 1, atr, minAtrMult: 0.25 });
}

/**
 * Macro-scale swings for the top-down skeleton pass. Only the largest
 * turns survive (wide lookback, big ATR multiple). Falls back to the
 * working-scale list when the tape cannot support a coarser grid.
 */
export function macroSwings(bars: Bar[], atr: number): Swing[] {
  if (bars.length < 12) return [];
  let lookback = Math.max(3, Math.round(bars.length / 12));
  let out: Swing[] = [];
  while (lookback >= 2) {
    out = findSwings(bars, { lookback, atr, minAtrMult: 1.5 });
    if (out.length >= 5) break;
    lookback = Math.floor(lookback / 2);
  }
  if (!out.length || out.length < 3) {
    out = findSwings(bars, { lookback: 2, atr, minAtrMult: 0.5 });
  }
  return out.slice(0, 14);
}

export type TapeChapter = {
  fromT: string;
  toT: string;
  dir: "up" | "down";
  fromPrice: number;
  toPrice: number;
  /** Signed percent move of the leg. */
  pct: number;
  /** Duration in days. */
  days: number;
};

/** Pair the macro extremes into narrative legs so the model reads the tape as chapters. */
export function tapeChapters(macro: Swing[]): TapeChapter[] {
  const out: TapeChapter[] = [];
  for (let i = 1; i < macro.length; i++) {
    const a = macro[i - 1]!;
    const b = macro[i]!;
    if (a.kind === b.kind) continue;
    out.push({
      fromT: a.t,
      toT: b.t,
      dir: b.kind === "high" ? "up" : "down",
      fromPrice: a.price,
      toPrice: b.price,
      pct: ((b.price - a.price) / a.price) * 100,
      days: Math.round((b.time - a.time) / 86_400),
    });
  }
  return out;
}

export type MacroLegFib = {
  /** 1-based leg number across the macro chain. */
  leg: number;
  fromT: string;
  toT: string;
  dir: "up" | "down";
  from: number;
  to: number;
  /** Retracements of this leg (0 at the start extreme, 100 at the end). */
  levels: FibLine[];
};

/**
 * Dean's macro-Fib-first scaffold: retracement levels for EVERY macro leg,
 * computed before the model counts. The working degree's pivots, the hold,
 * and the HL/LL sequence are then read against this ladder — confluence
 * between legs marks the levels that matter.
 */
export function macroFibLadder(macro: Swing[]): MacroLegFib[] {
  const out: MacroLegFib[] = [];
  for (let i = 1; i < macro.length; i++) {
    const a = macro[i - 1]!;
    const b = macro[i]!;
    if (a.kind === b.kind) continue;
    // Retracements run from the leg's end back toward its start: 0% at the
    // terminus, 100% a full retrace to the origin extreme.
    const span = Math.abs(b.price - a.price);
    const at = (r: number) => b.price - (b.price > a.price ? 1 : -1) * r * span;
    out.push({
      leg: out.length + 1,
      fromT: a.t,
      toT: b.t,
      dir: b.kind === "high" ? "up" : "down",
      from: a.price,
      to: b.price,
      levels: [
        { r: 0, label: "0%", price: at(0) },
        { r: 0.382, label: "38.2%", price: at(0.382) },
        { r: 0.5, label: "50%", price: at(0.5) },
        { r: 0.618, label: "61.8%", price: at(0.618) },
        { r: 0.786, label: "78.6%", price: at(0.786) },
        { r: 1, label: "100%", price: at(1) },
      ],
    });
  }
  return out;
}

export type StructureTag = { t: string; kind: "high" | "low"; price: number; tag: "HH" | "LH" | "HL" | "LL" };

/** Deterministic HL/LL read of the most recent swings — the structure guide the model counts against. */
export function structureRead(swings: Swing[], k = 6): StructureTag[] {
  const out: StructureTag[] = [];
  for (let i = Math.max(0, swings.length - k); i < swings.length; i++) {
    const s = swings[i]!;
    let prev: Swing | undefined;
    for (let j = i - 1; j >= 0; j--) {
      if (swings[j]!.kind === s.kind) {
        prev = swings[j]!;
        break;
      }
    }
    if (!prev) continue;
    const higher = s.price > prev.price;
    out.push({ t: s.t, kind: s.kind, price: s.price, tag: s.kind === "high" ? (higher ? "HH" : "LH") : higher ? "HL" : "LL" });
  }
  return out;
}

export type ImpulseCandidate = {
  /** Index of the window's first swing in the measured structure list. */
  from: number;
  originT: string;
  /** true = the check is VIOLATED (matches validator reject semantics). */
  twoThroughOrigin: boolean;
  threeShortest: boolean;
  fourOverlapsOne: boolean;
  valid: boolean;
  /** Retracement / extension ratios as fractions (0.618 = 61.8% of parent). F7 evidence, pre-computed. */
  ratios: { twoOfOne: number; threeOfOne: number; fourOfThree: number; fiveOfOne: number };
};

/**
 * Score every 6-consecutive-swing window of the structure list as a cash
 * impulse, doing the H1/H2/H4 arithmetic the model keeps failing — and the
 * F7 retracement ratios it would otherwise eyeball. The model classifies
 * from these facts; it never re-derives overlap or ratio by hand.
 */
export function impulseCandidates(swings: Swing[]): ImpulseCandidate[] {
  const out: ImpulseCandidate[] = [];
  for (let i = 0; i + 5 < swings.length; i++) {
    const w = swings.slice(i, i + 6);
    if (w.some((s, j) => j > 0 && s.kind === w[j - 1]!.kind)) continue;
    const up = w[0]!.kind === "low";
    const leg = (a: Swing, b: Swing) => Math.abs(b.price - a.price);
    const l1 = leg(w[0]!, w[1]!);
    const l2 = leg(w[1]!, w[2]!);
    const l3 = leg(w[2]!, w[3]!);
    const l4 = leg(w[3]!, w[4]!);
    const l5 = leg(w[4]!, w[5]!);
    const twoThroughOrigin = up ? w[2]!.price < w[0]!.price : w[2]!.price > w[0]!.price;
    // Leg magnitudes are orientation-independent.
    const threeShortest = l3 < l1 && l3 < l5;
    const fourOverlapsOne = up ? w[4]!.price < w[1]!.price : w[4]!.price > w[1]!.price;
    const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
    out.push({
      from: i,
      originT: w[0]!.t,
      twoThroughOrigin,
      threeShortest,
      fourOverlapsOne,
      valid: !twoThroughOrigin && !threeShortest && !fourOverlapsOne,
      ratios: {
        twoOfOne: safe(l2 / l1),
        threeOfOne: safe(l3 / l1),
        fourOfThree: safe(l4 / l3),
        fiveOfOne: safe(l5 / l1),
      },
    });
  }
  // Valid windows first, then by the size of the wave-3 leg (biggest structures on top).
  const leg3 = (i: number) => Math.abs(swings[i + 3]!.price - swings[i + 2]!.price);
  return out.sort((a, b) => Number(b.valid) - Number(a.valid) || leg3(b.from) - leg3(a.from)).slice(0, 6);
}

/** @deprecated use measureTape — kept for existing weekly fixtures */
export function measureWeekly(bars: Bar[], opts?: MeasureOpts): MeasurePacket {
  return measureTape(bars, "1wk", opts);
}
