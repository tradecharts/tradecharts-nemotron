// Swing agreement: engine zigzag (k × ATR) vs the desk's measureTape on the
// same weekly tapes. No network. Skipped when tapes/ has not been fetched
// (`node scripts/fetch-tapes.mjs`). Writes the per-symbol table to
// evidence/2026-10-26-measure/swing-agreement.md so the report can include it.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { measure, parseCsv } from "../src/engine/measure.js";
import { measureTape } from "./fixtures/desk-measure/index.js";

const TAPES = join(process.cwd(), "tapes");
const OUT = join(process.cwd(), "evidence", "2026-10-26-measure", "swing-agreement.md");
const tapes = existsSync(TAPES) ? readdirSync(TAPES).filter((f) => f.endsWith("-1w.csv")).sort() : [];

export type AgreementRow = {
  symbol: string;
  bars: number;
  engine: number;
  desk: number | "too-short" | "no-swings";
  /** Share of engine swings with a desk swing of the same anchor within 1 bar. */
  agree: number | null;
};

export function agreement(symbol: string, csv: string): AgreementRow {
  const bars = parseCsv(csv);
  const index = new Map(bars.map((b, i) => [b.t, i]));
  const eng = bars.length >= 20 ? measure(bars, 3.5, symbol, "1W").swings : [];
  const desk = measureTape(bars.map((b) => ({ ...b, v: 0 })), "1wk");
  if (!desk.ok) return { symbol, bars: bars.length, engine: eng.length, desk: desk.reason, agree: null };
  const deskIdx = desk.swings.map((s) => ({ i: index.get(s.t) ?? -1, kind: s.kind }));
  let hit = 0;
  for (const s of eng) {
    const i = index.get(s.t) ?? -1;
    if (deskIdx.some((d) => d.kind === s.anchor && Math.abs(d.i - i) <= 1)) hit++;
  }
  return { symbol, bars: bars.length, engine: eng.length, desk: desk.swings.length, agree: eng.length ? hit / eng.length : null };
}

describe.skipIf(!tapes.length)("engine vs desk swings on the blueprint tapes", () => {
  it("writes the agreement table", () => {
    const rows = tapes.map((f) => agreement(f.replace(/-1w\.csv$/, ""), readFileSync(join(TAPES, f), "utf8")));
    const scored = rows.filter((r) => r.agree !== null) as Array<AgreementRow & { agree: number }>;
    const mean = scored.length ? scored.reduce((a, r) => a + r.agree, 0) / scored.length : 0;
    const lines = [
      "## Swing agreement (engine k=3.5 zigzag vs desk measureTape, weekly)",
      "",
      `Agreement = share of engine swings with a desk swing of the same anchor within 1 bar. Mean over ${scored.length} scored tapes: **${(mean * 100).toFixed(0)}%**. The desk needs 52 weekly bars; shorter tapes are listed as too-short.`,
      "",
      "| Symbol | Bars | Engine swings | Desk swings | Agreement |",
      "|---|---:|---:|---:|---:|",
      ...rows.map((r) => `| ${r.symbol} | ${r.bars} | ${r.engine} | ${r.desk} | ${r.agree === null ? "—" : (r.agree * 100).toFixed(0) + "%"} |`),
      "",
    ];
    mkdirSync(join(OUT, ".."), { recursive: true });
    writeFileSync(OUT, lines.join("\n"));
    expect(rows.length).toBe(tapes.length);
    // Every scored engine swing set should find most of its anchors in the desk's
    // finer (0.5 × ATR) swing list; a collapse below half means the two measures
    // disagree on the tape itself, not just on granularity.
    expect(mean).toBeGreaterThan(0.5);
  });

  it("is deterministic on a tape", () => {
    const f = tapes[0];
    const csv = readFileSync(join(TAPES, f), "utf8");
    expect(agreement("X", csv)).toEqual(agreement("X", csv));
  });
});
