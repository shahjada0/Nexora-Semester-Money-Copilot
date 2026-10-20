/**
 * Permission Gate. Plain TypeScript, no LLM. Every tool call passes through here
 * (via lib/tools/index.ts → runTool). Payment decisions are made only from ledger data:
 * the payee comes from the saved-payee table or the institution allowlist, never from text
 * the LLM produced, and limits are recomputed at both proposal and execution time.
 */
import { now } from '../clock';
import { POLICY, type Tier } from '../policy';
import { fmt } from '../money';
import { canonicalJSON, sha256 } from '../util';
import {
  activeBlocks,
  getAllowlist,
  getInvoice,
  getPayee,
  getPayeeByAllowlist,
  rollingTotals,
  type InvoiceRow,
  type Payee,
  type Proposal,
} from '../ledger';
import type { InvoiceFields } from '../invoice/schema';
import { classifyTier, type ActionName } from './tiers';
import { checkPayee, matchInvoicePayee, type CheckLine, type PayeeCheck } from './payee';
import { checkBlocks, checkLimits } from './limits';
import { bindConfirmation, checkTypedConfirmation, hashesEqual, type Binding, type TypedInput } from './confirm';

export { classifyTier } from './tiers';
export { checkPayee, matchInvoicePayee } from './payee';
export { checkLimits, checkBlocks } from './limits';
export { requireConfirmation, bindConfirmation } from './confirm';
export type { ActionName } from './tiers';

export type GateDecisionKind = 'allowed' | 'needs_confirmation' | 'escalated' | 'blocked';

export interface GateDecision {
  action: ActionName;
  tier: Tier;
  decision: GateDecisionKind;
  reasons: string[];
  checks: CheckLine[];
}

/** Tier 0 / Tier 1 actions: allowed automatically; the tier is still recorded. */
export function gateSimple(action: ActionName, params: unknown): GateDecision {
  const { tier, reasons } = classifyTier(action, params, { now: now() });
  if (tier >= 2) return { action, tier, decision: 'blocked', reasons: ['This action needs the payment flow.', ...reasons], checks: [] };
  return { action, tier, decision: 'allowed', reasons, checks: [] };
}

export function invoiceFieldsHash(fields: InvoiceFields): string {
  return sha256(canonicalJSON(fields));
}

export interface ProposalRequest {
  payeeId?: string;
  invoiceId?: string;
  amountMinor?: number;
}

export interface ProposalDecision extends GateDecision {
  payee: Payee | null;
  amountMinor: number | null;
  invoice: InvoiceRow | null;
  invoiceFields: InvoiceFields | null;
  payeeCheck: PayeeCheck | null;
  suspicious: string[];
}

