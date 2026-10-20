import { z } from 'zod';
import { getDb } from '../db';
import { now } from '../clock';
import { POLICY } from '../policy';
import { fmt } from '../money';
import { getRates } from '../fx';
import { compareProviders, getProvider, PROVIDERS } from '../providers';
import { getAccount, getPayee, getProposal, type Payee, type Proposal } from '../ledger';
import { newId, numericCode, sandboxTxId } from '../util';
import { currentBinding, gateExecution, gateProposal, requireConfirmation } from '../gate';
import { maskAccount, type BlockedCard, type Funding, type ProposalCard, type QuotesCard, type ReceiptCard } from '../cards';
import type { InvoiceFields } from '../invoice/schema';
import { defineTool, type ToolResult } from './types';

const money = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'at most 2 decimal places');

export function buildProposalCard(p: Proposal, extra: { checks?: ProposalCard['checks'] } = {}): ProposalCard {
  const payee = getPayee(p.payee_id)!;
  const funding = JSON.parse(p.funding_json) as Funding;
  const reasons = JSON.parse(p.reasons_json) as string[];
  const tier = p.tier as 2 | 3;
  return {
    type: 'proposal',
    tier,
    decision: reasons.length && payee.kind === 'saved' && tier === 3 ? 'escalated' : 'needs_confirmation',
    why:
      tier === 3
        ? `Tier 3 because: ${reasons.join(' ')} You must re-type the amount and payee, enter the one-time code, and wait ${POLICY.coolingOffSeconds} s.`
        : `Tier 2: a saved payee under ${fmt(POLICY.tier2MaxPerTxMinor, 'GBP')} within your daily limits. One click to confirm.`,
    proposalId: p.id,
    requirement: requireConfirmation(tier),
    payee: {
      id: payee.id,
      name: payee.name,
      category: payee.category,
      sortCode: payee.sort_code,
      accountMasked: maskAccount(payee.account_number ?? payee.iban),
      verified: payee.kind === 'institution',
      kind: payee.kind,
    },
    amountMinor: p.amount_minor,
    memo: p.memo,
    invoiceId: p.invoice_id,
    bindingHash: p.binding_hash,
    funding,
    reasons,
    checks: extra.checks ?? [],
    sandboxOtp: tier === 3 ? p.otp : null,
    coolingUntil: p.cooling_until,
    expiresAt: p.expires_at,
    familyRequired: !!p.family_required,
    familyStatus: p.family_status,
  };
}

async function chooseFunding(amountMinor: number, providerId?: string): Promise<{ funding: Funding; quotes: QuotesCard | null }> {
  const gbp = getAccount('acc_gbp')!;
  if (!providerId && gbp.balance_minor >= amountMinor) {
    return { funding: { source: 'acc_gbp', label: `${gbp.label} (${gbp.institution})` }, quotes: null };
  }
  const fx = await getRates();
  const cmp = compareProviders(amountMinor, fx.rates.BDT);
  const q = (providerId && cmp.quotes.find((x) => x.providerId === providerId)) || cmp.cheapest;
  const funding: Funding = {
    source: 'acc_bdt',
    label: `Family BDT account → ${q.providerName} → payee`,
    providerId: q.providerId,
    providerName: q.providerName,
    midBdtPerGbp: Number(fx.rates.BDT.toFixed(6)),
    offeredBdtPerGbp: Number(q.offeredBdtPerGbp.toFixed(6)),
    feeMinor: q.feeMinor,
    trueCostMinor: q.trueCostMinor,
    bdtPayMinor: q.bdtPayMinor,
    savingVsBankMinor: cmp.bank.trueCostMinor - q.trueCostMinor,
    rateAsOf: fx.asOf,
  };
  const quotes: QuotesCard = {
    type: 'quotes',
    tier: 1,
    decision: 'allowed',
    why: cmp.why,
    comparison: cmp,
    fx: { source: fx.source, asOf: fx.asOf, live: fx.live },
    purpose: `Funding ${fmt(amountMinor, 'GBP')} from the family's BDT account`,
  };
  return { funding, quotes };
}

