import type { z } from 'zod';
import type { Actor } from '../audit/log';
import type { Card, Decision } from '../cards';
import type { Tier } from '../policy';
import type { ActionName } from '../gate/tiers';

export interface ToolContext {
  actor: Actor;
}

export interface ToolResult {
  tier: Tier;
  decision: Decision;
  reasons: string[];
  cards: Card[];
  /** Short factual text handed back to the LLM (never contains secrets such as the OTP). */
  summary: string;
  /** Extra fields for the audit entry. */
  audit?: Record<string, unknown>;
}

export interface Tool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: ActionName;
  description: string;
  schema: S;
  /** JSON schema of the parameters, as shown to the LLM. */
  parameters: Record<string, unknown>;
  /** false = the LLM is never offered this tool (e.g. executePayment). */
  agentCallable: boolean;
  run(params: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
}

export function defineTool<S extends z.ZodTypeAny>(t: Tool<S>): Tool<S> {
  return t;
}
