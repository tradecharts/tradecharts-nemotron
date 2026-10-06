// Types shared with the commercial desk (copied from tradecharts/src/types.ts).
// Kept local so this repo stands alone; if the desk's shapes evolve, copy again.

/** The seven drawable Elliott patterns — same set as the desk's WavePattern. */
export type WavePattern =
  | "impulse"
  | "diagonal"
  | "zigzag"
  | "flat"
  | "triangle"
  | "combination"
  | "unresolved";

/** Coil vs stretch — triangles and diagonals. Inferred if the model omits it. */
export type WaveShape = "contracting" | "expanding";
