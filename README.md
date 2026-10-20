# Semester Money Copilot by Nexora

**2026 FinTechathon International Track (WeBank, Shenzhen) — Topic C: Cross-border & Student Finance Assistant.**
Theme: *AI as a Financial Participant.*

> **SANDBOX ONLY.** No real money moves. Every bank, university, provider and account in this repo is fictional
> (e.g. "University of Northbridge", "Provider A–D", sort codes `99-xx-xx`, IBANs `GB00SAND…`). FX rates are real mid-market rates.

## 30-second pitch

Nusrat is a Bangladeshi master's student in the UK. Her parents fund her in taka; her £18,900 tuition is billed in pounds.
Sending money abroad still costs **6.36%** on average, against a G20 target of 5% (World Bank RPW). Much of that cost is
hidden in a bad exchange rate. Relatives push her father toward *hundi*: fast, illegal and unprotected.

**Semester Money Copilot** is an AI agent that completes the money tasks a student actually has. It reads the tuition
invoice, checks the payee, compares the true cost of each licensed route, pays in the sandbox after strong confirmation,
shows how many months the money lasts if the taka falls 10%, and checks scam messages.

Its core rule: **the LLM plans; deterministic code decides.** Every tool call passes a plain-TypeScript **Permission Gate**
(4 tiers, payee allowlist, rolling limits, confirmation binding) and lands in a **hash-chained audit log**. A fully
prompt-injected model still cannot pay an account that is not on the allowlist, or get past the limits.

<!-- AUTO:headline -->
**5/5** attacks defended · **6/6** injected or fake invoices blocked · **9/9** invoices read correctly (offline parser) · cheapest licensed route costs on average **82.6%** less in fees + hidden FX markup than the bank (24 sandbox quotes) · **10/10** scams flagged high-risk on the dev set with 0 false positives (held-out: 4/4 high, 4/4 warned) · **17/17** actions audited, chain verified. _(from `evidence/results.json`, 2026-10-17)_
<!-- /AUTO:headline -->

## Screenshots

| Hero flow: verified payee → true cost → Tier 3 confirmation | Injected invoice blocked | Scam check → 24 h payment block |
|---|---|---|
| ![hero](docs/screenshots/hero.png) | ![inject](docs/screenshots/injection.png) | ![scam](docs/screenshots/scam.png) |

| Parent approval (Bengali, mobile) | Semester plan | Audit log verified |
|---|---|---|
| ![family](docs/screenshots/family.png) | ![calendar](docs/screenshots/calendar.png) | ![audit](docs/screenshots/audit.png) |

_Screenshots come from `/?demo=1&run=<scenario>` (headless capture). `run` accepts `happy`, `inject`, `swap`, `tamper`, `split`, `scam`, `scampay`, `shock`._

## Quick start

Requires Node.js ≥ 18.18 (developed and tested on Node 24).

```bash
npm i && npm run seed && npm run dev
```

Open <http://localhost:3000>. Add **`?demo=1`** for the Demo panel (one-click scenarios: happy-path tuition, injected
invoice, account swap, amount tamper, split payment, scam message, taka −10% shock, reset).

Every flow works **without an API key**: a rule-based invoice parser and a scripted planner take over, and they go through
the same gate. Add a Google AI Studio (Gemini API) key, or a Groq key, to let the LLM plan.

### Environment variables (`.env.local`, see `.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | auto | `gemini` or `groq`. Auto: Gemini if `GEMINI_API_KEY` is set, else Groq, else the rule-based fallback. |
| `GEMINI_API_KEY` | _(empty)_ | Google AI Studio key. Enables Gemma 4 (default provider). |
| `GEMINI_MODEL` / `GEMINI_FAST_MODEL` | `gemma-4-26b-a4b-it` | Planner / extraction + scam model. `gemma-4-31b-it` also works but takes about 30 s per call. |
| `GROQ_API_KEY` | _(empty)_ | Alternative provider (Groq). |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Any Groq chat model with tool use, e.g. `openai/gpt-oss-20b` (faster, smaller). |
| `APP_SECRET` | dev value | HMAC secret for family-approval tokens. Set a long random string in any deployment. |
| `COOLING_OFF_SECONDS` | `30` | Tier 3 cooling-off timer (demo value; production would be hours). |
| `FX_OFFLINE` | `0` | `1` = never call the live FX API; use `data/fx-snapshot.json`. |
| `NEXORA_DB` | `data/nexora.db` | SQLite path (`/tmp/nexora.db` on Vercel). |

## Deploy to Render (free tier)

See [`render-deplot/`](render-deplot/README.md): a ready Blueprint (`render.yaml`), the environment variables, and a step-by-step guide.

## Tests, evals and evidence

