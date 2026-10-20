import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Deterministic JSON: object keys sorted recursively, no whitespace. Used for every hash. */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export function sandboxTxId(): string {
  return `SBX-${randomBytes(4).toString('hex').toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

export function numericCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String(randomInt(0, 10));
  return s;
}

function secret(): string {
  return process.env.APP_SECRET || 'sandbox-dev-secret-not-for-production';
}

export function hmac(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Normalise a payee name for exact comparison: case, whitespace and punctuation-insensitive only. */
export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/[^0-9]/g, '');
}

export function normIban(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase();
}