/** Decide whether a payment may be proposed, and at which tier. */
export function gateProposal(req: ProposalRequest): ProposalDecision {
  const t = now();
  const checks: CheckLine[] = [];
  let payee: Payee | null = null;
  let amountMinor: number | null = req.amountMinor ?? null;
  let invoice: InvoiceRow | null = null;
  let invoiceFields: InvoiceFields | null = null;
  let payeeCheck: PayeeCheck | null = null;
  let suspicious: string[] = [];

  const out = (decision: GateDecisionKind, tier: Tier, reasons: string[]): ProposalDecision => ({
    action: 'proposePayment', tier, decision, reasons, checks, payee, amountMinor, invoice, invoiceFields, payeeCheck, suspicious,
  });

  if (req.invoiceId) {
    invoice = getInvoice(req.invoiceId) ?? null;
    if (!invoice) return out('blocked', 3, ['Unknown invoice. Upload the invoice first so it can be read and checked.']);
    invoiceFields = JSON.parse(invoice.fields_json) as InvoiceFields;
    suspicious = JSON.parse(invoice.suspicious_json) as string[];

    const intact = invoiceFieldsHash(invoiceFields) === invoice.fields_hash;
    checks.push({ label: 'Invoice unchanged since read', passed: intact, detail: intact ? `hash ${invoice.fields_hash.slice(0, 12)}…` : 'fields hash mismatch' });
    if (!intact) return out('blocked', 3, ['The invoice changed after it was read. Re-upload the original invoice.']);

    payeeCheck = matchInvoicePayee(invoiceFields, getAllowlist());
    checks.push(...payeeCheck.lines);
    if (!payeeCheck.ok) {
      return out('blocked', 3, ['Payee check failed — payment stopped and escalated to Tier 3.', ...payeeCheck.reasons]);
    }
    if (POLICY.blockOnSuspiciousInstructions && suspicious.length > 0) {
      checks.push({ label: 'No hidden instructions', passed: false, detail: `${suspicious.length} found` });
      return out('blocked', 3, [
        `This invoice contains ${suspicious.length} instruction(s) aimed at the payment assistant. They were not followed. Get a clean copy of the invoice from your university's official portal before paying.`,
      ]);
    }
    if (invoiceFields.currency !== 'GBP') return out('blocked', 3, [`Invoice currency ${invoiceFields.currency ?? 'unknown'} is not supported; tuition is paid in GBP.`]);
    if (!invoiceFields.amount) return out('blocked', 3, ['No amount could be read from the invoice.']);
    const invAmount = Math.round(invoiceFields.amount * 100);
    if (amountMinor !== null && amountMinor !== invAmount) {
      return out('blocked', 3, [`Requested amount ${fmt(amountMinor, 'GBP')} differs from the invoice amount ${fmt(invAmount, 'GBP')}.`]);
    }
    amountMinor = invAmount;
    payee = getPayeeByAllowlist(payeeCheck.allowlistId!) ?? null;
    if (!payee) return out('blocked', 3, ['Verified institution has no payee record.']);
  } else if (req.payeeId) {
    payee = getPayee(req.payeeId) ?? null;
    if (!payee) return out('blocked', 3, [`Unknown payee "${req.payeeId}". Payments can only go to saved payees or verified institutions.`]);
    if (payee.kind === 'institution') {
      payeeCheck = checkPayee(payee, getAllowlist());
      checks.push(...payeeCheck.lines);
      if (!payeeCheck.ok) return out('blocked', 3, ['Institution payee no longer matches the verified registry.', ...payeeCheck.reasons]);
    } else {
      checks.push({ label: 'Saved payee', passed: true, detail: payee.name });
    }
  } else {
    return out('blocked', 3, ['A payment needs a saved payee ID or a read invoice.']);
  }

  if (amountMinor === null || !Number.isInteger(amountMinor) || amountMinor <= 0) return out('blocked', 3, ['Amount is missing or invalid.']);

  const blocks = checkBlocks(payee, amountMinor, activeBlocks(t));
  checks.push({ label: 'No active scam block', passed: !blocks.blocked, detail: blocks.blocked ? blocks.matches.map((b) => b.reason).join('; ') : 'clear' });
  if (blocks.blocked) {
    const lines = blocks.matches.map((b) => `Blocked until ${new Date(b.expires_at).toISOString().slice(0, 16).replace('T', ' ')} UTC: ${b.reason}`);
    return out('blocked', 3, ['A recent scam check flagged this payee, account or amount.', ...new Set(lines)]);
  }

  if (amountMinor > POLICY.hardMaxPerTxMinor) return out('blocked', 3, [`Amount exceeds the sandbox maximum of ${fmt(POLICY.hardMaxPerTxMinor, 'GBP')} per payment.`]);

  const rolling = rollingTotals(payee.id, { includePending: true, at: t });
  const lim = checkLimits(amountMinor, rolling);
  if (payee.kind !== 'institution') {
    checks.push({
      label: 'Rolling 24 h limits',
      passed: !lim.overPayeeDaily && !lim.overDaily,
      detail: `this payee ${fmt(lim.projectedPayeeMinor, 'GBP')} / ${fmt(POLICY.perPayeeDailyLimitMinor, 'GBP')}, all payees ${fmt(lim.projectedAllMinor, 'GBP')} / ${fmt(POLICY.dailyTotalLimitMinor, 'GBP')}`,
    });
  }

  const tier = classifyTier('proposePayment', { payeeId: payee.id, amountMinor }, { now: t, payee, rolling });
  const escalated = tier.tier === 3 && payee.kind === 'saved';
  return out(escalated ? 'escalated' : 'needs_confirmation', tier.tier, tier.reasons);
}

