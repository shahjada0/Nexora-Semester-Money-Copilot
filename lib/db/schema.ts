/** Sandbox ledger schema. All money is integer minor units; all timestamps are epoch ms. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  holder TEXT NOT NULL,
  institution TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance_minor INTEGER NOT NULL
);

-- Official registry of verified institution bank details (the payee allowlist).
CREATE TABLE IF NOT EXISTS allowlist (
  id TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  sort_code TEXT,
  account_number TEXT,
  iban TEXT,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('institution', 'saved')),
  category TEXT NOT NULL,
  sort_code TEXT,
  account_number TEXT,
  iban TEXT,
  currency TEXT NOT NULL,
  allowlist_id TEXT REFERENCES allowlist(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  ts INTEGER NOT NULL,
  amount_minor INTEGER NOT NULL,          -- negative = money out
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  payee_id TEXT,
  sandbox_tx_id TEXT,
  proposal_id TEXT
);

CREATE TABLE IF NOT EXISTS tuition_schedule (
  id TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  label TEXT NOT NULL,
  due_date TEXT NOT NULL,                 -- YYYY-MM-DD
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'due'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  fields_json TEXT NOT NULL,
  suspicious_json TEXT NOT NULL,
  fields_hash TEXT NOT NULL,              -- sha256 of canonical fields at read time
  extractor TEXT NOT NULL,                -- 'llm' | 'rules'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  payee_id TEXT NOT NULL REFERENCES payees(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  tier INTEGER NOT NULL,
  invoice_id TEXT,
  funding_json TEXT NOT NULL,
  memo TEXT NOT NULL,
  binding_hash TEXT NOT NULL,
  binding_json TEXT NOT NULL,
  otp TEXT,
  reasons_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  cooling_until INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending', 'executed', 'blocked', 'expired', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  family_required INTEGER NOT NULL DEFAULT 0,
  family_status TEXT,                     -- null | 'pending' | 'approved' | 'rejected'
  executed_tx_id TEXT,
  executed_at INTEGER
);

CREATE TABLE IF NOT EXISTS rate_alerts (
  id TEXT PRIMARY KEY,
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  target REAL NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  triggered_at INTEGER
);

-- Temporary gate blocks (e.g. after a high-risk scam check).
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('payee_name', 'account', 'amount', 'keyword')),
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS family_links (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id),
  approver TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  decision TEXT
);

CREATE TABLE IF NOT EXISTS planned_transfers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL
);

-- Append-only, hash-chained audit log. Mirrored to a JSONL file.
CREATE TABLE IF NOT EXISTS audit_log (
  seq INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  tier INTEGER,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  entry_json TEXT NOT NULL,               -- canonical JSON of the full entry (without hash)
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
`;
