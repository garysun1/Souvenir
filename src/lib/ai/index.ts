import type { IdentifyRequest, IdentifyResponse, PlanRequest, PlanResponse } from "@/lib/schemas";
import { env } from "@/lib/env";
import { mockProvider } from "./mock";
import { openAiProvider } from "./openai";

export interface AiProvider {
  identifyPlace(input: IdentifyRequest): Promise<IdentifyResponse>;
  planOuting(input: PlanRequest): Promise<PlanResponse>;
}

export function getAiProvider(): AiProvider {
  return env.AI_PROVIDER === "openai" ? openAiProvider : mockProvider;
}
