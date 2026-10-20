import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';
import { seedDatabase } from './seed';

type DB = Database.Database;

const g = globalThis as unknown as { __nexoraDb?: DB; __nexoraDbPath?: string };

/**
 * Where the sandbox ledger lives.
 * - NEXORA_DB env wins (tests use ':memory:', eval uses a temp file).
 * - On Vercel the bundle is read-only, so the DB is created and seeded in /tmp on cold start.
 * - Locally: data/nexora.db.
 */
export function dbPath(): string {
  if (process.env.NEXORA_DB) return process.env.NEXORA_DB;
  if (process.env.VERCEL) return '/tmp/nexora.db';
  return path.join(process.cwd(), 'data', 'nexora.db');
}

/** JSONL mirror of the audit log, next to the DB. null for in-memory DBs. */
export function auditJsonlPath(): string | null {
  const p = dbPath();
  if (p === ':memory:') return null;
  return path.join(path.dirname(p), path.basename(p).replace(/\.db$/, '') + '-audit.jsonl');
}

function open(): DB {
  const p = dbPath();
  if (p !== ':memory:') fs.mkdirSync(path.dirname(p), { recursive: true });
  const fresh = p === ':memory:' || !fs.existsSync(p);
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  const seeded = db.prepare(`SELECT value FROM kv WHERE key = 'seeded_at'`).get();
  if (fresh || !seeded) {
    const jsonl = auditJsonlPath();
    if (jsonl && fs.existsSync(jsonl)) fs.rmSync(jsonl);
    seedDatabase(db, jsonl);
  }
  return db;
}

export function getDb(): DB {
  const p = dbPath();
  if (!g.__nexoraDb || g.__nexoraDbPath !== p) {
    g.__nexoraDb = open();
    g.__nexoraDbPath = p;
  }
  return g.__nexoraDb;
}

/** Throw away all sandbox state and re-create the Nusrat scenario from scratch. */
export function resetDb(): void {
  const p = dbPath();
  if (g.__nexoraDb) {
    g.__nexoraDb.close();
    g.__nexoraDb = undefined;
  }
  if (p !== ':memory:') {
    for (const f of [p, `${p}-wal`, `${p}-shm`, auditJsonlPath()]) {
      if (f && fs.existsSync(f)) fs.rmSync(f);
    }
  }
  getDb();
}

export function kvGet(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function kvSet(key: string, value: string): void {
  getDb().prepare('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
