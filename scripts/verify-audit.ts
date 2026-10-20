/**
 * Independent verifier for an exported audit log.
 *   npm run verify:audit -- evidence/audit-log.jsonl
 * Recomputes every hash from the file alone: sha256(prevHash + canonicalJSON(entry)).
 */
import fs from 'node:fs';
import { parseJsonl, verifyRecords } from '../lib/audit/log';

const file = process.argv[2] ?? 'evidence/audit-log.jsonl';
const records = parseJsonl(fs.readFileSync(file, 'utf8'));
const r = verifyRecords(records);
console.log(`${file}: ${records.length} entries`);
console.log(r.ok ? `OK — chain verifies. Head hash ${r.headHash}` : `FAILED at entry #${r.firstBadSeq}: ${r.problem}`);
process.exit(r.ok ? 0 : 1);