```bash
npm test            # Vitest: gate, audit chain, extraction, payments, attacks, agent (incl. simulated compromised LLM)
npm run eval        # attack suite + accuracy suite → evidence/results.json + evidence/results.md (+ refreshes doc tables)
npm run evidence    # clean seed → eval + full scripted demo run (real clock) → evidence/audit-log.jsonl + verify-output.txt
npm run verify:audit -- evidence/audit-log.jsonl   # independent hash-chain check of any exported log
```

`npm run eval` exits non-zero if any attack succeeds or any action is missing from the audit log.

## Deploy to Vercel

```bash
npx vercel --prod
```

1. Import the repo in Vercel (framework preset: Next.js); no build settings to change.
2. Set `APP_SECRET` (required) and, optionally, `GROQ_API_KEY` / `GROQ_MODEL` in *Project → Settings → Environment Variables*.
3. On Vercel the SQLite file lives in `/tmp` and is seeded on cold start. State is per instance and can reset; that is
   fine for a sandbox demo. **For the live final we run locally** (`npm run dev`) so nothing depends on the network.

## Submission map

| Required item | Where |
|---|---|
| 1. Technical documentation (architecture, core algorithm, security design) | [`docs/TECHNICAL.md`](docs/TECHNICAL.md) |
| 2. Presentation (≤ 10 min) | [`docs/DECK_OUTLINE.md`](docs/DECK_OUTLINE.md) |
| 3. Demo video (≤ 5 min) | [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) |
| 4. Source code, README, GitHub link, deployment, test cases | this repo · `tests/` · `scripts/eval-lib.ts` |
| 5. Security self-assessment (permission tiers, known risks) | [`docs/SECURITY_SELF_ASSESSMENT.md`](docs/SECURITY_SELF_ASSESSMENT.md) |
| 6. Execution evidence: sandbox operation logs | [`evidence/`](evidence/) — `audit-log.jsonl`, `verify-output.txt`, `results.md` |

GitHub: link given in the submission email.

## Project layout

```
app/                 Next.js App Router pages + API routes (chat, upload, confirm, audit, demo, family)
components/          Chat, dashboard, rich cards, confirmation sheet, demo panel
lib/agent/           system prompt, agent loop, scripted planner (fallback)
lib/gate/            Permission Gate: classifyTier, checkPayee, checkLimits, requireConfirmation, bindConfirmation
lib/tools/           readInvoice, getBalances, getQuotes, computeTrueCost, monthsLeft, scamCheck, setRateAlert, proposePayment, executePayment
lib/audit/           append(), verifyChain() — hash-chained JSONL + SQLite
lib/llm/provider.ts  the only LLM entry point (Gemma 4 via the Gemini API by default, or Groq; swap with env vars)
lib/policy.ts        every limit in one file
fixtures/            3 genuine + 6 malicious invoices (with ground truth), 18 + 6 held-out labelled messages
scripts/             seed, fixtures, eval, evidence, docs-sync, verify-audit
evidence/            generated execution evidence
```

## Third-party licences

All runtime and build dependencies use permissive licences.

| Package | Use | Licence |
|---|---|---|
| next | web framework | MIT |
| react, react-dom | UI | MIT |
| tailwindcss, postcss, autoprefixer | styling | MIT |
| better-sqlite3 | sandbox ledger + audit store | MIT |
| groq-sdk | LLM API client | Apache-2.0 |
| zod | validation of every tool call and extraction | MIT |
| unpdf (bundles pdf.js) | PDF text extraction | MIT (pdf.js: Apache-2.0) |
| lucide-react | icons | ISC |
| pdf-lib | generating fixture PDFs (dev) | MIT |
| vitest | tests (dev) | MIT |
| tsx | running scripts (dev) | MIT |
| typescript | compiler (dev) | Apache-2.0 |
| eslint, eslint-config-next | linting (dev) | MIT |

| Model / data | Use | Licence / terms |
|---|---|---|
| `gemma-4-26b-a4b-it` (default, via Google Gemini API) | planning, extraction, scam classification | Apache-2.0 ([Gemma 4 licence](https://ai.google.dev/gemma/docs/gemma_4_license)); served under the Gemini API terms |
| `gemma-4-31b-it` (optional) | same, slower | Apache-2.0 |
| `openai/gpt-oss-120b` (alternative, via Groq) | planning, extraction, scam classification | Apache-2.0 open weights; served under Groq's API terms |
| `openai/gpt-oss-20b` (alternative) | same | Apache-2.0 open weights; served under Groq's API terms |
| open.er-api.com (ExchangeRate-API) | live mid-market FX rates | free tier, attribution requested; snapshot committed in `data/fx-snapshot.json` |
| World Bank Remittance Prices Worldwide | 6.36% / 5% statistics in the pitch | CC BY 4.0 |

The Nexora logo is the team's own asset.
