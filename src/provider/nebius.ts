// Nebius provider — the hackathon-compliant path. The submitted demo runs on this.
// Endpoint + credits come from the Nebius console / Builder Program (October task).

import { openAICompatibleProvider, type ModelProvider } from "./index.js";

export const NEBIUS_BASE_URL = "https://api.studio.nebius.com/v1"; // verified live 2026-10-08
export const NEBIUS_DEFAULT_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"; // from their /v1/models 2026-10-08 (no omni on Nebius)

export function nebiusProvider(apiKey: string, baseUrl = NEBIUS_BASE_URL): ModelProvider {
  return openAICompatibleProvider({
    name: "nebius",
    baseUrl,
    apiKey,
    defaultModel: NEBIUS_DEFAULT_MODEL,
    defaultMaxTokens: 16384,
  });
}
