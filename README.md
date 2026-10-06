# tradecharts-nemotron

> Nemotron proposes the wave count. A deterministic validator gates it. The human confirms.
> **Rules over vibes.** An interpretive map — not a signal, not advice.

The open engine surface of [TradeCharts](https://tradecharts.app): a standalone CLI (and optional HTTP mode) that sends a tape to a Nemotron model, validates the proposed Elliott Wave count against deterministic rules, and returns a verdict. No shared git history with the commercial desk; the desk only reads.

Built for the **Nebius x NVIDIA Global AI Hackathon** (registration 3180710, due Oct 30 2026, track: Best Apps and Agents).

## Providers — read this first

Two companies, same models, different jobs. **Only Nebius counts for the hackathon submission.**

| Provider | Endpoint | Use |
|---|---|---|
| `nebius` | Nebius AI Cloud (OpenAI-compatible) | ✅ **The submitted demo runs on this** — rules require Nebius. Key pending: console signup (October task) |
| `nvidia` | `integrate.api.nvidia.com` | ❌ Not the submission path. Development, tests, and the desk's BYOK provider feature. Key verified working 2026-09-16 |

Same OpenAI-compatible dialect — switching is two env vars (`WAVECOUNT_PROVIDER=nebius NEBIUS_API_KEY=...`), zero code changes.

Same interface, two implementations (`src/provider/`). The engine never knows which one is behind it.

### Model notes (probed live, 2026-10-06)

| Model on our key | Behavior |
|---|---|
| `nemotron-3-nano-omni-30b-a3b-reasoning` | ✅ **default** — reasons in-channel, returns the JSON, ~80–110 s per count |
| `nemotron-3.5-lightning-30b-a3b` | ⚠️ thinks out loud past any token cap (no JSON lands) |
| `nemotron-3-super-120b-a12b` | ⚠️ returns empty content on this task |

## Run

```bash
npm install
cp .env.example .env   # fill keys from your secrets store

# NVIDIA provider (dev)
NVIDIA_API_KEY=nvapi-... npm run wavecount -- --symbol ETH-USD --tf 1W

# Nebius provider (hackathon path)
WAVECOUNT_PROVIDER=nebius NEBIUS_API_KEY=... npm run wavecount -- --symbol ETH-USD --tf 1W
```

Output: a verdict. Three real behaviors, all observed live:

```
$ wavecount --csv examples/eth-usd-1w.csv --symbol ETH-USD --tf 1W
ETH-USD 1W · 300 bars · 29 swings · nvidia/nemotron-3-nano-omni-30b-a3b-reasoning via nvidia
honest abstain — no 5-swing impulse window (nothing drawn, no retry)

$ wavecount --csv examples/btc-usd-1w.csv --symbol BTC-USD --tf 1W
BTC-USD 1W · 300 bars · 14 swings · …
severity: rejected — pattern the model proposed: impulse · weekly
violations: H1: Wave 3 cannot be the shortest of 1/3/5 · S7: Waves 2 and 4 do not
  alternate · F7: Fib off-catalog (2/1 128.1%, 3/1 44.2%) · S12: missing macro context
```

The model proposes; the deterministic gate rejects or flags; nothing invalid passes; a human confirms. Exit codes: 0 valid/flagged/abstain · 2 rejected.

## Layout

```
src/provider/    nvidia.ts · nebius.ts · index.ts (interface + OpenAI-compatible client)
src/engine/      pipeline.ts (propose → validate → verdict) · validator/ (tested production copy, lands Oct 4–8)
src/cli.ts       standalone entry — proves the repo is functional on its own
test/            validator unit tests + golden tests vs reference maps
```

## Honesty

- TradeCharts (tradecharts.app) is a live commercial product; this repo is the open engine surface, not the desk.
- The validator is deterministic; the model proposes, rules gate, the human confirms. Confirmed counts are private desk data.
- The Nemotron models used here are NVIDIA open models; the hackathon submission path runs on Nebius.
- License: Apache-2.0.
