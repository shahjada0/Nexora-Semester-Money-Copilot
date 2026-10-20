/**
 * Rich cards the chat renders. Cards are built by deterministic tool code from tool results,
 * never from LLM text, so what the student sees is what the gate decided.
 */
import type { Tier } from './policy';
import type { CheckLine } from './gate/payee';
import type { Comparison } from './providers';
import type { InvoiceFields } from './invoice/schema';
import type { ConfirmationRequirement } from './gate/confirm';

export type Decision = 'allowed' | 'needs_confirmation' | 'escalated' | 'blocked';

interface Base {
  tier: Tier;
  decision: Decision;
  why: string;
  auditSeq?: number;
}

export interface BalancesCard extends Base {
  type: 'balances';
  accounts: { id: string; label: string; institution: string; currency: string; balanceMinor: number; gbpMinor: number }[];
  totalGbpMinor: number;
  fx: { bdtPerGbp: number; usdPerGbp: number; source: string; asOf: string; live: boolean };
}

export interface InvoiceCard extends Base {
  type: 'invoice';
  invoiceId: string;
  filename: string;
  fields: InvoiceFields;
  extractor: 'llm' | 'rules';
  fallbackReason: string | null;
  suspicious: string[];
  payeeCheck: { ok: boolean; lines: CheckLine[]; reasons: string[] };
  fieldsHash: string;
}

export interface QuotesCard extends Base {
  type: 'quotes';
  comparison: Comparison;
  fx: { source: string; asOf: string; live: boolean };
  purpose: string;
}

export interface ProposalCard extends Base {
  type: 'proposal';
  proposalId: string;
  requirement: ConfirmationRequirement;
  payee: { id: string; name: string; category: string; sortCode: string | null; accountMasked: string; verified: boolean; kind: 'institution' | 'saved' };
  amountMinor: number;
  memo: string;
  invoiceId: string | null;
  bindingHash: string;
  funding: Funding;
  reasons: string[];
  checks: CheckLine[];
  /** Sandbox only: the mock OTP is displayed so the demo can be completed. Never logged. */
  sandboxOtp: string | null;
  coolingUntil: number | null;
  expiresAt: number;
  familyRequired: boolean;
  familyStatus: string | null;
}

export interface ReceiptCard extends Base {
  type: 'receipt';
  proposalId: string;
  sandboxTxId: string;
  payeeName: string;
  amountMinor: number;
  funding: Funding;
  executedAt: string;
  bindingHash: string;
}

export interface BlockedCard extends Base {
  type: 'blocked';
  title: string;
  reasons: string[];
  checks: CheckLine[];
  suspicious?: string[];
}

export interface AlertCard extends Base {
  type: 'alert';
  alertId: string;
  pair: string;
  direction: 'above' | 'below';
  target: number;
  current: number;
}

export interface RunwayScenario {
  label: string;
  bdtPerGbp: number;
  totalGbpMinor: number;
  monthsLeft: number;
  monthsLeftAfterTuition: number;
  fundsAtDeadlineMinor: number;
  shortfallMinor: number;
  runsOutBeforeDeadline: boolean;
}

export interface RunwayCard extends Base {
  type: 'runway';
  monthlySpendMinor: number;
  nextDeadline: { label: string; dueDate: string; amountMinor: number; daysAway: number } | null;
  base: RunwayScenario;
  shock: RunwayScenario;
  warning: string | null;
  suggestion: { sendBdtMinor: number; byDate: string; atRate: number; text: string } | null;
}

export interface ScamCard extends Base {
  type: 'scam';
  risk: 'high' | 'medium' | 'low';
  category: string;
  redFlags: string[];
  doInstead: string[];
  blocksPlaced: { kind: string; value: string; expiresAt: number }[];
  classifier: 'llm+rules' | 'rules';
}

export interface ScheduleCard extends Base {
  type: 'schedule';
  items: { date: string; label: string; kind: string; amountMinor?: number; currency?: string; status?: string }[];
}

export interface PayeesCard extends Base {
  type: 'payees';
  payees: { id: string; name: string; kind: string; category: string; accountMasked: string; isNew: boolean }[];
}

export interface FamilyCard extends Base {
  type: 'family';
  proposalId: string;
  link: string;
  expiresAt: number;
  approver: string;
}

export interface MonthlyCard extends Base {
  type: 'monthly';
  periodEnd: string;
  categories: { category: string; monthlyMinor: number }[];
  livingMinor: number;
  tuitionDue: { label: string; dueDate: string; amountMinor: number }[];
  totalNeedMinor: number;
  inUkMinor: number;
  shortfallMinor: number;
  send: { bdtMinor: number; providerName: string; byDate: string } | null;
}

export type Card =
  | MonthlyCard
  | BalancesCard
  | InvoiceCard
  | QuotesCard
  | ProposalCard
  | ReceiptCard
  | BlockedCard
  | AlertCard
  | RunwayCard
  | ScamCard
  | ScheduleCard
  | PayeesCard
  | FamilyCard;

export type Funding =
  | { source: 'acc_gbp'; label: string }
  | {
      source: 'acc_bdt';
      label: string;
      providerId: string;
      providerName: string;
      midBdtPerGbp: number;
      offeredBdtPerGbp: number;
      feeMinor: number;
      trueCostMinor: number;
      bdtPayMinor: number;
      savingVsBankMinor: number;
      rateAsOf: string;
    };

export const maskAccount = (s: string | null | undefined): string => {
  const d = (s ?? '').replace(/[\s-]/g, '');
  return d ? `••••${d.slice(-4)}` : '—';
};
