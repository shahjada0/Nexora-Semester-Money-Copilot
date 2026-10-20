import type Database from 'better-sqlite3';
import { now } from '../clock';
import { appendWithDb } from '../audit/log';

const DAY = 24 * 60 * 60 * 1000;

/**
 * The Nusrat scenario. Every institution and provider here is fictional; every account
 * number is a sandbox value that does not exist at any real bank.
 */
export const SEED = {
  student: { name: 'Nusrat Rahman', studentId: 'NB2026-48213', course: 'MSc Data Science', university: 'University of Northbridge' },
  parent: { name: 'Abdul Rahman', relation: 'Father', city: 'Dhaka' },
  accounts: [
    { id: 'acc_gbp', label: 'UK current account', holder: 'Nusrat Rahman', institution: 'Sandbox Bank UK', currency: 'GBP', balance_minor: 60_000 },
    { id: 'acc_bdt', label: 'Family student-file account (Dhaka)', holder: 'Abdul Rahman (father)', institution: 'Sandbox Bank BD', currency: 'BDT', balance_minor: 115_000_000 },
    { id: 'acc_usd', label: 'USD savings', holder: 'Nusrat Rahman', institution: 'Sandbox Bank UK', currency: 'USD', balance_minor: 50_000 },
  ],
  allowlist: [
    {
      id: 'al_unb', institution: 'University of Northbridge', payee_name: 'University of Northbridge',
      sort_code: '99-01-23', account_number: '41873960', iban: 'GB00SAND99012341873960', currency: 'GBP', category: 'tuition',
    },
    {
      id: 'al_res', institution: 'University of Northbridge', payee_name: 'Northbridge University Residences',
      sort_code: '99-01-23', account_number: '55120384', iban: null, currency: 'GBP', category: 'accommodation',
    },
  ],
  payees: [
    { id: 'pay_unb', name: 'University of Northbridge', kind: 'institution', category: 'tuition', sort_code: '99-01-23', account_number: '41873960', iban: 'GB00SAND99012341873960', allowlist_id: 'al_unb', ageDays: 60 },
    { id: 'pay_res', name: 'Northbridge University Residences', kind: 'institution', category: 'accommodation', sort_code: '99-01-23', account_number: '55120384', iban: null, allowlist_id: 'al_res', ageDays: 60 },
    { id: 'pay_flat', name: 'Tom Ellis', kind: 'saved', category: 'bills share (flatmate)', sort_code: '99-07-11', account_number: '30561288', iban: null, allowlist_id: null, ageDays: 120 },
    { id: 'pay_su', name: "Northbridge Students' Union", kind: 'saved', category: 'books & events', sort_code: '99-01-23', account_number: '60022417', iban: null, allowlist_id: null, ageDays: 45 },
    { id: 'pay_let', name: 'Harbour Lettings Ltd', kind: 'saved', category: 'rent', sort_code: '99-04-56', account_number: '71240093', iban: null, allowlist_id: null, ageDays: 100 },
    { id: 'pay_phone', name: 'Quickfix Phones', kind: 'saved', category: 'phone repair', sort_code: '99-08-80', account_number: '19357744', iban: null, allowlist_id: null, ageDays: 0.1 },
    // Added during a "visa office" phone call — the scam-check demo story.
    { id: 'pay_visa', name: 'Visa Compliance Services Ltd', kind: 'saved', category: 'added during a phone call', sort_code: '99-66-01', account_number: '70442190', iban: null, allowlist_id: null, ageDays: 0.04 },
  ],
  tuition: [
    { id: 'tu_1', label: 'Tuition instalment 1 of 3', due_date: '2026-09-20', amount_minor: 630_000, status: 'paid' },
    { id: 'tu_2', label: 'Tuition instalment 2 of 3', due_date: '2026-11-30', amount_minor: 630_000, status: 'due' },
    { id: 'tu_3', label: 'Tuition instalment 3 of 3', due_date: '2027-02-26', amount_minor: 630_000, status: 'due' },
  ],
} as const;

