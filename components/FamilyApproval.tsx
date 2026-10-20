'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ShieldCheck, Check, X, Languages, FileCheck2, ChevronDown, Loader2, OctagonX } from 'lucide-react';
import { fmt } from '@/lib/money';
import type { FamilyViewData } from '@/lib/family';
import { CHECKLIST, bnDigits, t, type Lang } from '@/lib/i18n/family';

export function FamilyApproval({ token, view, error, expiresAt }: { token: string; view: FamilyViewData | null; error: string | null; expiresAt: number | null }) {
  const [lang, setLang] = useState<Lang>('bn');
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'approved' | 'rejected' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const num = (s: string) => (lang === 'bn' ? bnDigits(s) : s);
  const vars = { student: lang === 'bn' ? 'নুসরাত' : view?.student.split(' ')[0] ?? 'Nusrat' };

  async function decide(decision: 'approved' | 'rejected') {
    setState('busy');
    const r = await fetch('/api/family/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, decision }) });
    const j = (await r.json()) as { decision: string; reasons: string[] };
    if (r.ok) setState(decision);
    else {
      setState('error');
      setMsg(j.reasons?.[0] ?? 'Error');
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-30px)] max-w-md bg-slate-50 px-4 pb-10 pt-4" lang={lang}>
      <div className="flex items-center gap-2">
        <Image src="/logo.png" alt="Nexora" width={34} height={29} />
        <div className="text-xs font-semibold leading-tight text-slate-700">
          Semester Money Copilot
          <div className="font-medium text-brand-600">by Nexora</div>
        </div>
        <button onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700" aria-label="Switch language">
          <Languages className="h-4 w-4" /> {lang === 'bn' ? 'English' : 'বাংলা'}
        </button>
      </div>

      <div className="mt-3 rounded-xl bg-amber-100 px-3 py-1.5 text-center text-xs font-bold text-amber-900">{t('sandbox', lang)}</div>

      {!view || error ? (
        <div className="card mt-4 p-5 text-center">
          <OctagonX className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-2 text-lg font-bold">{t('invalid', lang)}</h1>
          <p className="mt-1 text-sm text-slate-600">{error}</p>
        </div>
      ) : (
        <>
          <h1 className="mt-5 text-xl font-bold text-slate-900">{t('title', lang)}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('asks', lang, vars)}</p>

          <section className="card mt-4 overflow-hidden">
            <div className="bg-brand-900 px-5 py-5 text-white">
              <div className="text-xs uppercase tracking-wide text-brand-100">{t('amount', lang)}</div>
              <div className="mt-1 text-4xl font-bold tabular-nums">{num(fmt(view.amountMinor, 'GBP'))}</div>
              {view.funding.source === 'acc_bdt' && <div className="mt-1 text-sm text-brand-100">≈ {num(fmt(view.funding.bdtPayMinor, 'BDT'))}</div>}
            </div>
            <dl className="divide-y divide-slate-100 px-5 text-sm">
              <div className="py-3">
                <dt className="text-xs text-slate-500">{t('paidTo', lang)}</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{view.payeeName}</dd>
                {view.verified && (
                  <dd className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" /> {t('verified', lang)}
                  </dd>
                )}
                <dd className="mt-1 text-xs text-slate-500">{num(`${view.sortCode ?? ''} · ${view.accountMasked}`)}</dd>
              </div>
              {view.dueDate && (
                <div className="flex justify-between py-3">
                  <dt className="text-slate-500">{t('dueDate', lang)}</dt>
                  <dd className="font-medium">{num(view.dueDate)}</dd>
                </div>
              )}
              {view.funding.source === 'acc_bdt' ? (
                <>
                  <div className="flex justify-between py-3">
                    <dt className="text-slate-500">{t('familyPays', lang)}</dt>
                    <dd className="font-medium tabular-nums">{num(fmt(view.funding.bdtPayMinor, 'BDT'))}</dd>
                  </div>
                  <div className="flex justify-between py-3">
                    <dt className="text-slate-500">{t('via', lang)}</dt>
                    <dd className="font-medium">{view.funding.providerName}</dd>
                  </div>
                  <div className="flex justify-between py-3">
                    <dt className="text-slate-500">{t('rate', lang)}</dt>
                    <dd className="font-medium tabular-nums">£1 = ৳{num(view.funding.offeredBdtPerGbp.toFixed(2))}</dd>
                  </div>
                  <div className="flex justify-between py-3">
                    <dt className="text-slate-500">{t('trueCost', lang)}</dt>
                    <dd className="font-medium tabular-nums">{num(fmt(view.funding.trueCostMinor, 'GBP'))}</dd>
                  </div>
                  <div className="flex justify-between rounded-lg py-3">
                    <dt className="text-emerald-700">{t('saving', lang)}</dt>
                    <dd className="font-bold tabular-nums text-emerald-700">{num(fmt(view.funding.savingVsBankMinor, 'GBP'))}</dd>
                  </div>
                </>
              ) : (
                <div className="py-3 text-slate-600">{t('fromGbp', lang)}</div>
              )}
            </dl>
          </section>

          <section className="card mt-3 p-4">
            <h2 className="text-sm font-bold text-slate-800">{t('whySafe', lang)}</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {(['safe1', 'safe2', 'safe3', 'safe4'] as const).map((k) => (
                <li key={k} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t(k, lang, vars)}
                </li>
              ))}
            </ul>
          </section>

          {state === 'approved' || state === 'rejected' ? (
            <div className={`mt-4 rounded-2xl p-5 text-center text-base font-bold ${state === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'}`}>
              {state === 'approved' ? t('approved', lang, vars) : t('rejected', lang)}
            </div>
          ) : state === 'error' ? (
            <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{msg}</div>
          ) : state === 'confirm' ? (
            <div className="card mt-4 p-4">
              <div className="text-center text-base font-semibold">{t('confirmApprove', lang, { amount: num(fmt(view.amountMinor, 'GBP')), payee: view.payeeName })}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn-ghost py-3 text-base" onClick={() => setState('idle')}>
                  <X className="h-5 w-5" />
                </button>
                <button className="btn bg-emerald-600 py-3 text-base text-white hover:bg-emerald-700" onClick={() => decide('approved')}>
                  <Check className="h-5 w-5" /> {t('approve', lang)}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="btn border-2 border-slate-300 bg-white py-4 text-base text-slate-700" disabled={state === 'busy'} onClick={() => decide('rejected')}>
                <X className="h-5 w-5" /> {t('reject', lang)}
              </button>
              <button className="btn bg-emerald-600 py-4 text-base text-white hover:bg-emerald-700" disabled={state === 'busy'} onClick={() => setState('confirm')}>
                {state === 'busy' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} {t('approve', lang)}
              </button>
            </div>
          )}
          {expiresAt && <p className="mt-3 text-center text-xs text-slate-500">{t('once', lang, { date: new Date(expiresAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
        </>
      )}

      <section className="card mt-5 overflow-hidden">
        <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-800" onClick={() => setShowList((v) => !v)}>
          <FileCheck2 className="h-4 w-4 text-brand-600" /> {t('checklistTitle', lang)}
          <ChevronDown className={`ml-auto h-4 w-4 transition ${showList ? 'rotate-180' : ''}`} />
        </button>
        {showList && (
          <div className="border-t border-slate-100 px-4 pb-4 pt-2">
            <p className="text-sm text-slate-600">{t('checklistIntro', lang)}</p>
            <ol className="mt-2 space-y-1.5">
              {CHECKLIST.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" aria-label={c[lang]} />
                  <span>{c[lang]}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('checklistNote', lang)}</p>
          </div>
        )}
      </section>
    </main>
  );
}
