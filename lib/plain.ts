/** Plain-language summary of why the gate stopped a payment (full reasons stay on the card). */
export function plainStop(reasons: string[]): string {
  const all = reasons.join(' ');
  if (/instruction\(s\) aimed at/.test(all)) return 'I won’t pay this one: the invoice has hidden text trying to trick the app. Please get a clean copy from your university portal.';
  const changed = reasons.find((r) => /changed after you read it/.test(r));
  if (changed) return `Stopped: the invoice changed after you checked it. ${changed.replace(/^The invoice amount changed after you read it: /, 'Amount: ')}`;
  if (/scam check/i.test(all)) return 'I won’t pay this: you were warned this looks like a scam, so payments to them are blocked for 24 hours.';
  if (/not the verified|not a verified institution|does not exactly match|IBAN/.test(all)) return 'I won’t pay this: the bank details don’t match the university’s official account. Check with the university directly.';
  if (/Unknown payee|saved payees/.test(all)) return 'I can only pay people you’ve already saved, or your university.';
  return `Our safety rules stopped this payment. ${reasons[0] ?? ''}`.trim();
}

