// Propose → validate → verdict. The validator is the production gate
// (copied, tested — 72 tests green). Nothing invalid passes.

import type { CompletionResponse, ModelProvider } from "../provider/index.js";
import type { MeasurePacket } from "./measure.js";
import { renderFacts } from "./measure.js";
import { CLASSIFY_SYSTEM, buildClassifyPrompt } from "./prompt.js";
import { extractJson, validateProposal, structureOf, type Proposal, type ValidationResult } from "../validator/index.js";

export type Verdict = {
  valid: boolean;
  severity: ValidationResult["severity"];
  reasonClass: ValidationResult["reasonClass"];
  violations: string[];
  proposal: Proposal | null;
  raw: string;
  provider: string;
  model: string;
};

export type Trace = (line: string) => void;

export async function runPipeline(
  provider: ModelProvider,
  packet: MeasurePacket,
  opts: { samples?: number; trace?: Trace } = {},
): Promise<Verdict> {
  // Desk doctrine: the model runs more than once, the desk judges. Low
  // temperature + two samples keeps a passing count passing on camera.
  const samples = Math.max(1, opts.samples ?? 1);
  const attempts: Verdict[] = [];
  for (let i = 0; i < samples; i++) {
    opts.trace?.(`→ sample ${i + 1}/${samples} · POST ${provider.baseUrl}/chat/completions · ${provider.defaultModel}`);
    attempts.push(await classifyOnce(provider, packet, 0.2, opts.trace));
  }
  return attempts.reduce((best, v) => (rank(v) < rank(best) ? v : best));
}

/** valid > flagged > rejected > abstain; then fewer violations wins. */
function rank(v: Verdict): number {
  if (v.proposal?.status === "unresolved") return 30 + v.violations.length;
  if (v.severity === "valid") return 0 + v.violations.length;
  if (v.severity === "flagged") return 10 + v.violations.length;
  return 20 + v.violations.length;
}

async function classifyOnce(provider: ModelProvider, packet: MeasurePacket, temperature: number, trace?: Trace): Promise<Verdict> {
  const completion = await provider.complete({
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: buildClassifyPrompt(renderFacts(packet)) },
    ],
    maxTokens: 16384,
    reasoningBudget: 2048,
    temperature,
  });
  const verdict = gate(provider, packet, completion);
  if (trace) {
    const u = completion.usage;
    const tokens = u?.promptTokens !== undefined ? ` · ${u.promptTokens} in / ${u.completionTokens ?? "?"} out tokens` : "";
    const cls = verdict.proposal?.status === "unresolved" ? "abstain" : verdict.severity;
    trace(`← 200 · ${(completion.ms / 1000).toFixed(1)} s${tokens} · id ${completion.id ?? "n/a"} · gate: ${cls}`);
  }
  return verdict;
}

function gate(provider: ModelProvider, packet: MeasurePacket, completion: CompletionResponse): Verdict {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = extractJson(completion.content) as Record<string, unknown> | null;
  } catch {
    parsed = null; // extractJson throws "no-json" on absent payloads
  }
  if (!parsed) {
    return {
      valid: false, severity: "rejected", reasonClass: "malformed_output",
      violations: ["model returned no parsable JSON"], proposal: null,
      raw: completion.content, provider: provider.name, model: completion.model,
    };
  }

  // Same coercion the desk applies before the gate: lanes optional on a
  // classification pass, structure derived if the model omitted it.
  const proposal = parsed as unknown as Proposal;
  if (!proposal.structure && proposal.pattern) {
    proposal.structure = structureOf(proposal.pattern);
  }
  proposal.long ??= { pivots: [], target: 0, invalidation: 0 };
  proposal.short ??= { pivots: [], target: 0, invalidation: 0 };

  const result = validateProposal(proposal, {
    range: packet.range,
    last: packet.last,
    lanes: "optional",
    nests: "optional",
  });

  return {
    valid: result.severity !== "rejected",
    severity: result.severity,
    reasonClass: result.reasonClass,
    violations: result.rules.filter(r => !r.pass).map(r => `${r.id}: ${r.message}`),
    proposal,
    raw: completion.content,
    provider: provider.name,
    model: completion.model,
  };
}