/** The binding for a proposal, recomputed from current ledger state. */
export function currentBinding(p: Pick<Proposal, 'payee_id' | 'amount_minor' | 'invoice_id' | 'funding_json'>): { binding: Binding; json: string; hash: string } | null {
  const payee = getPayee(p.payee_id);
  if (!payee) return null;
  let invoiceHash: string | null = null;
  if (p.invoice_id) {
    const inv = getInvoice(p.invoice_id);
    if (!inv) return null;
    invoiceHash = invoiceFieldsHash(JSON.parse(inv.fields_json) as InvoiceFields);
  }
  const binding: Binding = {
    payee: { id: payee.id, name: payee.name, sortCode: payee.sort_code, accountNumber: payee.account_number, iban: payee.iban },
    amountMinor: p.amount_minor,
    currency: 'GBP',
    invoiceId: p.invoice_id,
    invoiceFieldsHash: invoiceHash,
    funding: JSON.parse(p.funding_json) as Record<string, unknown>,
  };
  return { binding, ...bindConfirmation(binding) };
}

export interface ExecutionRequest extends TypedInput {
  proposalId: string;
  bindingHash: string;
}

export interface ExecutionDecision extends GateDecision {
  /** Side effects the payment tool must apply. */
  effect: 'execute' | 'none' | 'count_attempt' | 'mark_blocked' | 'mark_expired' | 'escalate_to_tier3';
}

/** Describe what changed between the bound and current state, in plain English. */
function bindingDiff(stored: Binding, current: Binding, invoiceAmountNow: number | null): string[] {
  const diffs: string[] = [];
  if (stored.invoiceFieldsHash !== current.invoiceFieldsHash) {
    diffs.push(
      invoiceAmountNow !== null && invoiceAmountNow !== stored.amountMinor
        ? `The invoice amount changed after you read it: ${fmt(stored.amountMinor, 'GBP')} when read, ${fmt(invoiceAmountNow, 'GBP')} now.`
        : 'The invoice details changed after you read it.',
    );
  }
  if (canonicalJSON(stored.payee) !== canonicalJSON(current.payee)) diffs.push('The payee bank details changed after you read them.');
  if (stored.amountMinor !== current.amountMinor) diffs.push(`Amount changed: ${fmt(stored.amountMinor, 'GBP')} → ${fmt(current.amountMinor, 'GBP')}.`);
  return diffs.length ? diffs : ['Confirmation does not match the payment details.'];
}

/**
 * Decide whether a confirmed payment may execute. Only the student can execute.
 * Everything is re-checked: binding hash, payee, blocks, limits, typed confirmation, OTP, timer.
 */
