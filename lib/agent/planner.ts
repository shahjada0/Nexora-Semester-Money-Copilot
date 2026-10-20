/**
 * Scripted planner: the rule-based fallback when there is no API key or the LLM fails.
 * It chooses tools from keywords, then runs them through the same runTool() → gate path.
 * It never decides whether a payment is allowed — it always asks the gate.
 */
import { getPayees } from '../ledger';
import { normName } from '../util';

export interface PlannedCall {
  tool: string;
  params: Record<string, unknown>;
  /** Run only if the previous call produced an invoice id. */
  needsInvoice?: boolean;
}

export interface Plan {
  intent: string;
  calls: PlannedCall[];
  intro: string;
}

const amountIn = (s: string): number | null => {
  const m = s.match(/£\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:gbp|pounds?)\b/i);
  if (!m) return null;
  const n = Number((m[1] ?? m[2]).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function findPayee(text: string): { id: string; name: string } | null {
  const t = normName(text);
  let best: { id: string; name: string; score: number } | null = null;
  for (const p of getPayees()) {
    const words = normName(p.name).split(' ').filter((w) => w.length > 2 && !['ltd', 'the', 'university', 'services'].includes(w));
    const score = words.filter((w) => t.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: p.id, name: p.name, score };
  }
  return best ? { id: best.id, name: best.name } : null;
}

export function planFor(message: string, documentId: string | null): Plan {
  const m = message.trim();
  const lower = m.toLowerCase();

  if (documentId || /\binvoice\b|pay (my )?(tuition|fees?)|tuition (fee|payment)/.test(lower)) {
    return {
      intent: 'pay-invoice',
      intro: 'I read your invoice and checked the bank details against the university’s official record.',
      calls: [
        { tool: 'readInvoice', params: documentId ? { documentId } : {} },
        { tool: 'proposePayment', params: {}, needsInvoice: true },
      ],
    };
  }

  const looksPasted = m.length > 140 || /^["“']/.test(m) || /\b(is this|scam|suspicious|legit|real\??|fraud|got this|received this|check this|got a (call|text|message|email)|someone (called|texted|messaged)|asking (me )?for (money|payment|my))\b/.test(lower);
  const isPayCommand = /^\s*(please\s+)?(pay|send)\b/.test(lower) && m.length <= 140;
  if (looksPasted && !isPayCommand) {
    const body = m.replace(/^(is this (a )?(scam|real|legit)\??|can you check this( message)?|check this( message)?|i got this( message)?|scam check)\s*[:\-]?\s*/i, '');
    return { intent: 'scam-check', intro: 'I checked that message for common scam patterns.', calls: [{ tool: 'scamCheck', params: { message: body || m } }] };
  }

  if (/\balert|notify|tell me when|let me know when\b/.test(lower)) {
    const n = lower.match(/(\d{2,3}(?:\.\d+)?)/);
    const target = n ? Number(n[1]) : null;
    if (target) {
      const direction = /\b(below|under|drops? below|falls? below)\b/.test(lower) ? 'below' : 'above';
      return { intent: 'rate-alert', intro: 'Rate alert set.', calls: [{ tool: 'setRateAlert', params: { target, direction } }] };
    }
  }

  if (/how much (money )?(do|will|would|should) (i|we|abbu|ammu|my (parents|family|father|mother)) (need|send)|end of (the )?month|this month|next month|monthly (budget|spend|costs?)|\bbudget\b|need (for|this|next) month/.test(lower)) {
    return { intent: 'monthly', intro: 'Here is what you need for the next 30 days, and how much is already in the UK.', calls: [{ tool: 'monthlyNeeds', params: {} }] };
  }

  if (/\b(months?|runway|last|run out|enough money|how long|shock|taka (falls|drops))\b/.test(lower)) {
    return { intent: 'runway', intro: 'Here is how long your money lasts, at today’s rate and if the taka falls 10%.', calls: [{ tool: 'monthsLeft', params: {} }] };
  }

  if (/^\s*(please\s+)?(pay|send)\b/.test(lower) && !/\b(from home|family|parents?|abbu|ammu)\b/.test(lower)) {
    const payee = findPayee(m);
    const amount = amountIn(m);
    if (payee && amount) {
      return {
        intent: 'pay-payee',
        intro: `I asked the Permission Gate to prepare ${amount.toFixed(2)} GBP to ${payee.name}.`,
        calls: [{ tool: 'proposePayment', params: { payeeId: payee.id, amount } }],
      };
    }
    return { intent: 'list-payees', intro: 'I can only pay saved payees or verified institutions. Here they are — tell me who and how much.', calls: [{ tool: 'listPayees', params: {} }] };
  }

  if (/\b(compare|cheap(er|est)?|provider|send money|transfer|exchange|rate|true cost|fees?|hundi|hawala|bank)\b/.test(lower)) {
    const amount = amountIn(m) ?? 6300;
    const hundi = /\b(hundi|hawala)\b/.test(lower);
    return {
      intent: 'quotes',
      intro: hundi
        ? 'Hundi and hawala are illegal in Bangladesh and give you no protection if the money disappears. Here are licensed options compared by true cost instead.'
        : `I compared licensed providers for £${amount.toLocaleString('en-GB')} from BDT by true cost (fee + hidden exchange-rate markup).`,
      calls: [{ tool: 'getQuotes', params: { amount } }],
    };
  }

  if (/\b(balance|how much (money )?(do i|have i)|accounts?|total)\b/.test(lower)) {
    return { intent: 'balances', intro: 'Your balances, converted to GBP at the mid-market rate.', calls: [{ tool: 'getBalances', params: {} }] };
  }

  if (/\b(plan|when should|best time|semester|calendar)\b/.test(lower)) {
    return {
      intent: 'plan',
      intro: 'Here is your semester plan: every deadline, with transfer dates chosen so the family never has to send everything on one bad-rate day just before a deadline.',
      calls: [{ tool: 'planSemester', params: {} }],
    };
  }

  if (/\b(schedule|deadline|due|owe|next (tuition|instalment|payment))\b/.test(lower)) {
    return { intent: 'schedule', intro: 'Your semester at a glance.', calls: [{ tool: 'getSchedule', params: {} }] };
  }

  if (/\bpayees?\b/.test(lower)) return { intent: 'list-payees', intro: 'Your saved payees and verified institutions.', calls: [{ tool: 'listPayees', params: {} }] };

  return {
    intent: 'help',
    intro:
      'I can pay your tuition from an uploaded invoice (with payee checks), compare transfer providers by true cost, show how many months your money lasts, check a suspicious message, and set rate alerts. What would you like to do?',
    calls: [],
  };
}