export const proposePayment = defineTool({
  name: 'proposePayment',
  description:
    'Prepare a payment for the student to confirm. Use invoiceId (from readInvoice) for an invoice, or payeeId (from listPayees) plus amount in GBP for a saved payee. Never pass bank details: payees are resolved from verified records. This does NOT move money; the student must confirm in the app.',
  schema: z
    .object({
      invoiceId: z.string().max(64).optional(),
      payeeId: z.string().max(64).optional(),
      amount: money.optional(),
      fundingProviderId: z.enum(PROVIDERS.map((p) => p.id) as [string, ...string[]]).optional(),
      memo: z.string().max(140).optional(),
    })
    .passthrough()
    .refine((v) => !!v.invoiceId !== !!v.payeeId, 'give exactly one of invoiceId or payeeId'),
  parameters: {
    type: 'object',
    properties: {
      invoiceId: { type: 'string', description: 'Invoice ID returned by readInvoice' },
      payeeId: { type: 'string', description: 'Payee ID returned by listPayees (saved payees only)' },
      amount: { type: 'number', description: 'Amount in GBP (required with payeeId)' },
      fundingProviderId: { type: 'string', enum: PROVIDERS.map((p) => p.id), description: 'Optional provider for BDT→GBP funding' },
      memo: { type: 'string', description: 'Short reference' },
    },
  },
  agentCallable: true,
  async run(params): Promise<ToolResult> {
    const amountMinor = params.amount !== undefined ? Math.round(params.amount * 100) : undefined;
    const d = gateProposal({ invoiceId: params.invoiceId, payeeId: params.payeeId, amountMinor });

    if (d.decision === 'blocked') {
      const card: BlockedCard = {
        type: 'blocked',
        tier: d.tier,
        decision: 'blocked',
        title: 'Payment stopped by the Permission Gate',
        why: d.reasons[0] ?? 'Blocked.',
        reasons: d.reasons,
        checks: d.checks,
        suspicious: d.suspicious.length ? d.suspicious : undefined,
      };
      return {
        tier: d.tier,
        decision: 'blocked',
        reasons: d.reasons,
        cards: [card],
        summary: `BLOCKED by the permission gate: ${d.reasons.join(' ')} Do not try another route to pay; explain this to the student.`,
        audit: { invoiceId: params.invoiceId, payeeId: d.payee?.id ?? params.payeeId, amountMinor: d.amountMinor },
      };
    }

    const payee = d.payee as Payee;
    const amt = d.amountMinor as number;
    const { funding, quotes } = await chooseFunding(amt, params.fundingProviderId);
    const fields = d.invoiceFields as InvoiceFields | null;
    const memo = params.memo?.trim() || (fields ? `${fields.invoiceNumber ?? 'Invoice'} · ${fields.studentId ?? ''}`.trim() : payee.category);
    const t = now();
    const tier = d.tier as 2 | 3;
    const id = newId('pp');
    const draft = { payee_id: payee.id, amount_minor: amt, invoice_id: d.invoice?.id ?? null, funding_json: JSON.stringify(funding) };
    const bound = currentBinding(draft)!;
    const familyRequired = POLICY.requireFamilyApprovalForTuition && payee.category === 'tuition';

    getDb()
      .prepare(
        `INSERT INTO proposals(id, payee_id, amount_minor, currency, tier, invoice_id, funding_json, memo, binding_hash, binding_json, otp, reasons_json,
          created_at, expires_at, cooling_until, status, attempts, family_required, family_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',0,?,?)`,
      )
      .run(
        id, payee.id, amt, 'GBP', tier, draft.invoice_id, draft.funding_json, memo, bound.hash, bound.json,
        tier === 3 ? numericCode(POLICY.otpLength) : null, JSON.stringify(d.reasons),
        t, t + POLICY.confirmationTtlMs, tier === 3 ? t + POLICY.coolingOffSeconds * 1000 : null,
        familyRequired ? 1 : 0, familyRequired ? 'pending' : null,
      );
    const card = buildProposalCard(getProposal(id)!, { checks: d.checks });
    return {
      tier,
      decision: d.decision,
      reasons: d.reasons,
      cards: quotes ? [quotes, card] : [card],
      summary: `Payment of ${fmt(amt, 'GBP')} to ${payee.name} prepared (proposalId=${id}, Tier ${tier}). ${
        tier === 3 ? 'The student must re-type the amount and payee name, enter the one-time code and wait for the cooling-off timer.' : 'The student confirms with one click.'
      } ${funding.source === 'acc_bdt' ? `Funded from BDT via ${funding.providerName}, true cost ${fmt(funding.trueCostMinor, 'GBP')}, saving ${fmt(funding.savingVsBankMinor, 'GBP')} vs the bank.` : 'Paid from the UK GBP account.'} Money has NOT moved yet.`,
      audit: { proposalId: id, payeeId: payee.id, amountMinor: amt, invoiceId: draft.invoice_id, bindingHash: bound.hash, funding: funding.source === 'acc_bdt' ? funding.providerId : 'acc_gbp' },
    };
  },
});

