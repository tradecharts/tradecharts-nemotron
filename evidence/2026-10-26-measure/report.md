# Engine measurement — desk blueprint symbols (weekly) — 2026-10-26

Provider `nebius` · model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` · samples 2 per symbol · deterministic measure k=3.5.

## Summary

| metric | value |
|---|---|
| symbols measured | 36 |
| valid | 0 (0.0%) |
| flagged | 29 (80.6%) |
| rejected | 3 (8.3%) |
| abstain | 4 (11.1%) |
| error | 0 (0.0%) |
| **valid + flagged** | **29 (80.6%)** |
| median latency | 138.9 s |
| p90 latency | 325.3 s |
| mean tokens / symbol | 17171 |
| total tokens | 618166 |
| tapes not fetched | none |

Desk baseline for comparison (glm-5, same 36 symbols): 91% valid+flagged, median 91.4 s, p90 129.8 s.

## Per symbol

| symbol | bars | swings | class | pattern | latency | tokens (in/out) | calls | note |
|---|---|---|---|---|---|---|---|---|
| AAPL | 169 | 2 | abstain | unresolved | 265 s | 1934/14298 | 2 | P1: no valid three count |
| ADA-USD | 370 | 60 | flagged | zigzag | 512 s | 3322/11583 | 2 | S5: Map is a local sketch. Label both working-range extremes (2021-08-30 3.09941 and 2020- |
| APT-USD | 206 | 78 | rejected | impulse | 205 s | 3212/12538 | 2 | H2: Wave 4 overlaps wave 1 in a cash impulse. |
| ARB-USD | 183 | 48 | flagged | zigzag | 152 s | 3284/10486 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 211.6% off-catalog; C/A 70.4% |
| ATOM-USD | 365 | 118 | flagged | impulse | 193 s | 3250/15132 | 2 | S5: Map is a local sketch. Label both working-range extremes (2021-09-20 44.762 and 2020-0 |
| AVAX-USD | 258 | 66 | flagged | zigzag | 141 s | 3250/11707 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 206.5% off-catalog; C/A 57.2% |
| BCH-USD | 370 | 29 | flagged | zigzag | 201 s | 3310/15119 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 74.9%; C/A 28.4% off-catalog. |
| BNB-USD | 370 | 18 | rejected |  | 334 s | 3292/20758 | 2 | model returned no parsable JSON |
| BTC-USD | 370 | 16 | flagged | zigzag | 514 s | 3338/11275 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 110.0% off-catalog; C/A 130.1 |
| DOGE-USD | 366 | 53 | flagged | zigzag | 337 s | 3310/18343 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 201.2% off-catalog; C/A 475.1 |
| DOT-USD | 256 | 88 | flagged | zigzag | 325 s | 3274/19922 | 2 | S12: Elliott is fractal. Emit macro pivots for the larger motive/corrective, or say in rea |
| ETH-USD | 370 | 25 | flagged | zigzag | 119 s | 3300/7586 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 96.7%; C/A 36.4% off-catalog. |
| FIL-USD | 280 | 93 | flagged | zigzag | 244 s | 3236/15540 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 105.9% off-catalog; C/A 140.9 |
| HBAR-USD | 174 | 25 | flagged | impulse | 139 s | 3292/16117 | 2 | C1: Wave 4 threw through the 0–2 channel line. |
| HYPE-USD | 73 | 3 | flagged | zigzag | 204 s | 2000/24404 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 187.0% off-catalog; C/A 51.8% |
| INJ-USD | 24 | 1 | abstain | unresolved | 212 s | 1838/23099 | 2 | P1: no valid three-wave count |
| LDO-USD | 220 | 74 | flagged | zigzag | 97 s | 3252/11082 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 279.2% off-catalog; C/A 109.2 |
| LINK-USD | 250 | 22 | flagged | flat | 107 s | 3248/14678 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 162.3% off-catalog; C/A 68.2% |
| LTC-USD | 370 | 67 | flagged | zigzag | 58 s | 3254/9558 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 227.1% off-catalog; C/A 111.4 |
| MSFT | 164 | 2 | abstain | unresolved | 55 s | 1932/8785 | 2 | P1: no valid three count |
| NEAR-USD | 249 | 16 | flagged | zigzag | 151 s | 3262/18350 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 146.0% off-catalog; C/A 103.1 |
| NVDA | 334 | 2 | abstain | unresolved | 63 s | 1934/7125 | 2 | P1: no complete three-count |
| OP-USD | 227 | 83 | flagged | zigzag | 147 s | 3270/17149 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 61.7%; C/A 146.8% off-catalog |
| PEPE-USD | 99 | 24 | flagged | impulse | 111 s | 3490/14921 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: 2/1 99.7% off-catalog; 3/1 255.8% |
| POL-USD | 93 | 14 | flagged | zigzag | 82 s | 3242/12566 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 123.9% off-catalog; C/A 62.0% |
| RENDER-USD | 114 | 21 | flagged | zigzag | 80 s | 3186/11941 | 2 | S12: Elliott is fractal. Emit macro pivots for the larger motive/corrective, or say in rea |
| SEI-USD | 50 | 3 | flagged | zigzag | 54 s | 2030/12294 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 24.6% off-catalog; C/A 43.6%. |
| SHIB-USD | 267 | 73 | flagged | zigzag | 72 s | 3496/15145 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 93.9%; C/A 189.3% off-catalog |
| SOL-USD | 319 | 29 | rejected | impulse | 65 s | 3236/15784 | 2 | H2: Wave 4 overlaps wave 1 in a cash impulse. |
| SUI-USD | 157 | 28 | flagged | impulse | 76 s | 3204/18358 | 2 | S5: Map is a local sketch. Label both working-range extremes (2024-12-30 5.3532 and 2023-1 |
| TON-USD | 100 | 14 | flagged | zigzag | 177 s | 3108/17461 | 2 | S12: Elliott is fractal. Emit macro pivots for the larger motive/corrective, or say in rea |
| TRX-USD | 84 | 4 | flagged | zigzag | 295 s | 2100/8041 | 2 | S12: Elliott is fractal. Emit macro pivots for the larger motive/corrective, or say in rea |
| TSLA | 197 | 6 | flagged | zigzag | 106 s | 2344/10826 | 2 | S12: Macro layer needs a full motive (1–5) or corrective (A-B-C) of the larger degree. |
| UNI-USD | 319 | 40 | flagged | zigzag | 63 s | 3284/12305 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 117.7% off-catalog; C/A 126.7 |
| XLM-USD | 370 | 34 | flagged | zigzag | 65 s | 3306/13374 | 2 | S5: Map is a local sketch. Label both working-range extremes (2021-05-10 0.79822 and 2020- |
| XRP-USD | 241 | 19 | flagged | zigzag | 55 s | 3260/12636 | 2 | F7: Wave + Fib are one proof. Off-catalog or unmeasured: B/A 181.1% off-catalog; C/A 75.8% |


## Gate 1 verdict (2026-10-26, 03:00 PDT)

The gate asked for parity with the desk's hosted draft (glm-5 on Z.ai) on the same 36 weekly tapes: at least the same share of usable drafts (valid + flagged) and comparable latency. Nemotron-3-Nano-30B on Nebius misses on both axes.

| | Nemotron (this run) | glm-5 desk baseline | gate |
|---|---|---|---|
| valid + flagged | **80.6%** (29/36) | 91% | **fail** (−10 pts) |
| valid (no violations) | 0% | n/a | — |
| median latency | **138.9 s** | 91.4 s | **fail** (1.5×) |
| p90 latency | **325.3 s** | 129.8 s | **fail** (2.5×) |
| completion tokens / symbol | mean ~14.3K (2 samples) | n/a | — |

What the per-symbol notes say:

- **No draft was clean.** Every usable draft carries at least one measure violation, most often F7 (a Fibonacci ratio off the catalog, 19 symbols) or S5/S12 (local sketch, missing macro layer). The desk accepts flagged drafts as a starting point, so they count, but a human still edits each one.
- **Three rejects:** APT and SOL (wave 4 overlaps wave 1 in a cash impulse, a hard rule) and BNB (no parsable JSON after two samples).
- **Four abstains:** AAPL, MSFT, NVDA, INJ. The stocks have only 2 engine swings at k=3.5 on weekly bars (the zigzag threshold is tuned for crypto volatility), so the model correctly says it cannot count three waves; INJ has 24 bars.
- **Latency is dominated by reasoning tokens.** Completion tokens run 7K–24K per symbol for two samples; the slowest symbols (ADA 512 s, BTC 514 s) are the ones where the model thinks longest, not the longest tapes.

Swing agreement with the desk's own measure (see `swing-agreement.md`): mean **72%** over 34 scored tapes. The engine's k=3.5 zigzag finds far fewer swings than the desk on the majors (BTC 16 vs 69, BNB 18 vs 63) and far more on the mid-caps (ATOM 118 vs 87, APT 78 vs 46). The two measures disagree on what a swing is before the model sees anything, which caps how far prompt work alone can close the quality gap.

**Decision:** the desk keeps the hosted glm-5 draft; the engine stays a public demo. Gate 2 (Worker secrets, desk integration) does not start.

**Proposed follow-up experiment (one evening, needs sign-off, costs Nebius credit only):** rerun the same 36 tapes with (a) one sample instead of two, (b) a reasoning budget cap if the Nebius endpoint honours `max_completion_tokens` for the thinking phase, and (c) an ATR-scaled zigzag threshold so stocks and majors produce 8–20 weekly swings like the desk. If (c) alone lifts swing agreement past 85% and the usable share past 90%, the model is worth a second look; if not, the gap is the model and the engine should stay a demo until a stronger open model is on Nebius.

**Open issue (engine):** the fixed k=3.5 zigzag is the wrong scale for stocks and for BTC/BNB. Replace it with an ATR-band threshold (swing = move greater than N weekly ATRs) before any further measurement, so the stocks stop abstaining for want of swings.
