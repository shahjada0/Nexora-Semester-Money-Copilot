/**
 * Agent loop. The LLM chooses tools; every call goes through runTool() → Permission Gate → audit.
 * Fallbacks: no key, rate limit, timeout or repeated invalid tool calls → scripted planner,
 * which runs the same tools through the same gate. The demo never depends on the LLM.
 */
import { getLLM, LLMError, type ChatMessage, type ToolDef } from '../llm/provider';
import { agentTools, runTool, type RunResult } from '../tools';
import { append } from '../audit';
import { POLICY } from '../policy';
import type { Card } from '../cards';
import { SYSTEM_PROMPT } from './prompt';
import { planFor } from './planner';
import { plainStop } from '../plain';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AgentStep {
  tool: string;
  params: unknown;
  tier: number;
  decision: string;
  auditSeq: number;
}

export interface AgentReply {
  text: string;
  cards: Card[];
  steps: AgentStep[];
  mode: 'llm' | 'scripted';
  model: string | null;
  notice: string | null;
}

function toolDefs(): ToolDef[] {
  return agentTools().map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

/** Guard the final text: the cards are the source of truth, not the model's words. */
function guardText(text: string, cards: Card[]): string {
  let out = text.trim();
  const executed = cards.some((c) => c.type === 'receipt');
  if (!executed && /\b(i|i'?ve|i have|has been|have been|was|were|is now|successfully|already)\s+(paid|sent|transferred|completed|executed|made the payment)\b|\bpayment (is )?(done|complete)\b/i.test(out)) {
    out += '\n\nNote: nothing has been paid yet. Payments only happen after you confirm in the card below.';
  }
  if (/\b(hundi|hawala)\b/i.test(out) && !/illegal/i.test(out)) {
    out += '\n\nHundi and hawala are illegal in Bangladesh and offer no protection. Use a licensed provider.';
  }
  return out;
}

async function runScripted(message: string, documentId: string | null, notice: string | null): Promise<AgentReply> {
  const plan = planFor(message, documentId);
  const cards: Card[] = [];
  const steps: AgentStep[] = [];
  let invoiceId: string | null = null;
  const texts: string[] = [];
  for (const call of plan.calls) {
    if (call.needsInvoice && !invoiceId) break;
    const params = call.needsInvoice ? { ...call.params, invoiceId } : call.params;
    const r = await runTool(call.tool, params, { actor: 'agent' });
    steps.push({ tool: call.tool, params, tier: r.tier, decision: r.decision, auditSeq: r.auditSeq });
    cards.push(...r.cards);
    const inv = r.cards.find((c) => c.type === 'invoice') as { invoiceId: string } | undefined;
    if (inv) invoiceId = inv.invoiceId;
    if (r.decision === 'blocked') texts.push(plainStop(r.reasons));
  }
  const proposal = cards.find((c) => c.type === 'proposal');
  if (proposal) texts.push(proposal.tier === 3 ? 'Please check the details below and confirm. Nothing is paid until you do.' : 'Tap Pay below to send it.');
  return { text: [plan.intro, ...texts].join(' '), cards, steps, mode: 'scripted', model: null, notice };
}

export async function runAgent(history: ChatTurn[], message: string, documentId: string | null): Promise<AgentReply> {
  const llm = getLLM();
  if (!llm) return runScripted(message, documentId, null);

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as ChatMessage),
    {
      role: 'user',
      content: documentId ? `${message}\n\n[The student attached a document: documentId=${documentId}. Use readInvoice to read it.]` : message,
    },
  ];
  const cards: Card[] = [];
  const steps: AgentStep[] = [];
  const validationRetries = new Map<string, number>();

  try {
    for (let step = 0; step < POLICY.maxAgentSteps; step++) {
      const res = await llm.chat({ messages, tools: toolDefs(), temperature: 0.2, maxTokens: 600 });
      if (res.toolCalls.length === 0) {
        const text = res.content?.trim() || (cards.length ? 'Done — see the details below.' : 'How can I help with your semester money?');
        return { text: guardText(text, cards), cards, steps, mode: 'llm', model: llm.model, notice: null };
      }
      messages.push({ role: 'assistant', content: res.content ?? null, tool_calls: res.toolCalls });
      for (const call of res.toolCalls) {
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = undefined;
        }
        let r: RunResult;
        if (args === undefined) {
          r = await runTool(call.function.name, { __invalidJson: call.function.arguments.slice(0, 200) }, { actor: 'agent' });
        } else {
          r = await runTool(call.function.name, args, { actor: 'agent' });
        }
        steps.push({ tool: call.function.name, params: args, tier: r.tier, decision: r.decision, auditSeq: r.auditSeq });

        let content = `[${r.decision.toUpperCase()} · Tier ${r.tier}] ${r.summary}`;
        if (r.validationError) {
          const n = (validationRetries.get(call.function.name) ?? 0) + 1;
          validationRetries.set(call.function.name, n);
          if (n > 1) throw new LLMError('api', `Repeated invalid tool calls for ${call.function.name}`);
          content = `Invalid parameters: ${r.validationError}. Fix the parameters and call the tool again.`;
        } else {
          cards.push(...r.cards);
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
    return { text: guardText('I have prepared what I can — see the cards below.', cards), cards, steps, mode: 'llm', model: llm.model, notice: null };
  } catch (err) {
    const e = err as Error;
    const notice =
      err instanceof LLMError && err.kind === 'rate_limit'
        ? `${/quota/.test(e.message) ? e.message : 'The AI service is rate-limited right now.'} The offline planner handled this request. The safety checks are exactly the same.`
        : `The AI service had a problem (${e.message.slice(0, 120)}), so the offline planner handled this request. The safety checks are exactly the same.`;
    append({ actor: 'system', action: 'agent.fallback', tier: null, decision: 'info', reason: notice, data: { error: e.message.slice(0, 200), stepsBeforeFallback: steps.length } });
    // Do not repeat side-effecting steps the LLM already completed; show what it did and fall back only if nothing ran.
    if (steps.length > 0) {
      return { text: guardText('Here is what I completed before the AI service stopped responding.', cards), cards, steps, mode: 'llm', model: llm.model, notice };
    }
    return runScripted(message, documentId, notice);
  }
}