export const executePayment = defineTool({
  name: 'executePayment',
  description: 'Execute a confirmed payment. Student-only: called by the confirmation screen, never offered to the LLM.',
  schema: z.object({
    proposalId: z.string().max(64),
    bindingHash: z.string().regex(/^[0-9a-f]{64}$/),
    typedAmount: z.string().max(32).optional(),
    typedPayeeName: z.string().max(120).optional(),
    otp: z.string().max(12).optional(),
  }),
  parameters: { type: 'object', properties: {} },
  agentCallable: false,
  async run(params, ctx): Promise<ToolResult> {
    const db = getDb();
    const p = getProposal(params.proposalId);
    const d = gateExecution(p, params, ctx.actor);
    const blocked = (reasons: string[], decision: 'blocked' | 'escalated' = 'blocked', extraCards: ToolResult['cards'] = []): ToolResult => ({
      tier: d.tier,
      decision,
      reasons,
      cards: [
        { type: 'blocked', tier: d.tier, decision, title: decision === 'escalated' ? 'Escalated to Tier 3' : 'Payment not executed', why: reasons[0] ?? '', reasons, checks: d.checks },
        ...extraCards,
      ],
      summary: `${decision.toUpperCase()}: ${reasons.join(' ')}`,
      audit: { proposalId: params.proposalId, payeeId: p?.payee_id, amountMinor: p?.amount_minor, effect: d.effect },
    });

    switch (d.effect) {
      case 'none':
        return blocked(d.reasons);
      case 'mark_expired':
        db.prepare(`UPDATE proposals SET status = 'expired' WHERE id = ?`).run(p!.id);
        return blocked(d.reasons);
      case 'mark_blocked':
        db.prepare(`UPDATE proposals SET status = 'blocked' WHERE id = ?`).run(p!.id);
        return blocked(d.reasons);
      case 'count_attempt': {
        const attempts = p!.attempts + 1;
        db.prepare(`UPDATE proposals SET attempts = ?, status = CASE WHEN ? >= ? THEN 'cancelled' ELSE status END WHERE id = ?`).run(attempts, attempts, POLICY.maxConfirmAttempts, p!.id);
        return blocked(d.reasons);
      }
      case 'escalate_to_tier3': {
        const t = now();
        const reasons = JSON.stringify(d.reasons.slice(1));
        db.prepare(`UPDATE proposals SET tier = 3, otp = ?, cooling_until = ?, reasons_json = ?, expires_at = ? WHERE id = ?`).run(
          numericCode(POLICY.otpLength), t + POLICY.coolingOffSeconds * 1000, reasons, t + POLICY.confirmationTtlMs, p!.id,
        );
        return blocked(d.reasons, 'escalated', [buildProposalCard(getProposal(p!.id)!)]);
      }
      case 'execute':
        break;
    }

    // Execute in one SQLite transaction: debit, ledger entry, proposal status, tuition schedule.
    const prop = p!;
    const payee = getPayee(prop.payee_id)!;
    const funding = JSON.parse(prop.funding_json) as Funding;
    const accountId = funding.source;
    const debitMinor = funding.source === 'acc_bdt' ? funding.bdtPayMinor : prop.amount_minor;
    const account = getAccount(accountId)!;
    if (account.balance_minor < debitMinor) {
      return blocked([`Insufficient funds in ${account.label}: need ${fmt(debitMinor, account.currency)}, have ${fmt(account.balance_minor, account.currency)}.`]);
    }
    const txId = sandboxTxId();
    const t = now();
    db.transaction(() => {
      db.prepare('UPDATE accounts SET balance_minor = balance_minor - ? WHERE id = ?').run(debitMinor, accountId);
      db.prepare(
        'INSERT INTO transactions(id, account_id, ts, amount_minor, currency, category, description, payee_id, sandbox_tx_id, proposal_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        newId('tx'), accountId, t, -debitMinor, account.currency, payee.category === 'tuition' ? 'tuition' : payee.category,
        `${payee.name} — ${prop.memo}${funding.source === 'acc_bdt' ? ` (via ${funding.providerName})` : ''}`, payee.id, txId, prop.id,
      );
      db.prepare(`UPDATE proposals SET status = 'executed', executed_tx_id = ?, executed_at = ? WHERE id = ?`).run(txId, t, prop.id);
      if (payee.category === 'tuition') {
        db.prepare(
          `UPDATE tuition_schedule SET status = 'paid' WHERE id = (SELECT id FROM tuition_schedule WHERE status = 'due' AND amount_minor = ? ORDER BY due_date LIMIT 1)`,
        ).run(prop.amount_minor);
      }
    })();

    const receipt: ReceiptCard = {
      type: 'receipt',
      tier: prop.tier as 2 | 3,
      decision: 'allowed',
      why: `Paid in the sandbox after ${prop.tier === 3 ? 'strong confirmation, payee check, OTP and cooling-off' : 'your one-click confirmation'}. The binding hash matched what you approved.`,
      proposalId: prop.id,
      sandboxTxId: txId,
      payeeName: payee.name,
      amountMinor: prop.amount_minor,
      funding,
      executedAt: new Date(t).toISOString(),
      bindingHash: prop.binding_hash,
    };
    return {
      tier: prop.tier as 2 | 3,
      decision: 'allowed',
      reasons: [],
      cards: [receipt],
      summary: `Executed: ${fmt(prop.amount_minor, 'GBP')} to ${payee.name}, sandbox transaction ${txId}.`,
      audit: { proposalId: prop.id, payeeId: payee.id, amountMinor: prop.amount_minor, sandboxTxId: txId, debit: { accountId, debitMinor } },
    };
  },
});

export function getProviderName(id: string): string {
  return getProvider(id)?.name ?? id;
}
