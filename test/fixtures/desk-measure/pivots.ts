/**
 * Trimmed copy of the TradeCharts desk pivots module.
 * Source: C:\Users\dean\Projects\tradecharts\src\lib\pivots.ts
 * Desk commit: 383525b (2026-10-26).
 * Only `fibLines` is kept — the single export the measure copy imports.
 * Dropped: parsePivotDate/nearestBar/pivotTime/rangeFromDate/describeBarKey
 * (unused by measureTape; they pull the desk-only `Pivot`/`RangePreset`
 * types) and `export { uniqueVertices } from "./workspace"` (a desk module
 * with React/workspace state). The kept function body is verbatim.
 */

import type { FibLine } from "./types.js";

export function fibLines(high: number, low: number): FibLine[] {
  const span = high - low;
  return [
    { r: 0, label: "0%", price: high },
    { r: 0.236, label: "23.6%", price: high - 0.236 * span },
    { r: 0.382, label: "38.2%", price: high - 0.382 * span },
    { r: 0.5, label: "50%", price: high - 0.5 * span },
    { r: 0.618, label: "61.8%", price: high - 0.618 * span },
    { r: 0.786, label: "78.6%", price: high - 0.786 * span },
    { r: 1, label: "100%", price: low },
  ];
}
