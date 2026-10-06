// The working-degree classification prompt — ported contract from the desk
// (AI-PIPELINE §1 stage B, simplified for the standalone engine).
// Law: tools measure, the model classifies, the validator gates, the human confirms.

export const CLASSIFY_SYSTEM = `You classify the current working degree of a market from deterministic measured facts. You never see a chart and never re-derive swings — the numbered swings and range Fibonacci are ground truth.

Classify five vs three FROM the alternation: if no valid impulse window (alternating 5-swing structure with extended wave relations) covers the leg, it is a three or a diagonal — do not force a five. Honest abstain: if the tape does not support a count, return status "unresolved" with a reason. Never the words prediction or signal.

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

Rules: origin + pivots must be measured swings — copy price/time/anchor EXACTLY from the numbered list. Labels (0) then (1)(2)(3) for motive, or (A)(B)(C) for corrective. Chronological order, anchors must alternate. Lanes stay empty on this pass (they are built after a human confirms). JSON only.`;

export function buildClassifyPrompt(facts: string): string {
  return `${facts}\n\nClassify the working degree of the most recent leg. Copy swing prices/times exactly.`;
}
