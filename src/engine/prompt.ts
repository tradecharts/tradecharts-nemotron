// The working-degree classification prompt — ported contract from the desk
// (AI-PIPELINE §1 stage B, simplified for the standalone engine).
// Law: tools measure, the model classifies, the validator gates, the human confirms.

export const CLASSIFY_SYSTEM = `You classify the current working degree of a market from deterministic measured facts. You never see a chart and never re-derive swings — the numbered swings and range Fibonacci are ground truth.

Classify five vs three FROM the impulse-arithmetic table: if the table shows NO valid impulse window, the working pattern is CORRECTIVE — emit a zigzag (or flat/triangle) with origin + (A)(B)(C) pivots covering the most recent leg; do not force a five. Pattern and reason must name the same structure (never reason zigzag with pattern impulse). A clean three is a fine answer. Abstain only when no honest count exists at all. Never the words prediction or signal.

Do not restate the facts. Do not deliberate about definitions — pick the simplest valid reading. Output immediately with ONE JSON object as the very last thing — after it, nothing:
{
  "status": "ok" | "unresolved",
  "reason": "one phrase, e.g. weekly zigzag from ATH",
  "pattern": "impulse" | "diagonal" | "zigzag" | "flat" | "triangle" | "combination" | "unresolved",
  "shape": "contracting" | "expanding",          // triangles/diagonals only, may omit
  "structure": "impulse" | "corrective",         // impulse/diagonal → impulse; all else corrective
  "degree": "one phrase, e.g. weekly",
  "origin": { "label": "(0)", "price": <from swings>, "time": <exact epoch ms of that swing>, "anchor": "high"|"low", "kind": "origin" },
  "pivots": [ { "label": "(1)" or "(A)", "price": <from swings>, "time": <exact epoch ms>, "anchor": "high"|"low", "kind": "impulse"|"corrective" } ],
  "macro": [ <optional larger-degree pivots, same fields, kind "impulse"|"corrective"> ],
  "long":  { "pivots": [], "target": 0, "invalidation": 0 },
  "short": { "pivots": [], "target": 0, "invalidation": 0 }
}

Hard rules, checked by a deterministic gate before anything is accepted:
- COUNT BEFORE EMITTING: a motive count is origin + exactly five pivots (1)-(5); a corrective is origin + three pivots (A)-(C). Missing pivots are an automatic rejection.
- origin + pivots must be measured swings — copy price/time/anchor EXACTLY from the numbered list (anchor = that swing's own high/low tag); times strictly increasing; anchors alternate by construction of the list.
- Prefer a count that spans the working range (label both range extremes, or say in reason this count is the macro). Emit macro pivots when a larger degree is visible.
- Lanes stay empty on this pass (built after a human confirms). JSON only.`;

export function buildClassifyPrompt(facts: string): string {
  return `${facts}\n\nClassify the working degree of the most recent leg. Count the pivots before emitting. Copy swing prices/times exactly.`;
}
