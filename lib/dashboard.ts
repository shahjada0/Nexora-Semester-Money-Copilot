import { getDb } from './db';
import { now } from './clock';
import { getRates, toGbpMinor } from './fx';
import { activeBlocks, getAccounts } from './ledger';
import { computeRunway, runwayInputs } from './runway';
import { append, listAudit } from './audit';
import { llmStatus } from './llm/provider';
import type { Currency } from './money';

export async function getDashboard() {
  const fx = await getRates();
  const accounts = getAccounts().map((a) => ({
    id: a.id,
    label: a.label,
    institution: a.institution,
    currency: a.currency,
    balanceMinor: a.balance_minor,
    gbpMinor: toGbpMinor(a.balance_minor, a.currency as Currency, fx),
  }));
  const runway = computeRunway(runwayInputs(fx));
  const today = new Date(now()).toISOString().slice(0, 10);
  const db = getDb();
  const deadlines = db
    .prepare(`SELECT label, due_date AS date, amount_minor AS amountMinor, currency, status FROM tuition_schedule WHERE due_date >= ? OR status = 'due' ORDER BY due_date`)
    .all(today) as { label: string; date: string; amountMinor: number; currency: string; status: string }[];
  // Fire any rate alert whose target is met at the current mid-market rate.
  const pending = db.prepare('SELECT id, direction, target FROM rate_alerts WHERE triggered_at IS NULL').all() as { id: string; direction: string; target: number }[];
  const triggered: { id: string; direction: string; target: number }[] = [];
  for (const a of pending) {
    const hit = a.direction === 'above' ? fx.rates.BDT >= a.target : fx.rates.BDT <= a.target;
    if (!hit) continue;
    db.prepare('UPDATE rate_alerts SET triggered_at = ? WHERE id = ?').run(now(), a.id);
    append({ actor: 'system', action: 'rateAlert.triggered', tier: 1, decision: 'info', reason: `GBP/BDT is ৳${fx.rates.BDT.toFixed(2)}, ${a.direction} your target ৳${a.target}. Good moment for the family to send.`, data: { alertId: a.id } });
    triggered.push(a);
  }
  const alerts = db.prepare('SELECT id, direction, target FROM rate_alerts WHERE triggered_at IS NULL ORDER BY created_at DESC').all() as { id: string; direction: string; target: number }[];
  const recent = listAudit(6).map((r) => ({ seq: r.seq, ts: r.ts, actor: r.actor, action: r.action, tier: r.tier, decision: r.decision, reason: r.reason, hash: r.hash }));
  const blocks = activeBlocks().map((b) => ({ kind: b.kind, value: b.kind === 'account' ? `••••${b.value.slice(-4)}` : b.kind === 'amount' ? `£${(Number(b.value) / 100).toFixed(2)}` : b.value, expiresAt: b.expires_at }));
  return {
    accounts,
    totalGbpMinor: accounts.reduce((s, a) => s + a.gbpMinor, 0),
    fx: { bdtPerGbp: fx.rates.BDT, usdPerGbp: fx.rates.USD, source: fx.source, asOf: fx.asOf, live: fx.live, note: fx.note ?? null },
    runway,
    deadlines,
    alerts,
    triggered,
    recent,
    blocks,
    llm: llmStatus(),
    now: now(),
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
