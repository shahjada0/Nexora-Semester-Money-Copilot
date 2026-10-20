import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/lib/agent/loop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  message: z.string().min(1).max(6000),
  documentId: z.string().max(64).nullable().optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(6000) })).max(30).default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { message, documentId, history } = parsed.data;
  const reply = await runAgent(history, message, documentId ?? null);
  return NextResponse.json(reply);
}
