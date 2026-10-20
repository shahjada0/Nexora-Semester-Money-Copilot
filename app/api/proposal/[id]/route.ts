import { NextResponse } from 'next/server';
import { getProposal } from '@/lib/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Status poll for the confirmation sheet (family approval progress). Read-only, no secrets. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = getProposal(params.id);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ status: p.status, familyRequired: !!p.family_required, familyStatus: p.family_status });
}
