import fs from 'node:fs';
import { auditJsonlPath, getDb } from '../db';
import {
  appendWithDb,
  parseJsonl,
  verifyRecords,
  type AuditEvent,
  type AuditRecord,
  type VerifyResult,
} from './log';

export type { AuditEvent, AuditRecord, VerifyResult } from './log';
export { verifyRecords, parseJsonl, GENESIS_HASH } from './log';

/** Append an event to SQLite and the JSONL mirror. */
export function append(event: AuditEvent): AuditRecord {
  return appendWithDb(getDb(), event, auditJsonlPath());
}

export function listAudit(limit?: number): AuditRecord[] {
  const sql = limit
    ? 'SELECT entry_json, hash FROM audit_log ORDER BY seq DESC LIMIT ?'
    : 'SELECT entry_json, hash FROM audit_log ORDER BY seq ASC';
  const rows = (limit ? getDb().prepare(sql).all(limit) : getDb().prepare(sql).all()) as { entry_json: string; hash: string }[];
  return rows.map((r) => ({ ...(JSON.parse(r.entry_json) as Omit<AuditRecord, 'hash'>), hash: r.hash }));
}

export function exportJsonl(): string {
  return listAudit()
    .map((r) => JSON.stringify(r))
    .join('\n') + '\n';
}

export interface ChainReport extends VerifyResult {
  jsonl: { present: boolean; count: number; matchesDb: boolean } ;
}

/**
 * Verify the SQLite chain, then check the JSONL mirror has exactly the same records.
 * Either copy being edited, truncated or re-ordered makes this fail.
 */
export function verifyChain(): ChainReport {
  const records = listAudit();
  const result = verifyRecords(records);
  const p = auditJsonlPath();
  if (!p) return { ...result, jsonl: { present: false, count: 0, matchesDb: true } };
  if (!fs.existsSync(p)) return { ...result, ok: false, problem: result.problem ?? 'JSONL mirror missing', jsonl: { present: false, count: 0, matchesDb: false } };
  const fileRecords = parseJsonl(fs.readFileSync(p, 'utf8'));
  const fileCheck = verifyRecords(fileRecords);
  const matchesDb = fileCheck.ok && fileRecords.length === records.length && fileCheck.headHash === result.headHash;
  return {
    ...result,
    ok: result.ok && matchesDb,
    problem: result.problem ?? (matchesDb ? null : `JSONL mirror differs from SQLite (${fileRecords.length} vs ${records.length} entries${fileCheck.problem ? `; ${fileCheck.problem}` : ''})`),
    jsonl: { present: true, count: fileRecords.length, matchesDb },
  };
}