/** Monthly spending pattern on the UK account (pence). Roughly £1,000 a month. */
const MONTHLY = [
  { day: 1, amount: 70_000, category: 'rent', description: 'Rent — Harbour Lettings Ltd', payee: 'pay_let' },
  { day: 3, amount: 4_200, category: 'groceries', description: 'Groceries' },
  { day: 10, amount: 4_200, category: 'groceries', description: 'Groceries' },
  { day: 17, amount: 4_200, category: 'groceries', description: 'Groceries' },
  { day: 24, amount: 4_200, category: 'groceries', description: 'Groceries' },
  { day: 5, amount: 6_400, category: 'transport', description: 'Monthly bus pass' },
  { day: 8, amount: 1_800, category: 'phone', description: 'Mobile plan' },
  { day: 14, amount: 2_500, category: 'eating out', description: 'Cafe & meals' },
  { day: 21, amount: 2_500, category: 'eating out', description: 'Cafe & meals' },
] as const;

export function seedDatabase(db: Database.Database, auditJsonl: string | null): void {
  const t0 = now();
  const tx = db.transaction(() => {
    const insAcc = db.prepare('INSERT INTO accounts(id,label,holder,institution,currency,balance_minor) VALUES(?,?,?,?,?,?)');
    for (const a of SEED.accounts) insAcc.run(a.id, a.label, a.holder, a.institution, a.currency, a.balance_minor);

    const insAl = db.prepare('INSERT INTO allowlist(id,institution,payee_name,sort_code,account_number,iban,currency,category,source,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const a of SEED.allowlist)
      insAl.run(a.id, a.institution, a.payee_name, a.sort_code, a.account_number, a.iban, a.currency, a.category, 'Sandbox registry of verified institution bank details (fictional)', '2026-09-01');

    const insPay = db.prepare('INSERT INTO payees(id,name,kind,category,sort_code,account_number,iban,currency,allowlist_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const p of SEED.payees)
      insPay.run(p.id, p.name, p.kind, p.category, p.sort_code, p.account_number, p.iban, 'GBP', p.allowlist_id, Math.round(t0 - p.ageDays * DAY));

    const insTu = db.prepare('INSERT INTO tuition_schedule(id,institution,label,due_date,amount_minor,currency,status) VALUES(?,?,?,?,?,?,?)');
    for (const t of SEED.tuition) insTu.run(t.id, SEED.student.university, t.label, t.due_date, t.amount_minor, 'GBP', t.status);

    // 90 days of history: three months of the spending pattern, a family top-up, and instalment 1.
    const insTx = db.prepare('INSERT INTO transactions(id,account_id,ts,amount_minor,currency,category,description,payee_id,sandbox_tx_id) VALUES(?,?,?,?,?,?,?,?,?)');
    let n = 0;
    for (let m = 0; m < 3; m++) {
      for (const item of MONTHLY) {
        const ts = t0 - (m * 30 + (30 - item.day)) * DAY - 1;
        insTx.run(`tx_seed_${++n}`, 'acc_gbp', ts, -item.amount, 'GBP', item.category, item.description, 'payee' in item ? item.payee : null, `SBX-SEED-${String(n).padStart(4, '0')}`);
      }
    }
    insTx.run(`tx_seed_${++n}`, 'acc_gbp', t0 - 58 * DAY, 150_000, 'GBP', 'family transfer', 'From family (BDT→GBP via Provider B, sandbox)', null, `SBX-SEED-${String(n).padStart(4, '0')}`);
    insTx.run(`tx_seed_${++n}`, 'acc_bdt', t0 - 28 * DAY, -104_400_000, 'BDT', 'tuition', 'Tuition instalment 1 — University of Northbridge (sandbox)', 'pay_unb', `SBX-SEED-${String(n).padStart(4, '0')}`);

    db.prepare(`INSERT INTO kv(key,value) VALUES('seeded_at', ?)`).run(new Date(t0).toISOString());
  });
  tx();

  appendWithDb(db, {
    actor: 'system',
    action: 'sandbox.seed',
    tier: null,
    decision: 'allowed',
    reason: 'Sandbox created with the fictional Nusrat scenario. No real money or accounts.',
    data: { accounts: SEED.accounts.length, payees: SEED.payees.length, allowlist: SEED.allowlist.length },
  }, auditJsonl);
}
