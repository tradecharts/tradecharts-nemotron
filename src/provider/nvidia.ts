// NVIDIA integrate provider — development, tests, and the desk's BYOK dropdown.
// NOT the hackathon submission path: the Nebius rules require the submitted
// project to run on Nebius (Token Factory or AI Cloud). Keep this one for dev.

import { openAICompatibleProvider, type ModelProvider } from "./index.js";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Probed 2026-10-06 on our key: omni reasons in-channel and reliably yields
// the JSON (lightning reasons out loud past any token cap; super returns empty).
export const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
export const NVIDIA_LIGHTNING_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
export const NVIDIA_SUPER_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export function nvidiaProvider(apiKey: string): ModelProvider {
  return openAICompatibleProvider({
    name: "nvidia",
    baseUrl: NVIDIA_BASE_URL,
    apiKey,
    defaultModel: NVIDIA_DEFAULT_MODEL,
    defaultMaxTokens: 65536,
  });
}
