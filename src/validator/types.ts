/** Deterministic validator contract. Spec: docs/VALIDATOR-SCOPE.md */

import type { WavePattern, WaveShape } from "../desk-types.js";

export type { WavePattern, WaveShape };

export type Severity = "valid" | "flagged" | "rejected";
export type ReasonClass = "rule_violation" | "malformed_output";

export type WavePivot = {
  label: string;
  price: number;
  time: number;
  anchor: "high" | "low";
  kind: "impulse" | "corrective" | "forecast-up" | "forecast-down" | "origin";
};

export type RuleResult = {
  id: string;
  pass: boolean;
  message: string;
  severity: Severity;
};

export type AdvisoryReport = {
  /** False if the optional judge was off, failed, or returned junk. */
  ran: boolean;
  agree: boolean | null;
};

export type ValidationResult = {
  severity: Severity;
  reasonClass: ReasonClass;
  rules: RuleResult[];
  advisory?: AdvisoryReport;
};

/** Working-range extremes from the measure packet. Optional — skip S5 when absent. */
export type MeasureBounds = {
  high: number;
  low: number;
  highT: string;
  lowT: string;
};

/** Last measured bar — S6 uses this as “current price”. */
export type MeasureLast = {
  t: string;
  c: number;
};

export type ValidateOpts = {
  range?: MeasureBounds;
  last?: MeasureLast;
  /**
   * "required" (default): long/short lanes with kills must exist (the full
   * map contract). "optional": the map-stage proposal may omit lanes —
   * lane-only rules (H5, F5, S1/S2/S6, S8) are skipped when both sides are
   * empty. Scenarios are built AFTER Confirm (see AI-PIPELINE §1b).
   */
  lanes?: "required" | "optional";
  /**
   * "required" (default): S4 / S10 nest rules run. "optional": a Macro-map
   * lock may omit internals, and a scoped Walk/Pick piece skips working-pattern
   * S4/S10 (those want every parent of the lock, not one Macro window).
   */
  nests?: "required" | "optional";
};

export type PathSide = {
  pivots: WavePivot[];
  target: number;
  invalidation: number;
};

export type Proposal = {
  status: "ok" | "unresolved";
  reason?: string;
  /** Derived: impulse / diagonal → motive; zigzag / flat / triangle / combination / unresolved → corrective. */
  structure: "impulse" | "corrective";
  pattern: WavePattern;
  /** Contracting vs expanding. Inferred when omitted. */
  shape?: WaveShape;
  /** Working degree in one phrase — e.g. weekly zigzag from ATH. */
  degree?: string;
  origin?: WavePivot;
  pivots: WavePivot[];
  /** Larger-degree motive/corrective that contains the working pivots. */
  macro?: WavePivot[];
  /** Micro inside the working degree (i/1, a/2, i/C). */
  internals?: WavePivot[];
  hold?: { price: number; label: string };
  long: PathSide;
  short: PathSide;
  decision?: { boxLow: number; boxHigh: number; confirm: number; killA: number; killB: number };
  weights?: { long: number; short: number };
};
