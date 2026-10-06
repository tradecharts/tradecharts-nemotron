// wavecount — the standalone engine entry. CSV in → measured facts →
// Nemotron classifies → the deterministic validator gates → verdict out.
//
//   NVIDIA_API_KEY=nvapi-... npm run wavecount -- --csv examples/eth-usd-1w.csv --symbol ETH-USD --tf 1W
//   WAVECOUNT_PROVIDER=nebius NEBIUS_API_KEY=... npm run wavecount -- --csv examples/eth-usd-1w.csv

import { readFileSync } from "node:fs";
import { nvidiaProvider } from "./provider/nvidia.js";
import { nebiusProvider } from "./provider/nebius.js";
import { parseCsv, measure } from "./engine/measure.js";
import { runPipeline } from "./engine/pipeline.js";

const args = parseArgs(process.argv.slice(2));
const csv = args.csv ?? "examples/eth-usd-1w.csv";
const symbol = args.symbol ?? "ETH-USD";
const timeframe = args.tf ?? "1W";

const which = args.provider ?? process.env.WAVECOUNT_PROVIDER ?? "nvidia";
const apiKey = which === "nebius" ? process.env.NEBIUS_API_KEY : process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error(`Missing ${which === "nebius" ? "NEBIUS_API_KEY" : "NVIDIA_API_KEY"} (env). Never hardcode keys.`);
  process.exit(1);
}
const provider = which === "nebius" ? nebiusProvider(apiKey) : nvidiaProvider(apiKey);

const bars = parseCsv(readFileSync(csv, "utf8"));
if (bars.length < 20) { console.error(`${csv}: need ≥ 20 bars, got ${bars.length}`); process.exit(1); }

const packet = measure(bars, undefined, symbol, timeframe);
const verdict = await runPipeline(provider, packet);

if (args.json) {
  console.log(JSON.stringify({ verdict, facts: { swings: packet.swings.length, range: packet.range, last: packet.last } }, null, 2));
} else {
  console.log(`${symbol} ${timeframe} · ${bars.length} bars · ${packet.swings.length} swings · ${verdict.model} via ${verdict.provider}`);
  if (verdict.proposal?.status === "unresolved") {
    console.log(`honest abstain — ${verdict.proposal.reason ?? "no count supported"} (nothing drawn, no retry)`);
    process.exit(0);
  }
  console.log(`severity: ${verdict.severity} (${verdict.reasonClass})`);
  if (verdict.proposal?.pattern) console.log(`pattern: ${verdict.proposal.pattern}${verdict.proposal.degree ? " · " + verdict.proposal.degree : ""}${verdict.proposal.reason ? " · " + verdict.proposal.reason : ""}`);
  if (verdict.violations.length) { console.log("violations:"); verdict.violations.forEach(v => console.log("  -", v)); }
  else console.log("violations: none");
}
process.exit(verdict.valid || verdict.severity === "flagged" ? 0 : 2);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? String(argv[++i]) : "true";
  }
  return out;
}
