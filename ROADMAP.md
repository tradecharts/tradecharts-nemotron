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

- [ ] **Compliance pass** — run the example tapes on the Nebius provider (endpoint + model id from the Nebius catalog); the released demo runs on Nebius
- [ ] **Third outcome** — prompt iteration until at least one example tape returns a `valid`/`flagged` count (abstain and rejected already observed); two-sample deterministic judging if single-shot stays conservative
- [ ] **Integration fixtures** — recorded model responses replayed through the parser + gate, no network
- [ ] **End-to-end script** — `npm run e2e`: every example tape → expected verdict class; nonzero exit on drift
- [ ] **CI** — vitest + tsc on every push
- [ ] **Fresh-clone proof** — `git clone && npm install && npm test && npm run wavecount -- --csv examples/eth-usd-1w.csv` works with no local state

## Test matrix

| Layer | Scope | Status |
|---|---|---|
| L1 unit | validator rules (72 tests) | ✅ green |
| L2 integration | JSON extraction + coercion + gate wiring, from fixtures | planned |
| L3 live E2E | full pipeline vs the dev provider, per-tape verdict classes | planned |
| L4 compliance E2E | full pipeline vs Nebius, captured for the writeup | planned |
| L5 standalone | fresh clone, no local state, works end to end | planned |

The invariant under test at every layer: **the model proposes, the rules gate — nothing invalid reaches the output.**
