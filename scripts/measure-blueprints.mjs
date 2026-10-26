// Phase 5 gate 1: run every tapes/*.csv through measure → runPipeline (Nebius Nemotron)
// and write evidence/2026-10-26-measure/{results.json,report.md}. Resumable.
//
//   npm run build && NEBIUS_API_KEY=... node scripts/measure-blueprints.mjs [--only BTC-USD,ETH-USD] [--no-resume]

import "../dist/node-transport.js";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, measure } from "../dist/engine/measure.js";
import { runPipeline } from "../dist/engine/pipeline.js";
import { nebiusProvider } from "../dist/provider/nebius.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "evidence", "2026-10-26-measure");
mkdirSync(evidence, { recursive: true });
const resultsFile = resolve(evidence, "results.json");

const apiKey = process.env.NEBIUS_API_KEY;
if (!apiKey) { console.error("Missing NEBIUS_API_KEY"); process.exit(1); }
const provider = nebiusProvider(apiKey);

const args = process.argv.slice(2);
const resume = !args.includes("--no-resume");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;

let results = {};
if (resume && existsSync(resultsFile)) results = JSON.parse(readFileSync(resultsFile, "utf8"));
const save = () => writeFileSync(resultsFile, JSON.stringify(results, null, 2) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tapes = readdirSync(resolve(root, "tapes")).filter((f) => f.endsWith("-1w.csv")).sort();
console.log(`provider: ${provider.name} · model: ${provider.defaultModel} · ${tapes.length} tapes\n`);

for (const file of tapes) {
  const symbol = file.replace("-1w.csv", "");
  if (only && !only.has(symbol)) continue;
  if (resume && results[symbol] && results[symbol].class !== "error") continue;
  const bars = parseCsv(readFileSync(resolve(root, "tapes", file), "utf8"));
  const row = { symbol, bars: bars.length, swings: 0, class: "error", pattern: null, reason: null, violations: [], ms: 0, promptTokens: 0, completionTokens: 0, calls: 0, error: null };
  let packet;
  try { packet = measure(bars, undefined, symbol, "1W"); row.swings = packet.swings.length; }
  catch (e) { row.error = `measure: ${String(e.message).slice(0, 200)}`; results[symbol] = row; save(); console.log(`! ${symbol.padEnd(11)} ${row.error}`); continue; }

  const trace = (line) => {
    if (line.startsWith("→ sample")) row.calls++;
    const m = line.match(/(\d+) in \/ (\d+) out tokens/);
    if (m) { row.promptTokens += Number(m[1]); row.completionTokens += Number(m[2]); }
  };
  const t0 = Date.now();
  let v;
  for (let attempt = 0; attempt < 2 && !v; attempt++) {
    try { v = await runPipeline(provider, packet, { samples: 2, trace }); }
    catch (e) {
      const msg = String(e.message);
      row.error = msg.slice(0, 200);
      if (attempt === 0 && /429|5\d\d|fetch failed|ECONN|timeout/i.test(msg)) { console.log(`  retry ${symbol} after: ${msg.slice(0, 80)}`); await sleep(20000); row.calls = 0; row.promptTokens = 0; row.completionTokens = 0; }
    }
  }
  row.ms = Date.now() - t0;
  if (v) {
    row.class = v.proposal?.status === "unresolved" ? "abstain" : v.severity;
    row.pattern = v.proposal?.pattern ?? null;
    row.reason = v.proposal?.reason?.slice(0, 160) ?? null;
    row.violations = v.violations.slice(0, 3).map((x) => x.slice(0, 160));
    row.error = null;
  }
  results[symbol] = row;
  save();
  console.log(`${v ? "✓" : "!"} ${symbol.padEnd(11)} ${String(row.bars).padStart(3)} bars · ${String(row.swings).padStart(2)} swings · ${(row.ms / 1000).toFixed(0).padStart(3)}s → ${row.class.padEnd(8)} ${row.pattern ? "(" + row.pattern + ")" : ""}${row.error ? " " + row.error.slice(0, 80) : ""}`);
}

// ---- report
const rows = Object.values(results).sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
const n = rows.length;
const count = (c) => rows.filter((r) => r.class === c).length;
const pct = (k) => (n ? ((100 * k) / n).toFixed(1) + "%" : "–");
const lat = rows.filter((r) => r.class !== "error").map((r) => r.ms / 1000).sort((a, b) => a - b);
const q = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * (lat.length - 1)))].toFixed(1) + " s" : "–");
const tok = rows.map((r) => r.promptTokens + r.completionTokens);
const totalTok = tok.reduce((a, b) => a + b, 0);
let failedFetch = [];
try { failedFetch = JSON.parse(readFileSync(resolve(root, "tapes", "fetch-failures.json"), "utf8")); } catch {}

const md = [];
md.push(`# Engine measurement — desk blueprint symbols (weekly) — ${new Date().toISOString().slice(0, 10)}`, "");
md.push(`Provider \`${provider.name}\` · model \`${provider.defaultModel}\` · samples 2 per symbol · deterministic measure k=3.5.`, "");
md.push("## Summary", "");
md.push("| metric | value |", "|---|---|");
md.push(`| symbols measured | ${n} |`);
for (const c of ["valid", "flagged", "rejected", "abstain", "error"]) md.push(`| ${c} | ${count(c)} (${pct(count(c))}) |`);
md.push(`| **valid + flagged** | **${count("valid") + count("flagged")} (${pct(count("valid") + count("flagged"))})** |`);
md.push(`| median latency | ${q(0.5)} |`, `| p90 latency | ${q(0.9)} |`);
md.push(`| mean tokens / symbol | ${n ? Math.round(totalTok / n) : 0} |`, `| total tokens | ${totalTok} |`);
md.push(`| tapes not fetched | ${failedFetch.length ? failedFetch.map((f) => f.symbol).join(", ") : "none"} |`, "");
md.push("Desk baseline for comparison (glm-5, same 36 symbols): 91% valid+flagged, median 91.4 s, p90 129.8 s.", "");
md.push("## Per symbol", "");
md.push("| symbol | bars | swings | class | pattern | latency | tokens (in/out) | calls | note |", "|---|---|---|---|---|---|---|---|---|");
for (const r of rows) md.push(`| ${r.symbol} | ${r.bars} | ${r.swings} | ${r.class} | ${r.pattern ?? ""} | ${(r.ms / 1000).toFixed(0)} s | ${r.promptTokens}/${r.completionTokens} | ${r.calls} | ${(r.error ?? r.violations[0] ?? r.reason ?? "").replace(/\|/g, "/").slice(0, 90)} |`);
md.push("");
writeFileSync(resolve(evidence, "report.md"), md.join("\n") + "\n");
console.log(`\nreport: evidence/2026-10-26-measure/report.md · valid+flagged ${pct(count("valid") + count("flagged"))} · median ${q(0.5)} · p90 ${q(0.9)}`);
