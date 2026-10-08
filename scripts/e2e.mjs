// End-to-end matrix: every example tape through the full pipeline against the
// configured provider. Prints the verdict class table; exits nonzero on drift
// from the expected classes recorded in e2e-expected.json.
//
//   tsc -b && NVIDIA_API_KEY=... node scripts/e2e.mjs
//   WAVECOUNT_PROVIDER=nebius NEBIUS_API_KEY=... node scripts/e2e.mjs

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, measure } from "../dist/engine/measure.js";
import { runPipeline } from "../dist/engine/pipeline.js";
import { nvidiaProvider } from "../dist/provider/nvidia.js";
import { nebiusProvider } from "../dist/provider/nebius.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const which = process.env.WAVECOUNT_PROVIDER ?? "nvidia";
const apiKey = which === "nebius" ? process.env.NEBIUS_API_KEY : process.env.NVIDIA_API_KEY;
if (!apiKey) { console.error(`Missing ${which === "nebius" ? "NEBIUS_API_KEY" : "NVIDIA_API_KEY"}`); process.exit(1); }
const provider = which === "nebius" ? nebiusProvider(apiKey) : nvidiaProvider(apiKey);

let expected = {};
const expectedFile = which === "nebius" ? "e2e-expected.nebius.json" : "e2e-expected.json";
try { expected = JSON.parse(readFileSync(resolve(root, expectedFile), "utf8")); } catch { /* first run records */ }

const csvs = readdirSync(resolve(root, "examples")).filter(f => f.endsWith(".csv")).sort();
let drift = 0;
console.log(`provider: ${provider.name} · model: ${provider.defaultModel}\n`);
for (const file of csvs) {
  const symbol = file.replace("-usd-1w.csv", "").replace(".csv", "").toUpperCase();
  const bars = parseCsv(readFileSync(resolve(root, "examples", file), "utf8"));
  const packet = measure(bars, undefined, symbol, "1W");
  const t0 = Date.now();
  let v;
  try { v = await runPipeline(provider, packet); }
  catch (e) { console.log(`! ${symbol.padEnd(5)} → error: ${String(e.message).slice(0, 90)}`); continue; }
  const cls = v.proposal?.status === "unresolved" ? "abstain" : v.severity;
  const exp = expected[file];
  const allowed = Array.isArray(exp) ? exp : exp ? [exp] : null;
  const ok = !allowed || allowed.includes(cls);
  if (allowed && !ok) drift++;
  console.log(`${ok ? "✓" : "✗"} ${symbol.padEnd(5)} ${String(bars.length).padStart(3)} bars · ${String(packet.swings.length).padStart(2)} swings · ${((Date.now() - t0) / 1000).toFixed(0)}s → ${cls.padEnd(8)} ${v.proposal?.pattern ? "(" + v.proposal.pattern + (v.proposal.reason ? " · " + v.proposal.reason.slice(0, 40) : "") + ")" : ""}${allowed ? `  [allowed ${allowed.join("|")}]` : ""}`);
  if (v.violations.length) v.violations.slice(0, 3).forEach(x => console.log(`     - ${x.slice(0, 110)}`));
}
if (!Object.keys(expected).length) console.log("\n(no e2e-expected.json — classes above are the recording, not yet asserted)");
process.exit(drift ? 1 : 0);
