import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getProposal } from '@/lib/ledger';
import { append } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { proposalId } = ((await req.json().catch(() => ({}))) ?? {}) as { proposalId?: string };
  const p = proposalId ? getProposal(proposalId) : undefined;
  if (!p || p.status !== 'pending') return NextResponse.json({ ok: false, error: 'Nothing to cancel' }, { status: 400 });
  getDb().prepare(`UPDATE proposals SET status = 'cancelled' WHERE id = ?`).run(p.id);
  const rec = append({ actor: 'student', action: 'cancelPayment', tier: p.tier as 2 | 3, decision: 'info', reason: 'Student cancelled the payment.', data: { proposalId: p.id, amountMinor: p.amount_minor } });
  return NextResponse.json({ ok: true, auditSeq: rec.seq });
}
