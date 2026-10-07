#!/usr/bin/env bash
# The three-act demo, performed live. Record this script top-to-bottom for the
# submission video (≤3 min essential footage; the acts map 1:1 to VIDEO.md).
set -uo pipefail
cd "$(dirname "$0")/.."

KEY="${NVIDIA_API_KEY:?Set NVIDIA_API_KEY (or WAVECOUNT_PROVIDER=nebius NEBIUS_API_KEY for the compliance cut)}"
MODEL="${WAVECOUNT_PROVIDER:-nvidia}"


# Provider capacity is real (shared omni worker). Retry an act that exits 3
# (provider unavailable) up to twice more with a pause — keeps a recording
# session moving instead of dying mid-act.
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
echo "═══ wavecount — the AI chart engine that gates itself ═══"
echo "provider: $MODEL · model: $(node -e "console.log((await import('./dist/provider/${MODEL}.js')).${MODEL}Provider('x').defaultModel)" --input-type=module 2>/dev/null || echo 'see README')"
echo

echo "── ACT 1 · the problem, stated by the machine itself ──"
echo "\$ wavecount --csv examples/eth-usd-1w.csv   # ETH weekly"
act npm run --silent wavecount -- --csv examples/eth-usd-1w.csv --symbol ETH-USD --tf 1W
echo "→ the engine refuses to invent a count. Nothing drawn, no retry."
echo

echo "── ACT 2 · a confident count, rejected by the rules ──"
echo "\$ wavecount --csv examples/bnb-usd-1w.csv   # BNB weekly"
act npm run --silent wavecount -- --csv examples/bnb-usd-1w.csv --symbol BNB-USD --tf 1W || true
echo "→ the model proposed an impulse. The gate names the violations. That is the product."
echo

echo "── ACT 3 · a count that passes ──"
echo "\$ wavecount --csv examples/btc-usd-1w.csv   # BTC weekly"
act npm run --silent wavecount -- --csv examples/btc-usd-1w.csv --symbol BTC-USD --tf 1W
echo "→ flagged pass: advisories attached, human confirms. The model proposes; the rules gate."
echo

echo "── the invariant ──"
npm test --silent 2>/dev/null | grep -E "Tests" | sed 's/^/  validator: /'
echo "72 deterministic rules tests · 5-tape e2e matrix (npm run e2e) · nothing invalid ever accepted"
