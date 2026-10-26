// Fetch the desk's 36 blueprint symbols as weekly tapes into tapes/<DESK-SYMBOL>-1w.csv
// (same t,o,h,l,c format as examples/). Idempotent: skips existing tapes unless --force.
//
//   node scripts/fetch-tapes.mjs [--force] [--only BTC-USD,AAPL]

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "tapes");
mkdirSync(out, { recursive: true });

export const CRYPTO = "ADA APT ARB ATOM AVAX BCH BNB BTC DOGE DOT ETH FIL HBAR HYPE INJ LDO LINK LTC NEAR OP PEPE POL RENDER SEI SHIB SOL SUI TON TRX UNI XLM XRP".split(" ");
export const STOCKS = "AAPL MSFT NVDA TSLA".split(" ");
export const SYMBOLS = [...CRYPTO.map((c) => `${c}-USD`), ...STOCKS];

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function getJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 0) { await sleep(5000); continue; }
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
    return JSON.parse(text);
  }
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function fetchCrypto(base) {
  const pair = `${base}USDT`;
  const hosts = ["https://api.binance.us", "https://data-api.binance.vision", "https://api.binance.com"];
  let lastErr;
  for (const host of hosts) {
    try {
      const rows = await getJson(`${host}/api/v3/klines?symbol=${pair}&interval=1w&limit=1000`);
      if (!Array.isArray(rows) || !rows.length) throw new Error("empty klines");
      const now = Date.now();
      return rows
        .filter((r) => Number(r[6]) <= now) // drop the still-open candle
        .map((r) => [isoDay(Number(r[0])), r[1], r[2], r[3], r[4]]);
    } catch (e) {
      lastErr = e;
      if (!/Invalid symbol|HTTP 400|HTTP 451|empty/.test(String(e.message))) throw e;
    }
  }
  throw lastErr;
}

async function fetchStock(sym) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1wk&range=max`);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error("no chart result");
  const q = r.indicators.quote[0];
  const rows = [];
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null)) return;
    rows.push([isoDay(ts * 1000), o, h, l, c]);
  });
  return rows;
}

const failed = [];
let fetched = 0, skipped = 0;
for (const sym of SYMBOLS) {
  if (only && !only.has(sym)) continue;
  const file = resolve(out, `${sym}-1w.csv`);
  if (existsSync(file) && !force) { skipped++; continue; }
  try {
    const rows = sym.endsWith("-USD") ? await fetchCrypto(sym.slice(0, -4)) : await fetchStock(sym);
    rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    writeFileSync(file, ["t,o,h,l,c", ...rows.map((r) => r.join(","))].join("\n") + "\n");
    console.log(`✓ ${sym.padEnd(11)} ${rows.length} bars`);
    fetched++;
  } catch (e) {
    console.log(`✗ ${sym.padEnd(11)} ${String(e.message).slice(0, 100)}`);
    failed.push({ symbol: sym, error: String(e.message).slice(0, 200) });
  }
  await sleep(300);
}
writeFileSync(resolve(out, "fetch-failures.json"), JSON.stringify(failed, null, 2) + "\n");
console.log(`\nfetched ${fetched} · skipped ${skipped} · failed ${failed.length}`);
