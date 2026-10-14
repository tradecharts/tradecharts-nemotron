#!/usr/bin/env bash
# Terminal demo, performed live on Nebius Token Factory by default. Model output is
# nondeterministic; the acts name the verdicts these tapes produced on 2026-10-13.
set -uo pipefail
cd "$(dirname "$0")/.."

MODEL="${WAVECOUNT_PROVIDER:-nebius}"
if [ "$MODEL" = "nebius" ]; then
  : "${NEBIUS_API_KEY:?Set NEBIUS_API_KEY (Token Factory key)}"
else
  : "${NVIDIA_API_KEY:?Set NVIDIA_API_KEY (or WAVECOUNT_PROVIDER=nebius NEBIUS_API_KEY=... for the Token Factory path)}"
fi
export WAVECOUNT_PROVIDER="$MODEL"

# Retry an act that exits 3 (provider unavailable) up to twice more with a pause —
# keeps a recording session moving instead of dying mid-act.
act() {
  local tries=0
  until [ $tries -ge 3 ]; do
    "$@" && return 0
    rc=$?
    [ $rc -ne 3 ] && return $rc
    tries=$((tries+1)); echo "  … provider busy, retry $tries/2 in 60s"; sleep 60
  done
  return 3
}

npm run --silent build
echo "═══ wavecount — the AI chart engine that gates itself ═══"
echo

echo "── ACT 1 · a confident count, rejected by the rules ──"
echo "\$ wavecount --csv examples/bnb-usd-1w.csv --trace   # BNB weekly"
act node dist/cli.js --csv examples/bnb-usd-1w.csv --symbol BNB-USD --tf 1W --trace || true
echo "→ the model proposed an impulse. The gate names the violations. Nothing drawn."
echo

echo "── ACT 2 · a count that passes, with flags ──"
echo "\$ wavecount --csv examples/btc-usd-1w.csv --trace   # BTC weekly"
act node dist/cli.js --csv examples/btc-usd-1w.csv --symbol BTC-USD --tf 1W --trace
echo "→ flagged pass: advisories attached, a human confirms."
echo

echo "── the gate is tested like code ──"
npm test --silent 2>/dev/null | grep -E "Tests" | sed 's/^/  validator: /'
echo "35 rules · 72 deterministic tests · 5-tape e2e matrix (npm run e2e)"
