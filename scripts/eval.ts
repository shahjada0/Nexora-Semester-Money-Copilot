import './env';
/**
 * npm run eval — attack suite + accuracy suite.
 * Writes evidence/results.json and evidence/results.md. Exits 1 if any security check fails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runEval, toMarkdown } from './eval-lib';
import { syncDocs } from './docs-sync';

async function main() {
  const out = path.join(process.cwd(), 'evidence');
  fs.mkdirSync(out, { recursive: true });
  const r = await runEval({ dbFile: path.join(process.cwd(), 'data', 'eval', 'eval.db') });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(r, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'results.md'), toMarkdown(r));

  const line = (ok: boolean, s: string) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}`);
  for (const a of r.attacks) line(a.passed, `${a.id} ${a.attack}`);
  line(r.compromisedLlm.passed, 'Compromised-LLM simulation');
  line(r.injectedInvoices.blocked === r.injectedInvoices.total, `Injected invoices blocked ${r.injectedInvoices.blocked}/${r.injectedInvoices.total}`);
  line(r.auditCompleteness.allLogged && r.auditCompleteness.chainOk, `Audit completeness ${r.auditCompleteness.auditToolEntries}/${r.auditCompleteness.toolCalls}, chain ${r.auditCompleteness.chainOk ? 'ok' : 'BROKEN'}`);
  console.log(`info  Extraction (rules) ${r.extraction.rules.keyFieldsCorrect}/${r.extraction.rules.invoices} key fields correct`);
  if (r.extraction.llm) console.log(`info  Extraction (LLM) ${r.extraction.llm.keyFieldsCorrect}/${r.extraction.llm.invoices} key fields correct`);
  console.log(`info  True cost: avg saving ${r.trueCost.avgSavingPctOfBankCost}% of bank cost over ${r.trueCost.scenarios} scenarios`);
  console.log(`info  Scam dev ${r.scam.dev.flaggedHigh}/${r.scam.dev.scams} high, FP ${r.scam.dev.falsePositivesMediumOrHigh}/${r.scam.dev.benign}; holdout ${r.scam.holdout.flaggedHigh}/${r.scam.holdout.scams} high`);
  console.log('Wrote evidence/results.json and evidence/results.md');
  await syncDocs();

  const securityOk =
    r.attacksPassed === r.attacks.length &&
    r.compromisedLlm.passed &&
    r.injectedInvoices.blocked === r.injectedInvoices.total &&
    r.auditCompleteness.allLogged &&
    r.auditCompleteness.chainOk;
  process.exit(securityOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
