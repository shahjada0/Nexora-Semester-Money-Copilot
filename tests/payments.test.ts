import { beforeEach, describe, expect, it } from 'vitest';
import { freshSandbox } from './helpers';
import { uploadFixture } from './fixtures';
import { runTool } from '@/lib/tools';
import { advance } from '@/lib/clock';
import { getDb } from '@/lib/db';
import { getAccount, getProposal } from '@/lib/ledger';
import { verifyChain, listAudit } from '@/lib/audit';
import { POLICY } from '@/lib/policy';
import type { ProposalCard } from '@/lib/cards';

beforeEach(() => freshSandbox());

const student = { actor: 'student' as const };
const agent = { actor: 'agent' as const };

async function readAndPropose(file: string) {
  const doc = await uploadFixture(file);
  const read = await runTool('readInvoice', { documentId: doc.id }, agent);
  const invoiceId = (read.cards[0] as { invoiceId: string }).invoiceId;
  const prop = await runTool('proposePayment', { invoiceId }, agent);
  return { read, prop, invoiceId };
}

const proposalCard = (r: { cards: { type: string }[] }) => r.cards.find((c) => c.type === 'proposal') as ProposalCard;

describe('hero flow: tuition invoice → payee check → Tier 3 confirmation → sandbox payment', () => {
  it('pays the genuine invoice only after the full Tier 3 ritual', async () => {
    const { read, prop } = await readAndPropose('legit-01-tuition-instalment-2.pdf');
    expect(read.cards[0]).toMatchObject({ type: 'invoice', decision: 'allowed', payeeCheck: { ok: true } });
    expect(prop.decision).toBe('needs_confirmation');
    expect(prop.tier).toBe(3);
    const card = proposalCard(prop);
    expect(card.funding.source).toBe('acc_bdt'); // GBP account cannot cover £6,300
    expect(prop.cards[0].type).toBe('quotes'); // true-cost comparison shown before paying

    const base = { proposalId: card.proposalId, bindingHash: card.bindingHash };
    const good = { ...base, typedAmount: '6,300.00', typedPayeeName: 'University of Northbridge', otp: card.sandboxOtp! };

    // The agent can never execute.
    const byAgent = await runTool('executePayment', good, agent);
    expect(byAgent.decision).toBe('blocked');

    // Cooling-off timer.
    const early = await runTool('executePayment', good, student);
    expect(early.decision).toBe('blocked');
    expect(early.reasons.join(' ')).toMatch(/Cooling-off/);

    advance(POLICY.coolingOffSeconds * 1000 + 1);

    const wrong = await runTool('executePayment', { ...good, typedAmount: '6,000' }, student);
    expect(wrong.decision).toBe('blocked');

    const bdtBefore = getAccount('acc_bdt')!.balance_minor;
    const ok = await runTool('executePayment', good, student);
    expect(ok.decision).toBe('allowed');
    expect(ok.cards[0]).toMatchObject({ type: 'receipt', amountMinor: 630_000 });
    expect((ok.cards[0] as { sandboxTxId: string }).sandboxTxId).toMatch(/^SBX-/);
    expect(getAccount('acc_bdt')!.balance_minor).toBeLessThan(bdtBefore);
    const tu = getDb().prepare(`SELECT status FROM tuition_schedule WHERE id = 'tu_2'`).get() as { status: string };
    expect(tu.status).toBe('paid');

    // Single use.
    const again = await runTool('executePayment', good, student);
    expect(again.decision).toBe('blocked');

    expect(verifyChain().ok).toBe(true);
  });

  it('cancels after too many wrong confirmations', async () => {
    const { prop } = await readAndPropose('legit-01-tuition-instalment-2.pdf');
    const card = proposalCard(prop);
    advance(POLICY.coolingOffSeconds * 1000 + 1);
    for (let i = 0; i < POLICY.maxConfirmAttempts; i++) {
      await runTool('executePayment', { proposalId: card.proposalId, bindingHash: card.bindingHash, typedAmount: '1', typedPayeeName: 'x', otp: '000000' }, student);
    }
    expect(getProposal(card.proposalId)!.status).toBe('cancelled');
  });
});

