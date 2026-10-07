// Provider interface — one contract, two implementations.
//   nvidia  : integrate.api.nvidia.com  (dev, tests, desk BYOK product feature)
//   nebius  : Nebius AI Cloud / Token Factory OpenAI-compatible endpoint (REQUIRED for the hackathon submission)
// The engine never knows which one is behind it.

import { Agent, setGlobalDispatcher } from "undici";

// Reasoning calls can run past undici's 5-minute default header timeout.
setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  /** Nemotron reasoning-style extra budget, when the model supports it. */
  reasoningBudget?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  provider: string;
  raw?: unknown;
}

export interface ModelProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

// Shared omni workers throw 503 ResourceExhausted and long prompts trip 504s; back off and retry.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: Response | undefined;
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(url, init);
    if ((res.status !== 503 && res.status !== 504) || i === attempts) return res;
    await new Promise(r => setTimeout(r, 10000 * i));
    last = res;
  }
  return last!;
}

// Minimal OpenAI-compatible chat/completions client. Both NVIDIA integrate
// and Nebius speak this dialect; only base URL, key, and defaults differ.
export function openAICompatibleProvider(opts: {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  defaultMaxTokens?: number;
}): ModelProvider {
  const { name, baseUrl, apiKey, defaultModel } = opts;
  return {
    name,
    defaultModel,
    async complete(req): Promise<CompletionResponse> {
      const model = req.model ?? defaultModel;
      const body: Record<string, unknown> = {
        model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? opts.defaultMaxTokens ?? 4096,
        temperature: req.temperature ?? 0.6,
        top_p: req.topP ?? 0.95,
        stream: false,
      };
      // Reasoning budget only applies to -reasoning models; forcing it on
      // speed models (lightning) trips NVIDIA's 300s gateway with 504s.
      if (req.reasoningBudget !== undefined && model.includes("reasoning")) {
        body.reasoning_budget = req.reasoningBudget;
      }

      const res = await fetchWithRetry(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${name} HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      return { content, model, provider: name, raw: json };
    },
  };
}
