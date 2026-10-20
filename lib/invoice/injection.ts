/**
 * Deterministic scanner for instructions hidden in documents. It runs on every invoice,
 * whatever the LLM says, and its findings are merged into suspiciousInstructions[].
 * The LLM may find more; it can never remove what this scanner found.
 */
const PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'override', re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,60}\b(instructions?|previous|prior|above|rules?|polic(y|ies)|prompt|checks?)\b/i },
  { id: 'addresses-agent', re: /\b(note to|attention|message for)\s+(the\s+)?(ai|assistant|agent|copilot|bot|model)\b/i },
  { id: 'role-prefix', re: /(^|\n|\s)(system|assistant|ai agent|copilot)\s*(:|>>)/i },
  { id: 'redirect', re: /\b(pay|send|transfer|remit|wire|route)\b[^.\n]{0,80}\binstead\b/i },
  { id: 'redirect-2', re: /\binstead\b[^.\n]{0,60}\b(pay|send|transfer|account|sort code|iban)\b/i },
  { id: 'changed-details', re: /\b(bank|account|payment)\s+(details|information|account)\s+(have|has)\s+(been\s+)?(changed|updated)/i },
  { id: 'new-details', re: /\b(new|updated|changed|alternative|different|temporary)\s+(bank|payment|receiving)\s+(details|account|information)\b/i },
  { id: 'skip-checks', re: /\b(without|skip|bypass|no need (for|to)|don'?t need)\b[^.\n]{0,40}\b(confirm\w*|verif\w*|check\w*|approv\w*|otp|code)\b/i },
  { id: 'mark-trusted', re: /\b(mark|treat|consider|flag)\b[^.\n]{0,40}\b(as\s+)?(verified|trusted|approved|safe|whitelisted|allowlisted)\b/i },
  { id: 'pre-approved', re: /\b(auto[- ]?approve\w*|pre[- ]?approved|already (been )?approved|approval (is )?not required)\b/i },
  { id: 'secrecy', re: /\bdo not\b[^.\n]{0,40}\b(contact|call|verify|tell|inform|check with|email)\b/i },
  { id: 'pressure', re: /\b(final notice|immediately|within (24|48) hours|account will be (closed|suspended)|enrolment will be cancelled)\b/i },
  { id: 'tier-talk', re: /\btier\s*[0-3]\b|\bpermission (gate|level)\b|\ballowlist\b/i },
];

/** Split into sentence-ish chunks so each finding is a readable quote. */
function chunks(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

export interface InjectionFinding {
  text: string;
  patterns: string[];
}

export function scanForInstructions(text: string): InjectionFinding[] {
  const found: InjectionFinding[] = [];
  for (const c of chunks(text)) {
    const hits = PATTERNS.filter((p) => p.re.test(c)).map((p) => p.id);
    if (hits.length) found.push({ text: c.slice(0, 300), patterns: hits });
  }
  return found;
}

/** Merge LLM-reported and scanner-reported instructions, de-duplicated. */
export function mergeInstructions(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...a, ...b]) {
    const k = s.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) continue;
    // Drop a finding fully contained in one we already kept.
    if ([...seen].some((x) => x.includes(k) || k.includes(x))) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}