describe('attack 1 — prompt injection in the invoice', () => {
  it('white-text instructions are flagged and the payment is blocked', async () => {
    const { read, prop } = await readAndPropose('mal-01-white-text-injection.pdf');
    expect((read.cards[0] as { suspicious: string[] }).suspicious.length).toBeGreaterThan(0);
    expect(prop.decision).toBe('blocked');
    expect(getDb().prepare(`SELECT COUNT(*) AS n FROM proposals`).get()).toEqual({ n: 0 });
  });

  it('a compromised agent still cannot pay an account that is not on the allowlist', async () => {
    // The agent tries to pay the injected account directly: there is no field for raw bank details.
    const r1 = await runTool('proposePayment', { payeeId: 'acct_99887766', amount: 6300, accountNumber: '99887766', sortCode: '99-45-12' }, agent);
    expect(r1.decision).toBe('blocked');
    // …or to call the execute tool itself.
    const r2 = await runTool('executePayment', { proposalId: 'pp_x', bindingHash: 'a'.repeat(64) }, agent);
    expect(r2.decision).toBe('blocked');
    // …or to invent a tool.
    const r3 = await runTool('transferFunds', { to: '99887766', amount: 6300 }, agent);
    expect(r3.decision).toBe('blocked');
  });
});

describe('attack 2 — account swap', () => {
  it('real university name with a different account fails the payee check', async () => {
    const { read, prop } = await readAndPropose('mal-02-account-swap.txt');
    expect((read.cards[0] as { payeeCheck: { ok: boolean } }).payeeCheck.ok).toBe(false);
    expect(prop.decision).toBe('blocked');
    expect(prop.tier).toBe(3);
    expect(prop.reasons.join(' ')).toMatch(/not the verified account/);
  });

  for (const f of ['mal-03-lookalike-name.txt', 'mal-04-iban-swap.txt', 'mal-05-agent-directive.txt', 'mal-06-bank-details-changed.pdf']) {
    it(`${f} is blocked`, async () => {
      const { prop } = await readAndPropose(f);
      expect(prop.decision).toBe('blocked');
    });
  }
});

describe('attack 3 — amount changed after reading', () => {
  it('editing the stored invoice after the proposal breaks the binding hash', async () => {
    const { prop, invoiceId } = await readAndPropose('legit-01-tuition-instalment-2.pdf');
    const card = proposalCard(prop);
    const row = getDb().prepare('SELECT fields_json FROM invoices WHERE id = ?').get(invoiceId) as { fields_json: string };
    const fields = JSON.parse(row.fields_json);
    fields.amount = 9950;
    getDb().prepare('UPDATE invoices SET fields_json = ? WHERE id = ?').run(JSON.stringify(fields), invoiceId);
    advance(POLICY.coolingOffSeconds * 1000 + 1);
    const r = await runTool(
      'executePayment',
      { proposalId: card.proposalId, bindingHash: card.bindingHash, typedAmount: '6300', typedPayeeName: 'University of Northbridge', otp: card.sandboxOtp! },
      student,
    );
    expect(r.decision).toBe('blocked');
    expect(r.reasons.join(' ')).toMatch(/£6,300\.00 when read, £9,950\.00 now/);
    expect(getProposal(card.proposalId)!.status).toBe('blocked');
  });

  it('a confirmation hash that differs from the one shown is rejected', async () => {
    const { prop } = await readAndPropose('legit-01-tuition-instalment-2.pdf');
    const card = proposalCard(prop);
    advance(POLICY.coolingOffSeconds * 1000 + 1);
    const r = await runTool(
      'executePayment',
      { proposalId: card.proposalId, bindingHash: 'f'.repeat(64), typedAmount: '6300', typedPayeeName: 'University of Northbridge', otp: card.sandboxOtp! },
      student,
    );
    expect(r.decision).toBe('blocked');
  });
});

