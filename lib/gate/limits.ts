import { POLICY } from '../policy';
import type { Block, Payee, RollingTotals } from '../ledger';
import { normDigits, normName } from '../util';

export interface LimitCheck {
  overTier2: boolean;
  overPayeeDaily: boolean;
  overDaily: boolean;
  overHardMax: boolean;
  projectedPayeeMinor: number;
  projectedAllMinor: number;
}

/** Compare one payment against the per-transaction, per-payee 24 h and total 24 h limits. */
export function checkLimits(amountMinor: number, rolling: RollingTotals): LimitCheck {
  const projectedPayeeMinor = rolling.payeeTotalMinor + amountMinor;
  const projectedAllMinor = rolling.allTotalMinor + amountMinor;
  return {
    overTier2: amountMinor >= POLICY.tier2MaxPerTxMinor,
    overPayeeDaily: projectedPayeeMinor > POLICY.perPayeeDailyLimitMinor,
    overDaily: projectedAllMinor > POLICY.dailyTotalLimitMinor,
    overHardMax: amountMinor > POLICY.hardMaxPerTxMinor,
    projectedPayeeMinor,
    projectedAllMinor,
  };
}

export interface BlockCheck {
  blocked: boolean;
  matches: Block[];
}

/** Active temporary blocks (from a high-risk scam check) on a payee name, account or amount. */
export function checkBlocks(payee: Pick<Payee, 'name' | 'account_number' | 'iban'>, amountMinor: number, blocks: Block[]): BlockCheck {
  const name = normName(payee.name);
  const acct = normDigits(payee.account_number);
  const iban = (payee.iban ?? '').replace(/\s/g, '').toUpperCase();
  const matches = blocks.filter((b) => {
    switch (b.kind) {
      case 'payee_name':
        return name.length > 0 && normName(b.value).length > 0 && name.includes(normName(b.value));
      case 'account':
        return (acct.length > 0 && normDigits(b.value) === acct) || (iban.length > 0 && b.value.replace(/\s/g, '').toUpperCase() === iban);
      case 'amount':
        return Number(b.value) === amountMinor;
      case 'keyword':
        return name.includes(normName(b.value));
      default:
        return false;
    }
  });
  return { blocked: matches.length > 0, matches };
}
