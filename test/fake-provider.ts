// A canned ModelProvider for pipeline tests — no network, no key.
// Queue items are consumed in order: a string becomes the completion
// content, an Error is thrown (provider failure), an object merges over the
// default CompletionResponse. When the queue runs dry the last item repeats.

import type { CompletionRequest, CompletionResponse, ModelProvider } from "../src/provider/index.js";

export type FakeCompletion = string | Error | Partial<CompletionResponse>;

export type FakeProvider = ModelProvider & { calls: CompletionRequest[] };

export function fakeProvider(queue: FakeCompletion[], name = "fake"): FakeProvider {
  let i = 0;
  const calls: CompletionRequest[] = [];
  return {
    name,
    baseUrl: "https://fake.invalid/v1",
    defaultModel: "fake/model",
    calls,
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      calls.push(req);
      const next = queue.length ? queue[Math.min(i++, queue.length - 1)] : "";
      if (next instanceof Error) throw next;
      const base: CompletionResponse = {
        content: typeof next === "string" ? next : (next.content ?? ""),
        model: "fake/model",
        provider: name,
        id: `fake-${i}`,
        ms: 1,
        usage: { promptTokens: 100, completionTokens: 50 },
      };
      return typeof next === "string" ? base : { ...base, ...next };
    },
  };
}
