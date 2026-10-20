import { NextResponse } from 'next/server';
import { runTool } from '@/lib/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Student asks a parent to co-approve a pending Tier 3 payment. */
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as { proposalId?: string };
  const origin = new URL(req.url).origin;
  const r = await runTool('requestFamilyApproval', { proposalId: body.proposalId, baseUrl: origin }, { actor: 'student' });
  const card = r.cards.find((c) => c.type === 'family') as { link?: string } | undefined;
  return NextResponse.json({ ...r, link: card?.link ?? null, error: r.decision === 'blocked' ? r.reasons[0] : undefined });
}
