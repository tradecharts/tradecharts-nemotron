# Build & test roadmap

The engine's core is done and proven live on Nebius Token Factory. This is the path to a hardened, standalone-verifiable release.

## Done

- [x] Provider layer — OpenAI-compatible client; `nebius` (Token Factory, `api.tokenfactory.nebius.com/v1`) is the default and the submission path; `nvidia` kept for development
- [x] Deterministic measure — ATR-band zigzag swings, working range, range Fib, per-window impulse arithmetic
- [x] Production validator — 35 rules, copied unmodified from the TradeCharts desk with its 72 unit tests, all green
- [x] Pipeline — two samples at t=0.2 → coerce → `validateProposal` per sample → deterministic rank
- [x] CLI — CSV in, verdict out; `--trace` prints endpoint, latency, tokens, and completion id for every model call
- [x] Full verdict spectrum on Token Factory — rejected with named violations (BNB, SOL) and flagged passes (BTC, ETH), 2026-10-13
- [x] End-to-end matrix — `npm run e2e`: every example tape → allowed verdict classes (`e2e-expected.nebius.json`); nonzero exit on drift
- [x] CI — `tsc` + `vitest` on every push and PR
- [x] Fresh-clone proof — clone → `npm ci` → build → 72 tests → graceful missing-key exit (2026-10-07)
- [x] Demo video — live Token Factory runs, published at [youtu.be/GKrzD-3MAbQ](https://youtu.be/GKrzD-3MAbQ) (2026-10-13)

## Next

- [ ] **Integration fixtures** — recorded model responses replayed through the parser + gate, no network
- [ ] **Measure-stage unit tests** — swing detection and impulse table on synthetic tapes

## Test matrix

| Layer | Scope | Status |
|---|---|---|
| L1 unit | validator rules (72 tests) | ✅ green, CI |
| L2 integration | JSON extraction + coercion + gate wiring, from fixtures | planned |
| L3 live E2E | full pipeline on Token Factory, per-tape verdict classes | ✅ `npm run e2e` |
| L4 live E2E (dev) | same matrix on the NVIDIA provider | ✅ `WAVECOUNT_PROVIDER=nvidia npm run e2e` |
| L5 standalone | fresh clone, no local state | ✅ 2026-10-07 |

The property under test at every layer: **the model proposes, the rules gate — a count that breaks a hard rule is never output as a pass.**
