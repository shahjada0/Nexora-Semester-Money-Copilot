import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { llmStatus } from '@/lib/llm/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Health check for hosting platforms (Render). Opens (and if needed seeds) the sandbox DB. */
export async function GET() {
  const n = (getDb().prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
  const llm = llmStatus();
  return NextResponse.json({ ok: n > 0, accounts: n, llm: llm.enabled ? `${llm.provider}:${llm.model}` : 'offline planner' });
}
