/**
 * Read/write helpers for the sandbox ledger. No policy decisions live here — those are in lib/gate.
 */
import { getDb } from './db';
import { now } from './clock';
import { POLICY } from './policy';
import type { Currency } from './money';

export interface Account {
  id: string;
  label: string;
  holder: string;
  institution: string;
  currency: Currency;
  balance_minor: number;
}

export interface Payee {
  id: string;
  name: string;
  kind: 'institution' | 'saved';
  category: string;
  sort_code: string | null;
  account_number: string | null;
  iban: string | null;
  currency: 'GBP';
  allowlist_id: string | null;
  created_at: number;
}

export interface AllowlistEntry {
  id: string;
  institution: string;
  payee_name: string;
  sort_code: string | null;
  account_number: string | null;
  iban: string | null;
  currency: 'GBP';
  category: string;
  source: string;
  verified_at: string;
}

export interface Proposal {
  id: string;
  payee_id: string;
  amount_minor: number;
  currency: 'GBP';
  tier: 2 | 3;
  invoice_id: string | null;
  funding_json: string;
  memo: string;
  binding_hash: string;
  binding_json: string;
  otp: string | null;
  reasons_json: string;
  created_at: number;
  expires_at: number;
  cooling_until: number | null;
  status: 'pending' | 'executed' | 'blocked' | 'expired' | 'cancelled';
  attempts: number;
  family_required: number;
  family_status: 'pending' | 'approved' | 'rejected' | null;
  executed_tx_id: string | null;
  executed_at: number | null;
}

export interface Block {
  id: string;
  kind: 'payee_name' | 'account' | 'amount' | 'keyword';
  value: string;
  reason: string;
  source: string;
  created_at: number;
  expires_at: number;
}

export interface InvoiceRow {
  id: string;
  document_id: string;
  fields_json: string;
  suspicious_json: string;
  fields_hash: string;
  extractor: string;
  created_at: number;
}

const db = () => getDb();

export const getAccounts = (): Account[] => db().prepare('SELECT * FROM accounts ORDER BY rowid').all() as Account[];
export const getAccount = (id: string): Account | undefined =>
  db().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;

export const getPayees = (): Payee[] => db().prepare('SELECT * FROM payees ORDER BY kind, name').all() as Payee[];
export const getPayee = (id: string): Payee | undefined =>
  db().prepare('SELECT * FROM payees WHERE id = ?').get(id) as Payee | undefined;

export const getAllowlist = (): AllowlistEntry[] => db().prepare('SELECT * FROM allowlist').all() as AllowlistEntry[];
export const getAllowlistEntry = (id: string): AllowlistEntry | undefined =>
  db().prepare('SELECT * FROM allowlist WHERE id = ?').get(id) as AllowlistEntry | undefined;
export const getPayeeByAllowlist = (allowlistId: string): Payee | undefined =>
  db().prepare('SELECT * FROM payees WHERE allowlist_id = ?').get(allowlistId) as Payee | undefined;

export const getProposal = (id: string): Proposal | undefined =>
  db().prepare('SELECT * FROM proposals WHERE id = ?').get(id) as Proposal | undefined;

export const getInvoice = (id: string): InvoiceRow | undefined =>
  db().prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined;

export function activeBlocks(at = now()): Block[] {
  return db().prepare('SELECT * FROM blocks WHERE expires_at > ? ORDER BY created_at DESC').all(at) as Block[];
}

export interface RollingTotals {
  payeeTotalMinor: number;
  allTotalMinor: number;
  payeeCount: number;
}

/**
 * Sum of outgoing payments in the rolling window. Executed payments always count.
 * With includePending, unexpired pending proposals count too, so ten £99 proposals
 * made in one go cannot each look like the first.
 */
export function rollingTotals(payeeId: string, opts: { includePending: boolean; excludeProposalId?: string; at?: number }): RollingTotals {
  const at = opts.at ?? now();
  const since = at - POLICY.rollingWindowMs;
  const statusClause = opts.includePending
    ? `((status = 'executed' AND executed_at > @since) OR (status = 'pending' AND expires_at > @at))`
    : `(status = 'executed' AND executed_at > @since)`;
  const exclude = opts.excludeProposalId ? 'AND id != @exclude' : '';
  const q = (extra: string) => {
    // Only saved-payee payments count: verified-institution payments (tuition) are always Tier 3 already,
    // and counting them would push every small payment that day into Tier 3 for no security gain.
    const sql = `SELECT COALESCE(SUM(amount_minor),0) AS total, COUNT(*) AS n FROM proposals
      WHERE ${statusClause} ${exclude} ${extra} AND payee_id IN (SELECT id FROM payees WHERE kind = 'saved')`;
    const params: Record<string, unknown> = { since };
    if (opts.includePending) params.at = at;
    if (opts.excludeProposalId) params.exclude = opts.excludeProposalId;
    if (extra) params.payee = payeeId;
    return db().prepare(sql).get(params) as { total: number; n: number };
  };
  const all = q('');
  const payee = q('AND payee_id = @payee');
  return { payeeTotalMinor: payee.total, allTotalMinor: all.total, payeeCount: payee.n };
}
