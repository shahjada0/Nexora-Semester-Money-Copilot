import { NextResponse } from 'next/server';
import { runTool } from '@/lib/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Parent approves or rejects through their single-use link. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await runTool('familyDecision', body, { actor: 'parent' });
  return NextResponse.json({ decision: r.decision, reasons: r.reasons }, { status: r.decision === 'blocked' && !/rejected/.test(r.reasons[0] ?? '') ? 400 : 200 });
}
