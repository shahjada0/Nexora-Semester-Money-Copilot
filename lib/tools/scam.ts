import { z } from 'zod';
import { getDb } from '../db';
import { now } from '../clock';
import { POLICY } from '../policy';
import { newId } from '../util';
import { classifyScam } from '../scam';
import type { ScamCard } from '../cards';
import { defineTool } from './types';

export const scamCheck = defineTool({
  name: 'scamCheck',
  description:
    'Check a message the student received (text, email, call notes) for scam risk. Returns risk level, red flags and what to do instead. High risk places a 24 h block on related payees, accounts and amounts.',
  schema: z.object({ message: z.string().min(1).max(6000) }).passthrough(),
  parameters: { type: 'object', properties: { message: { type: 'string', description: 'The full message text' } }, required: ['message'] },
  agentCallable: true,
  async run(params) {
    const r = await classifyScam(params.message);
    const placed: ScamCard['blocksPlaced'] = [];
    if (r.risk === 'high') {
      const t = now();
      const expires = t + POLICY.scamBlockHours * 3600_000;
      const ins = getDb().prepare('INSERT INTO blocks(id, kind, value, reason, source, created_at, expires_at) VALUES (?,?,?,?,?,?,?)');
      const reason = `High-risk scam check (${r.category}) on ${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
      for (const a of r.extracted.accounts) {
        ins.run(newId('blk'), 'account', a, reason, 'scamCheck', t, expires);
        placed.push({ kind: 'account', value: `••••${a.slice(-4)}`, expiresAt: expires });
      }
      for (const n of r.extracted.payeeNames) {
        ins.run(newId('blk'), 'payee_name', n, reason, 'scamCheck', t, expires);
        placed.push({ kind: 'payee name', value: n, expiresAt: expires });
      }
      for (const m of r.extracted.amountsMinor) {
        ins.run(newId('blk'), 'amount', String(m), reason, 'scamCheck', t, expires);
        placed.push({ kind: 'amount', value: `£${(m / 100).toFixed(2)}`, expiresAt: expires });
      }
    }
    const why =
      r.risk === 'high'
        ? `High risk: ${r.redFlags.length} red flag(s).${placed.length ? ` Payments to the accounts, names and amounts in this message are blocked for ${POLICY.scamBlockHours} h.` : ''}`
        : r.risk === 'medium'
          ? 'Some warning signs. Check with the sender through a channel you already trust before paying anything.'
          : 'No common scam signs found.';
    const card: ScamCard = {
      type: 'scam',
      tier: 1,
      decision: r.risk === 'high' ? 'blocked' : r.risk === 'medium' ? 'escalated' : 'allowed',
      why,
      risk: r.risk,
      category: r.category,
      redFlags: r.redFlags,
      doInstead: r.doInstead,
      blocksPlaced: placed,
      classifier: r.classifier,
    };
    return {
      tier: 1,
      decision: 'allowed',
      reasons: [why],
      cards: [card],
      summary: `Scam risk ${r.risk.toUpperCase()} (${r.category}). Red flags: ${r.redFlags.join(' ') || 'none'}. ${placed.length ? `Gate blocks placed: ${placed.map((p) => `${p.kind} ${p.value}`).join(', ')}.` : ''}`,
      audit: { risk: r.risk, category: r.category, score: r.score, rules: r.ruleIds, llmRisk: r.llmRisk, blocks: placed.length },
    };
  },
});
