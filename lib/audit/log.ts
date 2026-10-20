import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { canonicalJSON, sha256 } from '../util';
import { isoNow } from '../clock';
import type { Tier } from '../policy';

export const GENESIS_HASH = '0'.repeat(64);

export type Decision = 'allowed' | 'blocked' | 'escalated' | 'needs_confirmation' | 'info';
export type Actor = 'agent' | 'student' | 'parent' | 'system' | 'gate';

export interface AuditEvent {
  actor: Actor;
  action: string;
  tier: Tier | null;
  decision: Decision;
  reason: string;
  data?: Record<string, unknown>;
}

export interface AuditEntry extends Required<Omit<AuditEvent, 'data'>> {
  seq: number;
  ts: string;
  data: Record<string, unknown>;
  prevHash: string;
}

export interface AuditRecord extends AuditEntry {
  hash: string;
}

const SECRET_KEYS = new Set(['otp', 'typedOtp', 'token', 'secret', 'apiKey']);
const MASK_KEYS = new Set(['accountNumber', 'account_number', 'iban', 'sortCode', 'sort_code']);

/** Never write secrets to the log; mask bank details down to their last 4 characters. */
export function redact(value: unknown, key = ''): unknown {
  if (SECRET_KEYS.has(key)) return '[redacted]';
  if (MASK_KEYS.has(key) && typeof value === 'string' && value.length > 4) {
    return `••••${value.replace(/\s|-/g, '').slice(-4)}`;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v, k);
    return out;
  }
  return value;
}

export function hashEntry(entry: AuditEntry): string {
  return sha256(entry.prevHash + canonicalJSON(entry));
}

/**
 * Append one event. Runs in a SQLite transaction so seq/prevHash can never fork.
 * The table has triggers that reject UPDATE and DELETE.
 */
export function appendWithDb(db: Database.Database, event: AuditEvent, jsonlPath?: string | null): AuditRecord {
  const run = db.transaction((): AuditRecord => {
    const last = db.prepare('SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1').get() as
      | { seq: number; hash: string }
      | undefined;
    const entry: AuditEntry = {
      seq: (last?.seq ?? 0) + 1,
      ts: isoNow(),
      actor: event.actor,
      action: event.action,
      tier: event.tier,
      decision: event.decision,
      reason: event.reason,
      data: (redact(event.data ?? {}) as Record<string, unknown>) ?? {},
      prevHash: last?.hash ?? GENESIS_HASH,
    };
    const hash = hashEntry(entry);
    db.prepare(
      'INSERT INTO audit_log(seq, ts, actor, action, tier, decision, reason, entry_json, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(entry.seq, entry.ts, entry.actor, entry.action, entry.tier, entry.decision, entry.reason, canonicalJSON(entry), entry.prevHash, hash);
    return { ...entry, hash };
  });
  const record = run();
  if (jsonlPath) fs.appendFileSync(jsonlPath, canonicalJSON(record) + '\n', 'utf8');
  return record;
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  headHash: string;
  firstBadSeq: number | null;
  problem: string | null;
}

/** Verify a sequence of records: contiguous seq, prevHash links, and each recomputed hash. */
export function verifyRecords(records: AuditRecord[]): VerifyResult {
  let prev = GENESIS_HASH;
  for (let i = 0; i < records.length; i++) {
    const { hash, ...entry } = records[i];
    const fail = (problem: string): VerifyResult => ({ ok: false, count: records.length, headHash: prev, firstBadSeq: entry.seq ?? i + 1, problem });
    if (entry.seq !== i + 1) return fail(`sequence gap: expected ${i + 1}, found ${entry.seq}`);
    if (entry.prevHash !== prev) return fail(`entry ${entry.seq} does not link to the previous hash`);
    if (hashEntry(entry as AuditEntry) !== hash) return fail(`entry ${entry.seq} content does not match its hash (tampered)`);
    prev = hash;
  }
  return { ok: true, count: records.length, headHash: prev, firstBadSeq: null, problem: null };
}

export function parseJsonl(text: string): AuditRecord[] {
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as AuditRecord);
}
