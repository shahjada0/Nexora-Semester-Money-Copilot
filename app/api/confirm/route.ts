import { NextResponse } from 'next/server';
import { runTool } from '@/lib/tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The confirmation screen. This is the only route that executes payments, and it acts as the student. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await runTool('executePayment', body, { actor: 'student' });
  return NextResponse.json(result);
}
