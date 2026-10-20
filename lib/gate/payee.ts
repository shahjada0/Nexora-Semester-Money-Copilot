import type { AllowlistEntry, Payee } from '../ledger';
import { normDigits, normIban, normName } from '../util';

export interface PayeeDetails {
  payeeName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  iban: string | null;
}

export interface CheckLine {
  label: string;
  passed: boolean;
  detail: string;
}

export interface PayeeCheck {
  ok: boolean;
  allowlistId: string | null;
  entry: AllowlistEntry | null;
  lines: CheckLine[];
  reasons: string[];
}

const mask = (s: string | null | undefined) => {
  const d = (s ?? '').replace(/[\s-]/g, '');
  return d ? `••••${d.slice(-4)}` : '—';
};

/**
 * Compare bank details against one allowlist entry. Exact match only:
 * - name must match (case/whitespace/punctuation-insensitive, nothing else),
 * - sort code + account number must both match, or the IBAN must match,
 * - and any detail that IS present must not contradict the entry.
 */
function compare(details: PayeeDetails, e: AllowlistEntry): { ok: boolean; lines: CheckLine[]; reasons: string[] } {
  const lines: CheckLine[] = [];
  const reasons: string[] = [];

  const nameOk = normName(details.payeeName) === normName(e.payee_name);
  lines.push({ label: 'Payee name', passed: nameOk, detail: nameOk ? e.payee_name : `"${details.payeeName ?? ''}" ≠ "${e.payee_name}"` });
  if (!nameOk) reasons.push(`Payee name "${details.payeeName ?? ''}" does not exactly match the verified name "${e.payee_name}".`);

  const hasSort = !!normDigits(details.sortCode);
  const hasAcct = !!normDigits(details.accountNumber);
  const hasIban = !!normIban(details.iban);

  const sortOk = hasSort && normDigits(details.sortCode) === normDigits(e.sort_code);
  const acctOk = hasAcct && normDigits(details.accountNumber) === normDigits(e.account_number);
  const ibanOk = hasIban && !!e.iban && normIban(details.iban) === normIban(e.iban);

  if (hasSort) {
    lines.push({ label: 'Sort code', passed: sortOk, detail: sortOk ? e.sort_code ?? '' : `${details.sortCode} ≠ verified ${e.sort_code ?? 'none'}` });
    if (!sortOk) reasons.push(`Sort code ${details.sortCode} is not the verified sort code for ${e.payee_name}.`);
  }
  if (hasAcct) {
    lines.push({ label: 'Account number', passed: acctOk, detail: acctOk ? mask(e.account_number) : `${mask(details.accountNumber)} ≠ verified ${mask(e.account_number)}` });
    if (!acctOk) reasons.push(`Account number ${mask(details.accountNumber)} is not the verified account (${mask(e.account_number)}) for ${e.payee_name}.`);
  }
  if (hasIban) {
    lines.push({ label: 'IBAN', passed: ibanOk, detail: ibanOk ? mask(e.iban) : `${mask(details.iban)} ≠ verified ${mask(e.iban)}` });
    if (!ibanOk) reasons.push(`IBAN ${mask(details.iban)} is not the verified IBAN for ${e.payee_name}.`);
  }

  const fullPair = (sortOk && acctOk) || ibanOk;
  if (!hasSort && !hasAcct && !hasIban) reasons.push('No bank details found to verify.');
  else if (!fullPair && reasons.length === 0) reasons.push('Bank details are incomplete: need sort code + account number, or IBAN.');

  const contradictions = (hasSort && !sortOk) || (hasAcct && !acctOk) || (hasIban && !ibanOk);
  return { ok: nameOk && fullPair && !contradictions, lines, reasons };
}

/** Check bank details read from an invoice against the institution allowlist. */
export function matchInvoicePayee(details: PayeeDetails, allowlist: AllowlistEntry[]): PayeeCheck {
  // Candidate entries: same name, or same account/IBAN (catches look-alike names on a real account).
  const byName = allowlist.filter((e) => normName(e.payee_name) === normName(details.payeeName));
  const byAcct = allowlist.filter(
    (e) =>
      (normDigits(details.accountNumber) && normDigits(details.accountNumber) === normDigits(e.account_number)) ||
      (normIban(details.iban) && e.iban && normIban(details.iban) === normIban(e.iban)),
  );
  const candidates = byName.length ? byName : byAcct;

  if (candidates.length === 0) {
    return {
      ok: false,
      allowlistId: null,
      entry: null,
      lines: [{ label: 'Institution', passed: false, detail: `"${details.payeeName ?? 'unknown'}" is not on the verified institution list` }],
      reasons: [`"${details.payeeName ?? 'This payee'}" is not a verified institution. Payments to it need the official details from your university's own portal.`],
    };
  }

  let best: { e: AllowlistEntry; r: ReturnType<typeof compare> } | null = null;
  for (const e of candidates) {
    const r = compare(details, e);
    if (r.ok) return { ok: true, allowlistId: e.id, entry: e, lines: [{ label: 'Institution', passed: true, detail: `${e.institution} (verified registry)` }, ...r.lines], reasons: [] };
    if (!best || r.reasons.length < best.r.reasons.length) best = { e, r };
  }
  return {
    ok: false,
    allowlistId: null,
    entry: best!.e,
    lines: [{ label: 'Institution', passed: true, detail: `Compared with ${best!.e.payee_name} (verified registry)` }, ...best!.r.lines],
    reasons: best!.r.reasons,
  };
}

/**
 * For a stored payee: institution payees must still match their registry entry exactly
 * (guards against the payee row being altered). Saved payees are not on the registry.
 */
export function checkPayee(payee: Payee, allowlist: AllowlistEntry[]): PayeeCheck {
  if (payee.kind !== 'institution') {
    return {
      ok: true,
      allowlistId: null,
      entry: null,
      lines: [{ label: 'Saved payee', passed: true, detail: `${payee.name} — saved by you` }],
      reasons: [],
    };
  }
  const entry = allowlist.find((e) => e.id === payee.allowlist_id);
  if (!entry) {
    return { ok: false, allowlistId: null, entry: null, lines: [{ label: 'Institution', passed: false, detail: 'No registry entry' }], reasons: ['Institution payee has no verified registry entry.'] };
  }
  const r = compare({ payeeName: payee.name, sortCode: payee.sort_code, accountNumber: payee.account_number, iban: payee.iban }, entry);
  return { ok: r.ok, allowlistId: r.ok ? entry.id : null, entry, lines: [{ label: 'Institution', passed: true, detail: `${entry.institution} (verified registry)` }, ...r.lines], reasons: r.reasons };
}