export function gateExecution(p: Proposal | undefined, req: ExecutionRequest, actor: string): ExecutionDecision {
  const t = now();
  const checks: CheckLine[] = [];
  const tier: Tier = (p?.tier as Tier) ?? 3;
  const out = (decision: GateDecisionKind, effect: ExecutionDecision['effect'], reasons: string[], tierOverride?: Tier): ExecutionDecision => ({
    action: 'executePayment', tier: tierOverride ?? tier, decision, reasons, checks, effect,
  });

  if (actor !== 'student') {
    return out('blocked', 'none', ['Only the student can confirm and execute a payment. The agent can propose, never pay.'], 3);
  }
  if (!p) return out('blocked', 'none', ['Unknown payment proposal.'], 3);
  if (p.status !== 'pending') return out('blocked', 'none', [`This confirmation was already used or closed (status: ${p.status}). Each confirmation works once.`]);
  if (t > p.expires_at) return out('blocked', 'mark_expired', ['This confirmation expired. Ask the agent to prepare the payment again.']);

  // 1. Confirmation binding.
  const cur = currentBinding(p);
  const stored = JSON.parse(p.binding_json) as Binding;
  const bindOk = !!cur && hashesEqual(cur.hash, p.binding_hash) && hashesEqual(req.bindingHash, p.binding_hash);
  checks.push({ label: 'Confirmation binding', passed: bindOk, detail: bindOk ? `hash ${p.binding_hash.slice(0, 12)}… matches` : 'hash mismatch' });
  if (!bindOk) {
    let invAmountNow: number | null = null;
    if (p.invoice_id) {
      const inv = getInvoice(p.invoice_id);
      const amt = inv ? (JSON.parse(inv.fields_json) as InvoiceFields).amount : null;
      invAmountNow = amt ? Math.round(amt * 100) : null;
    }
    const reasons = cur ? (hashesEqual(req.bindingHash, p.binding_hash) ? bindingDiff(stored, cur.binding, invAmountNow) : ['The confirmation you sent does not match what was shown to you.']) : ['Payee or invoice no longer exists.'];
    return out('blocked', 'mark_blocked', ['Payment blocked: what would be paid is not what you confirmed.', ...reasons], 3);
  }

  // 2. Payee and scam blocks, re-checked at execution time.
  const payee = getPayee(p.payee_id)!;
  if (payee.kind === 'institution') {
    const pc = checkPayee(payee, getAllowlist());
    checks.push({ label: 'Payee allowlist', passed: pc.ok, detail: pc.ok ? 'verified' : 'mismatch' });
    if (!pc.ok) return out('blocked', 'mark_blocked', ['Payee no longer matches the verified registry.', ...pc.reasons], 3);
  }
  const blocks = checkBlocks(payee, p.amount_minor, activeBlocks(t));
  checks.push({ label: 'No active scam block', passed: !blocks.blocked, detail: blocks.blocked ? 'blocked' : 'clear' });
  if (blocks.blocked) return out('blocked', 'mark_blocked', ['A recent scam check flagged this payee, account or amount.', ...new Set(blocks.matches.map((b) => b.reason))], 3);

  // 3. Limits, counting only payments already executed (this one excluded).
  const rolling = rollingTotals(payee.id, { includePending: false, excludeProposalId: p.id, at: t });
  const nowTier = classifyTier('executePayment', { payeeId: payee.id, amountMinor: p.amount_minor }, { now: t, payee, rolling });
  if (nowTier.tier > p.tier) {
    return out('escalated', 'escalate_to_tier3', ['Limits changed since this payment was proposed. It now needs Tier 3 confirmation.', ...nowTier.reasons], 3);
  }

  // 4. Tier 3: cooling-off timer, then re-typed amount + payee name + OTP.
  if (p.tier === 3) {
    const waitMs = (p.cooling_until ?? 0) - t;
    checks.push({ label: 'Cooling-off timer', passed: waitMs <= 0, detail: waitMs > 0 ? `${Math.ceil(waitMs / 1000)} s left` : 'elapsed' });
    if (waitMs > 0) return out('blocked', 'none', [`Cooling-off period: you can confirm in ${Math.ceil(waitMs / 1000)} s. This pause protects you from rushed or pressured payments.`]);
    const typed = checkTypedConfirmation({ amountMinor: p.amount_minor, payeeName: payee.name, otp: p.otp }, req);
    checks.push({ label: 'Strong confirmation', passed: typed.ok, detail: typed.ok ? 'amount, payee and code match' : `${typed.failures.length} problem(s)` });
    if (!typed.ok) {
      const left = POLICY.maxConfirmAttempts - (p.attempts + 1);
      return out('blocked', 'count_attempt', [...typed.failures, left > 0 ? `${left} attempt(s) left.` : 'Too many attempts — this payment was cancelled.']);
    }
  }

  // 5. Family approval, when required.
  if (p.family_required) {
    const ok = p.family_status === 'approved';
    checks.push({ label: 'Family approval', passed: ok, detail: p.family_status ?? 'not requested' });
    if (!ok) return out('blocked', 'none', [p.family_status === 'rejected' ? 'Your parent rejected this payment.' : 'Waiting for your parent to approve this payment.']);
  }

  return out('allowed', 'execute', []);
}

/** Only the student can ask a parent to co-approve, and only for a pending Tier 3 payment. */
export function gateFamilyRequest(p: Proposal | undefined, actor: string): GateDecision {
  const out = (decision: GateDecisionKind, reasons: string[]): GateDecision => ({ action: 'requestFamilyApproval', tier: 3, decision, reasons, checks: [] });
  if (actor !== 'student') return out('blocked', ['Only the student can request family approval.']);
  if (!p || p.status !== 'pending') return out('blocked', ['There is no pending payment to approve.']);
  if (p.tier !== 3) return out('blocked', ['Family approval is for Tier 3 payments.']);
  if (now() > p.expires_at) return out('blocked', ['This payment proposal has expired.']);
  const cur = currentBinding(p);
  if (!cur || cur.hash !== p.binding_hash) return out('blocked', ['The payment details changed after they were read.']);
  return out('needs_confirmation', ['The payment now needs both the student and the parent.']);
}

/** The parent's decision is valid only through a verified, unexpired, unused link (checked in lib/family.ts). */
export function gateFamilyDecision(tokenOk: boolean, reason: string | null, actor: string): GateDecision {
  const out = (decision: GateDecisionKind, reasons: string[]): GateDecision => ({ action: 'familyDecision', tier: 3, decision, reasons, checks: [] });
  if (actor !== 'parent') return out('blocked', ['Only the parent, through their link, can record this decision.']);
  if (!tokenOk) return out('blocked', [reason ?? 'Invalid link.']);
  return out('allowed', []);
}
