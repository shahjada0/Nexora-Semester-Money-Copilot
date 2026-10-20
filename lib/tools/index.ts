/**
 * Tool registry and the single entry point for running a tool: runTool().
 * Order of operations for every call, whoever makes it (agent, UI, eval):
 *   1. unknown tool → blocked      2. Zod-validate params → blocked if invalid
 *   3. agent may only call agentCallable tools
 *   4. tool runs its gate check (lib/gate) and, only if allowed, its effect
 *   5. one audit entry with tier, decision, reason, params and result
 */
import type { z } from 'zod';
import { append } from '../audit';
import type { Actor } from '../audit/log';
import { gateSimple } from '../gate';
import type { ActionName } from '../gate/tiers';
import type { BlockedCard } from '../cards';
import { getBalances, getFxRates, getSchedule, listPayees, readInvoice } from './read';
import { computeTrueCost, getQuotes, setRateAlert } from './quotes';
import { executePayment, proposePayment } from './payments';
import { monthlyNeeds, monthsLeft } from './runway';
import { scamCheck } from './scam';
import { familyDecision, requestFamilyApproval } from './family';
import { planSemesterTool } from './semester';
import type { Tool, ToolContext, ToolResult } from './types';

export type { ToolResult, ToolContext } from './types';

const TOOLS: Tool<any>[] = [
  getBalances,
  getFxRates,
  listPayees,
  getSchedule,
  readInvoice,
  getQuotes,
  computeTrueCost,
  setRateAlert,
  monthsLeft,
  monthlyNeeds,
  scamCheck,
  proposePayment,
  executePayment,
  requestFamilyApproval,
  familyDecision,
  planSemesterTool,
];

const SELF_GATED = new Set(['proposePayment', 'executePayment', 'requestFamilyApproval', 'familyDecision']);

const BY_NAME = new Map(TOOLS.map((t) => [t.name as string, t]));

export function agentTools(): Tool[] {
  return TOOLS.filter((t) => t.agentCallable);
}

export interface RunResult extends ToolResult {
  tool: string;
  auditSeq: number;
  /** Set when params failed validation, so the agent can retry once with the error. */
  validationError?: string;
}

function blockedResult(tool: string, reason: string, actor: Actor, params: unknown, validationError?: string): RunResult {
  const rec = append({ actor, action: tool, tier: 3, decision: 'blocked', reason, data: { params: params as Record<string, unknown> } });
  const card: BlockedCard = { type: 'blocked', tier: 3, decision: 'blocked', title: 'Action refused by the Permission Gate', why: reason, reasons: [reason], checks: [], auditSeq: rec.seq };
  return { tool, tier: 3, decision: 'blocked', reasons: [reason], cards: [card], summary: `REFUSED: ${reason}`, auditSeq: rec.seq, validationError };
}

export async function runTool(name: string, rawParams: unknown, ctx: ToolContext): Promise<RunResult> {
  const tool = BY_NAME.get(name);
  if (!tool) return blockedResult(name, `Unknown tool "${name}". Only registered tools can run.`, ctx.actor, rawParams);

  if (ctx.actor === 'agent' && !tool.agentCallable) {
    return blockedResult(name, `The agent is not allowed to call ${name}. Only the student can execute payments from the confirmation screen.`, ctx.actor, rawParams);
  }

  const parsed = (tool.schema as z.ZodTypeAny).safeParse(rawParams ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'params'}: ${i.message}`).join('; ');
    return blockedResult(name, `Invalid parameters for ${name}: ${msg}`, ctx.actor, rawParams, msg);
  }

  // Tier 0/1 tools get their decision here; payment and family tools call their own gate checks inside run().
  if (!SELF_GATED.has(name)) {
    const g = gateSimple(name as ActionName, parsed.data);
    if (g.decision === 'blocked') return blockedResult(name, g.reasons.join(' '), ctx.actor, parsed.data);
  }

  let result: ToolResult;
  try {
    result = await tool.run(parsed.data, ctx);
  } catch (err) {
    const reason = `Tool ${name} failed: ${(err as Error).message}`;
    const rec = append({ actor: ctx.actor, action: name, tier: null, decision: 'blocked', reason, data: { params: parsed.data as Record<string, unknown> } });
    return { tool: name, tier: 0, decision: 'blocked', reasons: [reason], cards: [], summary: reason, auditSeq: rec.seq };
  }

  const rec = append({
    actor: ctx.actor,
    action: name,
    tier: result.tier,
    decision: result.decision,
    reason: result.reasons.join(' ') || result.summary.slice(0, 300),
    data: { params: parsed.data as Record<string, unknown>, result: result.audit ?? {} },
  });
  for (const c of result.cards) c.auditSeq = rec.seq;
  return { ...result, tool: name, auditSeq: rec.seq };
}
