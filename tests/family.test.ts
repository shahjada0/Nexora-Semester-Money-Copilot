import { beforeEach, describe, expect, it } from 'vitest';
import { freshSandbox } from './helpers';
import { uploadFixture } from './fixtures';
import { runTool } from '@/lib/tools';
import { advance } from '@/lib/clock';
import { getDb } from '@/lib/db';
import { POLICY } from '@/lib/policy';
import type { FamilyCard, ProposalCard } from '@/lib/cards';

beforeEach(() => freshSandbox());

async function tuitionProposal() {
  const doc = await uploadFixture('legit-01-tuition-instalment-2.pdf');
  const read = await runTool('readInvoice', { documentId: doc.id }, { actor: 'agent' });
  const invoiceId = (read.cards[0] as { invoiceId: string }).invoiceId;
  const p = await runTool('proposePayment', { invoiceId }, { actor: 'agent' });
  return { card: p.cards.find((c) => c.type === 'proposal') as ProposalCard, invoiceId };
}

const tokenOf = (r: { cards: { type: string }[] }) => (r.cards.find((c) => c.type === 'family') as FamilyCard).link.split('/family/')[1];

const confirmInput = (c: ProposalCard) => ({ proposalId: c.proposalId, bindingHash: c.bindingHash, typedAmount: '6300', typedPayeeName: 'University of Northbridge', otp: c.sandboxOtp! });

describe('family approval — dual control on tuition', () => {
  it('only the student can request it (not the agent)', async () => {
    const { card } = await tuitionProposal();
    expect((await runTool('requestFamilyApproval', { proposalId: card.proposalId }, { actor: 'agent' })).decision).toBe('blocked');
    expect((await runTool('requestFamilyApproval', { proposalId: card.proposalId }, { actor: 'student' })).decision).toBe('needs_confirmation');
  });

  it('once requested, the payment needs BOTH the student and the parent', async () => {
    const { card } = await tuitionProposal();
    const req = await runTool('requestFamilyApproval', { proposalId: card.proposalId }, { actor: 'student' });
    advance(POLICY.coolingOffSeconds * 1000 + 1);
    const before = await runTool('executePayment', confirmInput(card), { actor: 'student' });
    expect(before.decision).toBe('blocked');
    expect(before.reasons.join(' ')).toMatch(/parent/);

    const ok = await runTool('familyDecision', { token: tokenOf(req), decision: 'approved' }, { actor: 'parent' });
    expect(ok.decision).toBe('allowed');
    const after = await runTool('executePayment', confirmInput(card), { actor: 'student' });
    expect(after.decision).toBe('allowed');
  });

  it('the link is single-use, signed, and expires', async () => {
    const { card } = await tuitionProposal();
    const token = tokenOf(await runTool('requestFamilyApproval', { proposalId: card.proposalId }, { actor: 'student' }));
    // forged signature
    const forged = token.replace(/\.[0-9a-f]+$/, '.' + 'a'.repeat(64));
    expect((await runTool('familyDecision', { token: forged, decision: 'approved' }, { actor: 'parent' })).decision).toBe('blocked');
    // the agent cannot use the link
    expect((await runTool('familyDecision', { token, decision: 'approved' }, { actor: 'agent' })).decision).toBe('blocked');
    // first use works, second does not
    expect((await runTool('familyDecision', { token, decision: 'approved' }, { actor: 'parent' })).decision).toBe('allowed');
    const reuse = await runTool('familyDecision', { token, decision: 'rejected' }, { actor: 'parent' });
    expect(reuse.decision).toBe('blocked');
    expect(reuse.reasons.join(' ')).toMatch(/already used/);

    const second = await tuitionProposal();
    const t2 = tokenOf(await runTool('requestFamilyApproval', { proposalId: second.card.proposalId }, { actor: 'student' }));
    advance(POLICY.familyLinkTtlMs + 1000);
    const late = await runTool('familyDecision', { token: t2, decision: 'approved' }, { actor: 'parent' });
    expect(late.decision).toBe('blocked');
  });

  it('a parent rejection cancels the payment', async () => {
    const { card } = await tuitionProposal();
    const token = tokenOf(await runTool('requestFamilyApproval', { proposalId: card.proposalId }, { actor: 'student' }));
    await runTool('familyDecision', { token, decision: 'rejected' }, { actor: 'parent' });
    advance(POLICY.coolingOffSeconds * 1000 + 1);
    expect((await runTool('executePayment', confirmInput(card), { actor: 'student' })).decision).toBe('blocked');
  });

  it('if the invoice changes after the link was sent, the parent cannot approve it', async () => {
    const { card, invoiceId } = await tuitionProposal();
    const token = tokenOf(await runTool('requestFamilyApproval', { proposalId: card.proposalId }, { actor: 'student' }));
    const row = getDb().prepare('SELECT fields_json FROM invoices WHERE id = ?').get(invoiceId) as { fields_json: string };
    const f = JSON.parse(row.fields_json);
    f.amount = 9950;
    getDb().prepare('UPDATE invoices SET fields_json = ? WHERE id = ?').run(JSON.stringify(f), invoiceId);
    const r = await runTool('familyDecision', { token, decision: 'approved' }, { actor: 'parent' });
    expect(r.decision).toBe('blocked');
    expect(r.reasons.join(' ')).toMatch(/changed/);
  });
});
