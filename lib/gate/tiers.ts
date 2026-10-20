import { POLICY, type Tier } from '../policy';
import type { Payee, RollingTotals } from '../ledger';
import { fmt } from '../money';
import { checkLimits } from './limits';

export const ACTIONS = [
  'getBalances',
  'readInvoice',
  'getFxRates',
  'monthsLeft',
  'monthlyNeeds',
  'getSchedule',
  'listPayees',
  'getQuotes',
  'computeTrueCost',
  'scamCheck',
  'setRateAlert',
  'proposePayment',
  'executePayment',
  'requestFamilyApproval',
  'familyDecision',
  'planSemester',
] as const;

export type ActionName = (typeof ACTIONS)[number];

/** Base tier of each action. Payment actions are then raised by their parameters. */
const BASE_TIER: Record<ActionName, Tier> = {
  getBalances: 0,
  readInvoice: 0,
  getFxRates: 0,
  monthsLeft: 0,
  monthlyNeeds: 0,
  getSchedule: 0,
  listPayees: 0,
  getQuotes: 1,
  computeTrueCost: 1,
  scamCheck: 1,
  setRateAlert: 1,
  proposePayment: 2,
  executePayment: 2,
  requestFamilyApproval: 3,
  familyDecision: 3,
  planSemester: 1,
};

export interface TierContext {
  now: number;
  payee?: Payee;
  rolling?: RollingTotals;
}

export interface TierResult {
  tier: Tier;
  reasons: string[];
}

const PAYMENT_ACTIONS = new Set<ActionName>(['proposePayment', 'executePayment']);

/**
 * Decide the tier from the action name and its parameters. Pure function: no LLM, no I/O.
 * Any field the caller adds (e.g. "tier": 0) is ignored — only payeeId/amountMinor are read,
 * and the payee itself comes from the ledger, not from the caller.
 */
export function classifyTier(action: ActionName, params: unknown, ctx: TierContext): TierResult {
  if (!(action in BASE_TIER)) {
    return { tier: 3, reasons: [`Unknown action "${String(action)}" is treated as highest risk.`] };
  }
  const base = BASE_TIER[action];
  if (!PAYMENT_ACTIONS.has(action)) return { tier: base, reasons: [] };

  const p = (params ?? {}) as { amountMinor?: unknown };
  const amountMinor = typeof p.amountMinor === 'number' && Number.isFinite(p.amountMinor) ? p.amountMinor : Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  const payee = ctx.payee;

  if (!payee) {
    reasons.push('Payee is not a saved payee or verified institution.');
  } else {
    if (payee.kind === 'institution') {
      reasons.push(`${payee.category === 'tuition' ? 'Tuition' : 'Institution'} payments are always Tier 3.`);
    }
    if (ctx.now - payee.created_at < POLICY.newPayeeCoolingMs) {
      reasons.push(`"${payee.name}" is a new payee (added less than 24 h ago).`);
    }
  }

  if (!Number.isFinite(amountMinor)) {
    reasons.push('Amount is missing or invalid.');
  } else if (payee?.kind === 'institution') {
    // Already Tier 3 whatever the amount; limit lines would only add noise to the explanation.
  } else {
    const lim = checkLimits(amountMinor, ctx.rolling ?? { payeeTotalMinor: 0, allTotalMinor: 0, payeeCount: 0 });
    if (lim.overTier2) reasons.push(`Amount ${fmt(amountMinor, 'GBP')} is not under the ${fmt(POLICY.tier2MaxPerTxMinor, 'GBP')} small-payment limit.`);
    if (lim.overPayeeDaily)
      reasons.push(
        `Payments to this payee in the last 24 h would reach ${fmt(lim.projectedPayeeMinor, 'GBP')} (limit ${fmt(POLICY.perPayeeDailyLimitMinor, 'GBP')} per payee).`,
      );
    if (lim.overDaily)
      reasons.push(`Your total payments in the last 24 h would reach ${fmt(lim.projectedAllMinor, 'GBP')} (daily limit ${fmt(POLICY.dailyTotalLimitMinor, 'GBP')}).`);
  }

  return { tier: reasons.length > 0 ? 3 : base, reasons };
}
