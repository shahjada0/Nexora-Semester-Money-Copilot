import './env';
import { dbPath, getDb, resetDb } from '../lib/db';

resetDb();
const db = getDb();
const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
console.log(`Sandbox seeded at ${dbPath()}`);
for (const t of ['accounts', 'allowlist', 'payees', 'transactions', 'tuition_schedule', 'audit_log']) {
  console.log(`  ${t.padEnd(18)} ${count(t)}`);
}
