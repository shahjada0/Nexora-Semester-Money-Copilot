import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getDb, resetDb } from '@/lib/db';
import { saveDocument } from '@/lib/documents';
import { append } from '@/lib/audit';
import { runTool } from '@/lib/tools';
import { fmt } from '@/lib/money';
import type { Card, ProposalCard } from '@/lib/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIX = path.join(process.cwd(), 'fixtures');

/** Demo-mode helpers (?demo=1). Every action they take still goes through runTool → gate → audit. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { scenario?: string; file?: string; id?: string };
  switch (body.scenario) {
    case 'reset': {
      resetDb();
      return NextResponse.json({ ok: true });
    }
    case 'load-invoice': {
      const file = path.basename(body.file ?? '');
      const p = path.join(FIX, 'invoices', file);
      if (!file || !fs.existsSync(p)) return NextResponse.json({ error: 'Unknown fixture' }, { status: 400 });
      const doc = await saveDocument(file, file.endsWith('.pdf') ? 'application/pdf' : 'text/plain', new Uint8Array(fs.readFileSync(p)));
      append({ actor: 'student', action: 'document.upload', tier: 0, decision: 'info', reason: `Uploaded ${file} (demo fixture)`, data: { documentId: doc.id } });
      return NextResponse.json({ documentId: doc.id, filename: file });
    }
    case 'message': {
      const msgs = JSON.parse(fs.readFileSync(path.join(FIX, 'messages', 'messages.json'), 'utf8')) as { id: string; text: string }[];
      const m = msgs.find((x) => x.id === body.id);
      return m ? NextResponse.json({ text: m.text }) : NextResponse.json({ error: 'Unknown message' }, { status: 400 });
    }
    case 'tamper': {
      // Simulated attacker: edits the stored invoice after it was read (e.g. a swapped PDF in a shared folder).
      const db = getDb();
      const p = db.prepare(`SELECT id, invoice_id FROM proposals WHERE status = 'pending' AND invoice_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get() as
        | { id: string; invoice_id: string }
        | undefined;
      if (!p) return NextResponse.json({ error: 'Load the happy-path invoice first so there is a pending tuition payment to tamper with.' }, { status: 400 });
      const row = db.prepare('SELECT fields_json FROM invoices WHERE id = ?').get(p.invoice_id) as { fields_json: string };
      const fields = JSON.parse(row.fields_json) as { amount: number };
      const from = fields.amount;
      fields.amount = Math.round((from + 3650) * 100) / 100;
      db.prepare('UPDATE invoices SET fields_json = ? WHERE id = ?').run(JSON.stringify(fields), p.invoice_id);
      append({
        actor: 'system',
        action: 'demo.tamper',
        tier: null,
        decision: 'info',
        reason: `DEMO ATTACK: stored invoice amount changed from ${fmt(Math.round(from * 100), 'GBP')} to ${fmt(Math.round(fields.amount * 100), 'GBP')} after it was read.`,
        data: { invoiceId: p.invoice_id, proposalId: p.id },
      });
      return NextResponse.json({ ok: true, proposalId: p.id, from, to: fields.amount });
    }
    case 'split': {
      // Simulated attacker plan: 10 × £99 to one payee, the student clicking "confirm" on each Tier 2 request.
      const steps: { i: number; tier: number; decision: string; executed: boolean }[] = [];
      let lastCard: Card | null = null;
      for (let i = 1; i <= 10; i++) {
        const p = await runTool('proposePayment', { payeeId: 'pay_flat', amount: 99, memo: `Split ${i}/10` }, { actor: 'agent' });
        const card = p.cards.find((c) => c.type === 'proposal') as ProposalCard | undefined;
        let executed = false;
        if (card && p.tier === 2) {
          const e = await runTool('executePayment', { proposalId: card.proposalId, bindingHash: card.bindingHash }, { actor: 'student' });
          executed = e.decision === 'allowed';
        } else if (card) {
          lastCard = lastCard ?? card;
        }
        steps.push({ i, tier: p.tier, decision: p.decision, executed });
      }
      return NextResponse.json({ steps, card: lastCard });
    }
    default:
      return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 });
  }
}
