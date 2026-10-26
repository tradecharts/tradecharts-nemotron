/**
 * Trimmed copy of the TradeCharts desk types module.
 * Source: C:\Users\dean\Projects\tradecharts\src\types.ts
 * Desk commit: 383525b (2026-10-26).
 * Only the three types the measure copy imports are kept; bodies verbatim.
 */

export type Interval = "60m" | "1d" | "1wk" | "1mo";

export type Bar = {
  t: string;
  time: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type FibLine = {
  r: number;
  label: string;
  price: number;
};