describe('attack 4 — split payment under the limit', () => {
  it('10 × £99 to one payee: the rolling 24 h limit escalates to Tier 3', async () => {
    const tiers: number[] = [];
    for (let i = 0; i < 10; i++) {
      const p = await runTool('proposePayment', { payeeId: 'pay_flat', amount: 99 }, agent);
      tiers.push(p.tier);
      const card = proposalCard(p);
      if (p.tier === 2) {
        const e = await runTool('executePayment', { proposalId: card.proposalId, bindingHash: card.bindingHash }, student);
        expect(e.decision).toBe('allowed');
      } else {
        expect(p.decision).toBe('escalated');
        // A one-click attempt on a Tier 3 proposal does nothing.
        const e = await runTool('executePayment', { proposalId: card.proposalId, bindingHash: card.bindingHash }, student);
        expect(e.decision).toBe('blocked');
      }
    }
    expect(tiers.slice(0, 2)).toEqual([2, 2]);
    expect(tiers.slice(2).every((t) => t === 3)).toBe(true);
  });

  it('a pending tuition payment does not push small saved-payee payments into Tier 3', async () => {
    await readAndPropose('legit-01-tuition-instalment-2.pdf');
    expect((await runTool('proposePayment', { payeeId: 'pay_flat', amount: 20 }, agent)).tier).toBe(2);
  });

  it('proposing all ten at once does not help: pending proposals count too', async () => {
    const tiers: number[] = [];
    for (let i = 0; i < 10; i++) tiers.push((await runTool('proposePayment', { payeeId: 'pay_su', amount: 99 }, agent)).tier);
    expect(tiers.filter((t) => t === 2).length).toBe(2);
  });

  it('spreading across payees hits the £500 daily total', async () => {
    const payees = ['pay_flat', 'pay_su', 'pay_flat', 'pay_su', 'pay_flat', 'pay_su'];
    const tiers: number[] = [];
    for (const id of payees) {
      const p = await runTool('proposePayment', { payeeId: id, amount: 120 }, agent);
      tiers.push(p.tier);
      const c = proposalCard(p);
      if (p.tier === 2) await runTool('executePayment', { proposalId: c.proposalId, bindingHash: c.bindingHash }, student);
    }
    expect(tiers).toContain(3);
  });

  it('a Tier 2 proposal is re-checked at execution time and escalated if limits changed', async () => {
    const a = proposalCard(await runTool('proposePayment', { payeeId: 'pay_flat', amount: 150 }, agent));
    // Simulate a payment executed elsewhere in the meantime (e.g. from another device).
    getDb().prepare(`UPDATE proposals SET status = 'executed', executed_at = ? WHERE id = ?`).run(Date.parse('2026-10-18T08:00:00Z'), a.proposalId);
    const b = await runTool('proposePayment', { payeeId: 'pay_su', amount: 150 }, agent);
    expect(b.tier).toBe(2);
    const bc = proposalCard(b);
    getDb()
      .prepare(`INSERT INTO proposals SELECT 'pp_other', payee_id, 22000, currency, tier, invoice_id, funding_json, memo, binding_hash, binding_json, otp, reasons_json, created_at, expires_at, cooling_until, 'executed', attempts, family_required, family_status, 'SBX-OTHER', ? FROM proposals WHERE id = ?`)
      .run(Date.parse('2026-10-18T08:30:00Z'), bc.proposalId);
    const e = await runTool('executePayment', { proposalId: bc.proposalId, bindingHash: bc.bindingHash }, student);
    expect(e.decision).toBe('escalated');
    expect(getProposal(bc.proposalId)!.tier).toBe(3);
  });
});

describe('attack 5 — fake scam message', () => {
  const MSG =
    'URGENT from the UK Visa Office: your student visa will be cancelled within 2 hours because of an unpaid compliance fee. Pay £450 now to Visa Compliance Services Ltd, sort code 99-66-01, account number 70442190. Do not tell your university or you may be deported.';

  it('is flagged high risk and blocks the related payee', async () => {
    const before = await runTool('proposePayment', { payeeId: 'pay_visa', amount: 450 }, agent);
    expect(before.tier).toBe(3); // new payee, ≥ £200 — but not blocked yet
    expect(before.decision).toBe('escalated');

    const s = await runTool('scamCheck', { message: MSG }, agent);
    expect(s.cards[0]).toMatchObject({ type: 'scam', risk: 'high' });
    expect((s.cards[0] as { blocksPlaced: unknown[] }).blocksPlaced.length).toBeGreaterThan(0);

    const after = await runTool('proposePayment', { payeeId: 'pay_visa', amount: 450 }, agent);
    expect(after.decision).toBe('blocked');

    // Even the proposal made before the scam check cannot execute now.
    const c = proposalCard(before);
    advance(POLICY.coolingOffSeconds * 1000 + 1);
    const e = await runTool('executePayment', { proposalId: c.proposalId, bindingHash: c.bindingHash, typedAmount: '450', typedPayeeName: 'Visa Compliance Services Ltd', otp: c.sandboxOtp! }, student);
    expect(e.decision).toBe('blocked');

    // The block expires after 24 h.
    advance(POLICY.scamBlockHours * 3600_000 + 1000);
    const later = await runTool('proposePayment', { payeeId: 'pay_visa', amount: 450 }, agent);
    expect(later.decision).not.toBe('blocked');
  });
});

describe('every action is in the audit log', () => {
  it('one audit entry per tool call, and the chain verifies', async () => {
    const start = listAudit().length;
    await readAndPropose('legit-01-tuition-instalment-2.pdf'); // 2 calls
    await runTool('getBalances', {}, agent);
    await runTool('getQuotes', { amount: 1000 }, agent);
    await runTool('nonexistent', {}, agent);
    await runTool('getQuotes', { amount: -5 }, agent); // invalid params are logged too
    expect(listAudit().length - start).toBe(6);
    expect(verifyChain().ok).toBe(true);
  });
});
