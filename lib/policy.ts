/**
 * Single source of truth for every limit the Permission Gate enforces.
 * All money values are integer minor units (pence for GBP).
 * Change a number here and the gate, the UI and the tests all follow.
 */

const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export const POLICY = {
  /** Currency all limits are expressed in. */
  limitCurrency: 'GBP' as const,

  /** Tier 2 applies only below this per-transaction amount (strictly less than). £200. */
  tier2MaxPerTxMinor: 20_000,

  /** Rolling 24 h total across all payees. Going over escalates to Tier 3. £500. */
  dailyTotalLimitMinor: 50_000,

  /** Rolling 24 h total to any single payee before escalation. Catches split payments. £250. */
  perPayeeDailyLimitMinor: 25_000,

  /** Rolling 24 h window length. */
  rollingWindowMs: 24 * 60 * 60 * 1000,

  /** Absolute ceiling per transaction, even with Tier 3 confirmation. £25,000. */
  hardMaxPerTxMinor: 2_500_000,

  /** Tier 3 cooling-off timer. 30 s in demo mode; a production setting would be hours. */
  coolingOffSeconds: envInt('COOLING_OFF_SECONDS', 30),

  /** A proposed payment must be confirmed within this window or it expires. */
  confirmationTtlMs: 15 * 60 * 1000,

  /** Mock OTP length (sandbox: the code is displayed on screen, never sent anywhere). */
  otpLength: 6,

  /** Maximum wrong OTP / re-type attempts before the proposal is cancelled. */
  maxConfirmAttempts: 3,

  /** A payee added less than this long ago counts as "new" (Tier 3). */
  newPayeeCoolingMs: 24 * 60 * 60 * 1000,

  /** If an invoice contains instructions aimed at the agent, refuse to pay from it. */
  blockOnSuspiciousInstructions: true,

  /** A high-risk scam check blocks related payees/amounts for this long. */
  scamBlockHours: 24,

  /** Family approval link lifetime. */
  familyLinkTtlMs: 24 * 60 * 60 * 1000,

  /** Tuition payments need a parent approval as well as the student's (once requested). */
  requireFamilyApprovalForTuition: false,

  /** Maximum agent loop steps per user turn. */
  maxAgentSteps: 6,
} as const;

export type Policy = typeof POLICY;

/** Tier definitions shown in the UI and docs. */
export const TIERS = {
  0: { name: 'Read', control: 'Automatic' },
  1: { name: 'Suggest', control: 'Automatic, with a plain-English reason' },
  2: { name: 'Small payment', control: 'Student confirms with one click' },
  3: {
    name: 'Big payment',
    control: 'Re-type amount and payee + allowlist check + OTP + cooling-off timer',
  },
} as const;

export type Tier = 0 | 1 | 2 | 3;
