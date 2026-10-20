import { POLICY } from '../policy';
import { canonicalJSON, normName, safeEqual, sha256 } from '../util';

export type ConfirmationRequirement =
  | { kind: 'one_click' }
  | { kind: 'strong'; retype: ['amount', 'payeeName']; otp: true; coolingOffSeconds: number };

/** What the student must do to approve a payment at this tier. */
export function requireConfirmation(tier: 2 | 3): ConfirmationRequirement {
  if (tier === 2) return { kind: 'one_click' };
  return { kind: 'strong', retype: ['amount', 'payeeName'], otp: true, coolingOffSeconds: POLICY.coolingOffSeconds };
}

export interface Binding {
  payee: { id: string; name: string; sortCode: string | null; accountNumber: string | null; iban: string | null };
  amountMinor: number;
  currency: 'GBP';
  invoiceId: string | null;
  invoiceFieldsHash: string | null;
  funding: Record<string, unknown>;
}

/**
 * Bind a confirmation to exactly what will be paid. The hash covers payee bank details,
 * amount, currency, the invoice fields as read, and the funding route. If any of these
 * changes between "read" and "execute", the hash no longer matches and execution stops.
 */
export function bindConfirmation(binding: Binding): { json: string; hash: string } {
  const json = canonicalJSON(binding);
  return { json, hash: sha256(json) };
}

export function hashesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && safeEqual(a, b);
}

/** "6300", "6,300.00", "£6,300.5" → pence. Anything else (3 decimals, words) → null. */
export function parseTypedAmount(input: string | null | undefined): number | null {
  const s = (input ?? '').trim().replace(/^£\s*/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export interface TypedInput {
  typedAmount?: string;
  typedPayeeName?: string;
  otp?: string;
}

export function checkTypedConfirmation(
  expected: { amountMinor: number; payeeName: string; otp: string | null },
  input: TypedInput,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (parseTypedAmount(input.typedAmount) !== expected.amountMinor) failures.push('The amount you typed does not match the payment amount.');
  if (normName(input.typedPayeeName) !== normName(expected.payeeName)) failures.push('The payee name you typed does not match the payee.');
  if (!expected.otp || !input.otp || !safeEqual(input.otp.trim(), expected.otp)) failures.push('The one-time code is wrong.');
  return { ok: failures.length === 0, failures };
}
