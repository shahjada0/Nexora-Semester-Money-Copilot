// Builds the .pptx from the rendered slide images (one full-bleed picture per slide) plus speaker notes.
// usage: node build_pptx.js <slides_dir> <out.pptx>
const path = require('path');
const pptxgen = require('pptxgenjs');

const [dir, out] = process.argv.slice(2);

const NOTES = [
  'Title (15 s). We are Nexora. Semester Money Copilot is an AI agent that completes real money tasks for international students, in a sandbox. Our one rule: the AI plans, deterministic code decides.',
  'The problem (0:50). Sending money abroad still costs 6.36% on average, against the G20 target of 5% (World Bank Remittance Prices Worldwide). Digital channels are cheaper, 4.64% vs 6.66% for non-digital. Much of the cost is hidden in the exchange rate, not the fee. Students also face large tuition bills in another currency and scams aimed at them.',
  'Meet Nusrat (0:40). A Bangladeshi MSc student in the UK. Her parents in Dhaka fund her in taka; her tuition is £18,900 in three instalments of £6,300. The legal route, a bank student file, is slow; relatives suggest hundi, which is fast but illegal and unprotected. Our goal: make the legal, licensed route the easy route.',
  'The gap (0:45). Good tools exist, but each solves one piece: Wise and Remitly for transfers, Flywire for tuition, Revolut for multi-currency. None tells her when and how much to send, none checks the payee is real, none shows how many months her money lasts, and nothing checks a payment before it goes out. No tool plans the whole semester or acts for the student.',
  'Market size (0:30). TAM: about 7.3 million international students worldwide (UNESCO, 2023), and about 660 billion dollars of global education payments (Flywire). SAM: the UK, with 732,285 international students paying 11.8 billion pounds in tuition plus at least 7.7 billion pounds in living costs, about 19.5 billion pounds a year. SOM: we start with the 12,285 Bangladeshi students in the UK, about 327 million pounds a year, and aim to serve 10% of them, about 33 million pounds of payments, by year three. Bangladesh already sent 730 million dollars abroad legally for education in just the first ten months of fiscal year 2026, up from 218 million in 2020, so the legal flow is large and growing.',
  'Our solution (0:50). Four tasks the agent completes: pay tuition with a payee check and strong confirmation; compare transfers by true cost (fee plus hidden FX markup); months left, including a taka -10% shock; and a scam check that actually blocks related payments for 24 hours. Every suggestion has a plain-English "Why?". Sandbox only: fictional institutions, real mid-market FX rates.',
  'Live demo (2:40).Open http://localhost:3000/?demo=1. Run: happy-path tuition (verified payee, true cost, Tier 3 confirmation), injected invoice blocked, account swap, amount tamper, split payment, scam message then pay them, taka shock and semester plan, family approval in Bengali on a phone window, then Activity, Verify integrity. Backup: the 4:22 demo video, if the network fails. The app itself needs no network.',
  'Architecture (0:40). The student and the parent talk to the app; the AI agent (Gemma 4 via the Gemini API, or Groq) can only request tools. Every call passes the Permission Gate, plain TypeScript with no LLM: tiers, payee allowlist, rolling limits, confirmation binding. Only allowed calls touch the sandbox ledger, and every call and decision lands in a SHA-256 hash-chained audit log. Payment tools take IDs, never account numbers; executePayment is never offered to the model.',
  'Security tiers and attacks (0:50). Tier 0 read and Tier 1 suggest are automatic. Tier 2 is a small payment to a saved payee under £200, one click. Tier 3 is tuition, new payees, £200 or more, or over the 24 h limits: re-type amount and payee, allowlist check, one-time code and a cooling-off timer. We attacked our own agent with the five attacks from our proposal, as automated tests: all five defended. We also simulated a fully compromised LLM: zero payments, every attempt logged.',
  'Results (0:40). All numbers come from npm run eval (evidence/results.json): 5/5 attacks defended; 6/6 fake or injected invoices blocked while 3/3 genuine ones reach confirmation; 9/9 invoices read correctly; the cheapest licensed route costs 82.6% less than the bank on average over 24 quotes; 10/10 scams flagged high risk with 0 false positives, plus a held-out set; 17/17 actions audited and the chain verifies. 91 unit tests pass.',
  'Innovation (0:40). Family approval: a signed, single-use link in Bengali, so the payment needs both Nusrat and her father. Semester planning: transfers in two tranches that finish 10 days before each deadline. Legal channels first: a student-file checklist for parents, never hundi. Confirmation binding: what you see is exactly what gets paid.',
  'The team (0:15). We are Team Nexora: our advisor, Abdullah Al Araf; Tabia Rahman, team leader; and Shahjada Alif, technical lead.',
  'Limits and close (0:40). Honest limits: sandbox only, mock OTP, two allowlisted payees, no OCR, no user login, modelled provider prices. Next: licensed provider APIs and KYC, a Confirmation of Payee registry, OCR, Bengali scam patterns, authenticated sessions, a credit coach. Close: the AI plans; deterministic code decides. Thank you.',
];

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in, same 16:9 as the 1280 x 720 slides
pres.title = 'Semester Money Copilot by Nexora';
pres.author = 'Nexora';
pres.company = 'Nexora';
pres.subject = '2026 FinTechathon International Track, Topic C';

NOTES.forEach((note, i) => {
  const s = pres.addSlide();
  s.addImage({ path: path.join(dir, `slide-${String(i + 1).padStart(2, '0')}.jpg`), x: 0, y: 0, w: 13.333, h: 7.5, altText: `Slide ${i + 1}` });
  s.addNotes(note);
});

pres.writeFile({ fileName: out }).then((f) => console.log('wrote', f));
