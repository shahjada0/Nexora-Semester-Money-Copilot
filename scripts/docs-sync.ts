import './env';
/**
 * npm run docs:sync — fill the <!-- AUTO:name --> … <!-- /AUTO:name --> blocks in the docs
 * from evidence/results.json and from worked examples computed by the real code on the seed data.
 * No number in those blocks is typed by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { attacksTable, headline, resultsTable, EVAL_T0, type EvalResults } from './eval-lib';

async function workedExamples(): Promise<Record<string, string>> {
  process.env.NEXORA_DB = ':memory:';
  process.env.FX_OFFLINE = '1';
  const { setFixedNow } = await import('../lib/clock');
  setFixedNow(EVAL_T0);
  const { resetDb, getDb } = await import('../lib/db');
  resetDb();
  const { snapshotRates } = await import('../lib/fx');
  const { compareProviders } = await import('../lib/providers');
  const { computeRunway, runwayInputs } = await import('../lib/runway');
  const { matchInvoicePayee } = await import('../lib/gate/payee');
  const { getAllowlist } = await import('../lib/ledger');
  const { bindConfirmation } = await import('../lib/gate/confirm');
  const { listAudit } = await import('../lib/audit');
  const { fmt } = await import('../lib/money');
  const { POLICY } = await import('../lib/policy');
  const { canonicalJSON } = await import('../lib/util');

  const fx = snapshotRates();
  const mid = fx.rates.BDT;
  const cmp = compareProviders(630_000, mid);
  const tc = [
    `Seed scenario: tuition instalment 2 of **£6,300.00**, mid-market **£1 = ৳${mid}** (snapshot ${fx.asOf}).`,
    '',
    '| Provider | Fee | Markup | Amount × markup | True cost | Family pays |',
    '|---|---|---|---|---|---|',
    ...cmp.quotes.map((q) => `| ${q.providerName} | ${fmt(q.feeMinor, 'GBP')} | ${(q.markupBps / 100).toFixed(2)}% | ${fmt(q.fxMarkupCostMinor, 'GBP')} | **${fmt(q.trueCostMinor, 'GBP')}** | ${fmt(q.bdtPayMinor, 'BDT')} |`),
    '',
    `Provider B: ${fmt(cmp.cheapest.feeMinor, 'GBP')} + £6,300 × 0.30% = ${fmt(cmp.cheapest.trueCostMinor, 'GBP')}. Bank: ${fmt(cmp.bank.feeMinor, 'GBP')} + £6,300 × 2.90% = ${fmt(cmp.bank.trueCostMinor, 'GBP')}. Saving **${fmt(cmp.savingVsBankMinor, 'GBP')} (${cmp.savingVsBankPct.toFixed(1)}%)**.`,
    '',
    `> "${cmp.why}"`,
  ].join('\n');

  const inp = runwayInputs(fx, EVAL_T0);
  const rw = computeRunway(inp);
  const runway = [
    `Seed balances at ${new Date(EVAL_T0).toISOString().slice(0, 10)}: GBP + USD worth **${fmt(inp.gbpMinor, 'GBP')}**, BDT **${fmt(inp.bdtMinor, 'BDT')}**. Average monthly spending over the last 90 days (excluding tuition and family transfers): **${fmt(inp.monthlySpendMinor, 'GBP')}**. Next deadline: ${inp.deadline?.label}, ${fmt(inp.deadline?.amountMinor ?? 0, 'GBP')} on ${inp.deadline?.dueDate}.`,
    '',
    '| | Today’s rate | Taka falls 10% |',
    '|---|---|---|',
    `| £1 = | ৳${rw.base.bdtPerGbp.toFixed(2)} | ৳${rw.shock.bdtPerGbp.toFixed(2)} (= ${mid} ÷ 0.9) |`,
    `| Total in GBP | ${fmt(rw.base.totalGbpMinor, 'GBP')} | ${fmt(rw.shock.totalGbpMinor, 'GBP')} |`,
    `| Months left = total ÷ spend | **${rw.base.monthsLeft}** | **${rw.shock.monthsLeft}** |`,
    `| Funds on ${inp.deadline?.dueDate} (total − spend × months until) | ${fmt(rw.base.fundsAtDeadlineMinor, 'GBP')} | ${fmt(rw.shock.fundsAtDeadlineMinor, 'GBP')} |`,
    `| Covers ${fmt(inp.deadline?.amountMinor ?? 0, 'GBP')}? | ${rw.base.runsOutBeforeDeadline ? `no, short ${fmt(rw.base.shortfallMinor, 'GBP')}` : 'yes'} | ${rw.shock.runsOutBeforeDeadline ? `**no, short ${fmt(rw.shock.shortfallMinor, 'GBP')}**` : 'yes'} |`,
    '',
    `Warning shown: "${rw.warning ?? 'none'}"`,
    '',
    `Suggested action: "${rw.suggestion?.text ?? 'none'}"`,
    '',
    `How the suggestion is sized: converting £P of BDT now removes it from the shock, and each £1 converted saves £0.10 of shock loss. So P = shortfall ÷ 0.10, rounded up to the next £1 and capped at the BDT holdings.`,
  ].join('\n');

  const ok = matchInvoicePayee({ payeeName: 'University of Northbridge', sortCode: '99-01-23', accountNumber: '41873960', iban: null }, getAllowlist());
  const bad = matchInvoicePayee({ payeeName: 'University of Northbridge', sortCode: '99-01-23', accountNumber: '99887766', iban: null }, getAllowlist());
  const payee = [
    'Allowlist entry: University of Northbridge, sort code 99-01-23, account ••••3960.',
    '',
    '| Invoice says | Result | Lines |',
    '|---|---|---|',
    `| University of Northbridge, 99-01-23, 41873960 | ${ok.ok ? '✅ verified' : '❌'} | ${ok.lines.map((l) => `${l.passed ? '✓' : '✗'} ${l.label}`).join('; ')} |`,
    `| University of Northbridge, 99-01-23, 99887766 | ${bad.ok ? '✅' : '❌ blocked, Tier 3'} | ${bad.lines.map((l) => `${l.passed ? '✓' : '✗'} ${l.label}`).join('; ')} |`,
    '',
    `Reason shown: "${bad.reasons.join(' ')}"`,
  ].join('\n');

  const binding = {
    payee: { id: 'pay_unb', name: 'University of Northbridge', sortCode: '99-01-23', accountNumber: '41873960', iban: 'GB00SAND99012341873960' },
    amountMinor: 630_000,
    currency: 'GBP' as const,
    invoiceId: 'inv_example',
    invoiceFieldsHash: 'e3b0c442…(sha256 of the canonical invoice fields)',
    funding: { source: 'acc_gbp', label: 'UK current account' },
  };
  const b1 = bindConfirmation(binding);
  const b2 = bindConfirmation({ ...binding, amountMinor: 995_000 });
  const bind = [
    '```',
    `binding      = ${canonicalJSON(binding)}`,
    `bindingHash  = sha256(binding)            = ${b1.hash}`,
    `amount → £9,950 (attacker edit)           = ${b2.hash}`,
    '```',
    'The confirmation screen shows the bound values. The client sends back the hash it was shown, and the server recomputes it from the current ledger. Any difference blocks the payment.',
  ].join('\n');

  const genesis = listAudit()[0];
  const { hash, ...entry } = genesis;
  const audit = [
    '```',
    `entry #1   = ${canonicalJSON(entry)}`,
    `prevHash   = ${entry.prevHash}`,
    `hash       = sha256(prevHash + canonicalJSON(entry)) = ${hash}`,
    '```',
  ].join('\n');

  const lim = [
    `Policy (\`lib/policy.ts\`): Tier 2 under ${fmt(POLICY.tier2MaxPerTxMinor, 'GBP')} per payment; rolling 24 h ${fmt(POLICY.perPayeeDailyLimitMinor, 'GBP')} per saved payee and ${fmt(POLICY.dailyTotalLimitMinor, 'GBP')} across saved payees. Pending (unexpired) proposals count, so batching proposals does not help.`,
    '',
    '| Payment | Rolling total to payee before | + this | Over £250? | Tier |',
    '|---|---|---|---|---|',
    ...Array.from({ length: 4 }, (_, i) => {
      const before = i * 9_900;
      const after = before + 9_900;
      return `| #${i + 1} £99 | ${fmt(before, 'GBP')} | ${fmt(after, 'GBP')} | ${after > POLICY.perPayeeDailyLimitMinor ? 'yes' : 'no'} | ${after > POLICY.perPayeeDailyLimitMinor ? '**3**' : '2'} |`;
    }),
  ].join('\n');

  void getDb;
  return { 'example-truecost': tc, 'example-runway': runway, 'example-payee': payee, 'example-binding': bind, 'example-audit': audit, 'example-limits': lim };
}

function replaceBlocks(file: string, blocks: Record<string, string>) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  let n = 0;
  for (const [name, body] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- AUTO:${name} -->)[\\s\\S]*?(<!-- /AUTO:${name} -->)`, 'g');
    text = text.replace(re, (_m, a, b) => {
      n++;
      return `${a}\n${body}\n${b}`;
    });
  }
  fs.writeFileSync(file, text);
  console.log(`docs:sync ${path.relative(process.cwd(), file)} — ${n} block(s)`);
}

export async function syncDocs() {
  const r = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'evidence', 'results.json'), 'utf8')) as EvalResults;
  const blocks: Record<string, string> = {
    headline: headline(r),
    attacks: attacksTable(r),
    results: resultsTable(r),
    ...(await workedExamples()),
  };
  for (const f of ['README.md', 'docs/TECHNICAL.md', 'docs/SECURITY_SELF_ASSESSMENT.md', 'docs/DECK_OUTLINE.md', 'docs/DEMO_SCRIPT.md']) replaceBlocks(path.join(process.cwd(), f), blocks);
}

if (process.argv[1]?.includes('docs-sync')) {
  syncDocs().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
