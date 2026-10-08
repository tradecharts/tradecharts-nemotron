# Build & test roadmap

The engine's core is done and proven live. This is the path to a hardened, standalone-verifiable release.

## Done

- [x] Provider layer — OpenAI-compatible client; `nvidia` verified live, `nebius` path ready (submission runs on Nebius)
- [x] Deterministic measure — ATR-band zigzag swings, working range, range Fib
- [x] Production validator — copied unmodified from a live commercial charting desk, **72/72 unit tests green**
- [x] Pipeline — classify → coerce → `validateProposal` (lanes/nests optional, same as the desk's lock pass)
- [x] CLI — CSV in, verdict out; two live behaviors observed and captured in the README (honest abstain; confident-but-rejected with named rule violations)
- [x] Model selection — probed the available Nemotron models; the reasoning omni is the reliable default (probe table in README)

## Next

- [x] **Compliance pass** — verified 2026-10-08: `api.studio.nebius.com/v1`, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, matrix green twice, BTC flagged pass on the submission path
- [x] **Third outcome** — landed Oct 6: BTC weekly → **flagged** (advisories only). Full spectrum in one matrix: abstain · rejected-with-named-violations · flagged pass
- [ ] **Integration fixtures** — recorded model responses replayed through the parser + gate, no network
- [x] **End-to-end script** — `npm run e2e`: every example tape → expected verdict class (allow-lists in `e2e-expected.json`); nonzero exit on drift
- [x] **CI** — vitest + tsc on every push ()
- [ ] **Fresh-clone proof** — `git clone && npm install && npm test && npm run wavecount -- --csv examples/eth-usd-1w.csv` works with no local state

## Test matrix

| Layer | Scope | Status |
|---|---|---|
| L1 unit | validator rules (72 tests) | ✅ green |
| L2 integration | JSON extraction + coercion + gate wiring, from fixtures | planned |
| L3 live E2E | full pipeline vs the dev provider, per-tape verdict classes | ✅ e2e.mjs + expected allow-lists |
| L4 compliance E2E | full pipeline vs Nebius, captured for the writeup | ✅ green twice 2026-10-08 (`e2e-expected.nebius.json`) |
| L5 standalone | fresh clone, no local state, works end to end | ✅ passed 2026-10-07 |

The invariant under test at every layer: **the model proposes, the rules gate — nothing invalid reaches the output.**
