// Nebius provider — the hackathon-compliant path. The submitted demo runs on this.
// Endpoint + credits come from the Nebius console / Builder Program (October task).

import { openAICompatibleProvider, type ModelProvider } from "./index.js";

export const NEBIUS_BASE_URL = "https://api.studio.nebius.com/v1"; // confirm in console when account exists
export const NEBIUS_DEFAULT_MODEL = "nvidia/nemotron-3-nano-30b-a3b-reasoning"; // Nemotron served by Nebius; exact id from their catalog

export function nebiusProvider(apiKey: string, baseUrl = NEBIUS_BASE_URL): ModelProvider {
  return openAICompatibleProvider({
    name: "nebius",
    baseUrl,
    apiKey,
    defaultModel: NEBIUS_DEFAULT_MODEL,
    defaultMaxTokens: 16384,
  });
}
