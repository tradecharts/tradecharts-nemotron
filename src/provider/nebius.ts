// Nebius Token Factory provider — the hackathon-compliant path. The submitted demo runs on this.
// Key from tokenfactory.nebius.com (Builder Program credits).

import { openAICompatibleProvider, type ModelProvider } from "./index.js";

export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1"; // Token Factory, verified live 2026-10-13
export const NEBIUS_DEFAULT_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"; // from Token Factory /v1/models 2026-10-13 (no omni on Nebius)

export function nebiusProvider(apiKey: string, baseUrl = NEBIUS_BASE_URL): ModelProvider {
  return openAICompatibleProvider({
    name: "nebius",
    baseUrl,
    apiKey,
    defaultModel: NEBIUS_DEFAULT_MODEL,
    defaultMaxTokens: 16384,
  });
}
