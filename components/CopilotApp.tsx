'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Send, ClipboardPaste, X, FileText, Sparkles, Loader2, MessageSquare, LayoutDashboard } from 'lucide-react';
import type { Card } from '@/lib/cards';
import type { Dashboard as DashboardData } from '@/lib/dashboard';
import { Header } from './Header';
import { Dashboard } from './Dashboard';
import { DemoPanel } from './DemoPanel';
import { CardView } from './cards/CardView';
import type { ConfirmResult } from './cards/ProposalView';
import { DecisionPill, TierBadge } from './ui';
import { useExpert } from './ViewMode';

export interface Msg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  cards?: Card[];
  steps?: { tool: string; tier: number; decision: string; auditSeq: number }[];
  notice?: string | null;
  mode?: 'llm' | 'scripted';
  attachment?: string;
}

type Suggestion = { label: string; send?: string; prefill?: string; upload?: boolean };
const SUGGESTIONS: Suggestion[] = [
  { label: 'Pay my tuition', upload: true },
  { label: 'Cheapest way to send money', send: 'What is the cheapest way to send £6,300 from home?' },
  { label: 'Money I need this month', send: 'How much money do I need this month?' },
  { label: 'How long will my money last?', send: 'How many months will my money last?' },
  { label: 'Is this message a scam?', prefill: 'Is this a scam? "' },
  { label: 'Plan my semester', send: 'Plan my semester' },
];

const uid = () => Math.random().toString(36).slice(2);

const WELCOME: Msg = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi Nusrat! I can help you pay tuition safely, find the cheapest way to get money from home, see how long your money will last, and spot scams. Nothing is ever paid without your OK.',
};

export function CopilotApp({ demo }: { demo: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<'chat' | 'dash'>('chat');
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSend = useRef(false);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/dashboard', { cache: 'no-store' });
    if (r.ok) setDash(await r.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    // In scripted capture mode (?run=…) keep the page still so screenshots show the whole flow.
    if (new URLSearchParams(window.location.search).has('run')) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const push = useCallback((m: Msg) => setMessages((prev) => [...prev, m]), []);

  const send = useCallback(
    async (text: string, documentId?: string | null, attachmentName?: string) => {
      const msg = text.trim();
      if (!msg || busy) return;
      const docId = documentId ?? attachment?.id ?? null;
      const docName = attachmentName ?? attachment?.name;
      push({ id: uid(), role: 'user', text: msg, attachment: docId ? docName : undefined });
      setInput('');
      setAttachment(null);
      setBusy(true);
      try {
        const history = messages.filter((m) => m.role !== 'system' && m.id !== 'welcome').map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text })).slice(-8);
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: msg, documentId: docId, history }) });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error ?? 'Request failed');
        push({ id: uid(), role: 'assistant', text: r.text, cards: r.cards, steps: r.steps, notice: r.notice, mode: r.mode });
      } catch (e) {
        push({ id: uid(), role: 'system', text: `Something went wrong: ${(e as Error).message}` });
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [attachment, busy, messages, push, refresh],
  );

  const onConfirmResult = useCallback(
    (r: ConfirmResult) => {
      if (r.cards.length) push({ id: uid(), role: 'assistant', text: r.decision === 'allowed' ? 'Done. Receipt below.' : '', cards: r.cards });
      refresh();
    },
    [push, refresh],
  );

  async function uploadFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (j.documentId) {
      if (autoSend.current) {
        autoSend.current = false;
        send('Please pay my tuition invoice', j.documentId, j.filename);
      } else setAttachment({ id: j.documentId, name: j.filename });
    } else push({ id: uid(), role: 'system', text: `Upload failed: ${j.error}` });
  }

  async function uploadPasted() {
    if (!pasteText.trim()) return;
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: pasteText, filename: 'pasted-invoice.txt' }) });
    const j = await r.json();
    if (j.documentId) setAttachment({ id: j.documentId, name: j.filename });
    setPasteOpen(false);
    setPasteText('');
  }

  return (
    <div className="flex min-h-[calc(100vh-30px)] flex-col">
      <Header llm={dash?.llm ?? null} />

      <div className="border-b border-slate-200 bg-white px-4 py-1.5 lg:hidden">
        <div className="mx-auto flex max-w-md rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button className={`flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === 'chat' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => setTab('chat')}>
            <MessageSquare className="h-4 w-4" aria-hidden /> Chat
          </button>
          <button className={`flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-lg py-2 ${tab === 'dash' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => setTab('dash')}>
            <LayoutDashboard className="h-4 w-4" aria-hidden /> My money
          </button>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`flex min-h-0 flex-col ${tab === 'chat' ? '' : 'hidden lg:flex'}`}>
          <div className="flex-1 space-y-4 pb-4">
            {messages.map((m) => (
              <MessageView key={m.id} m={m} onResult={onConfirmResult} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Thinking… safety checks are on
              </div>
            )}
            {!busy && (
              <div className="flex flex-wrap gap-2 pt-1 sm:pl-9" aria-label="Quick actions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    className="min-h-[44px] rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors duration-200 hover:border-brand-200 hover:text-brand-700"
                    onClick={() => {
                      if (s.upload) {
                        autoSend.current = true;
                        fileRef.current?.click();
                      } else if (s.prefill) {
                        setInput(s.prefill);
                        inputRef.current?.focus();
                      } else if (s.send) send(s.send);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-1 pt-3">
            {attachment && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-2 py-1 text-xs text-brand-800">
                <FileText className="h-3.5 w-3.5" /> {attachment.name}
                <button aria-label="Remove attachment" onClick={() => setAttachment(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {pasteOpen && (
              <div className="card mb-2 p-3">
                <div className="label mb-1">Paste invoice text</div>
                <textarea className="input h-32 font-mono text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the full invoice text here…" />
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" onClick={uploadPasted}>Attach</button>
                  <button className="btn-ghost" onClick={() => setPasteOpen(false)}>Close</button>
                </div>
              </div>
            )}
            <form
              className="card flex items-end gap-2 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input || (attachment ? 'Please pay this invoice' : ''));
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ""; }} />
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Upload invoice (PDF or text)" aria-label="Upload invoice" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-5 w-5" />
              </button>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Paste invoice text" aria-label="Paste invoice text" onClick={() => setPasteOpen((v) => !v)}>
                <ClipboardPaste className="h-5 w-5" />
              </button>
              <textarea
                ref={inputRef}
                aria-label="Message"
                className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
                rows={1}
                placeholder={attachment ? 'What should I do with this file?' : 'Ask me anything about your money…'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input || (attachment ? 'Please pay this invoice' : ''));
                  }
                }}
              />
              <button type="submit" className="btn-primary px-3" disabled={busy || (!input.trim() && !attachment)} aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>

        <aside className={`${tab === 'dash' ? '' : 'hidden lg:block'} lg:sticky lg:top-10 lg:max-h-[calc(100vh-56px)] lg:self-start lg:overflow-y-auto`}>
          <Dashboard data={dash} />
        </aside>
      </main>

      {demo && <DemoPanel send={send} push={push} refresh={refresh} reset={() => setMessages([WELCOME])} />}
    </div>
  );
}

/** Minimal, safe inline formatting for model text: **bold** only (rendered as React nodes, never HTML). */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part.replace(/^#{1,6}\s+/gm, ''),
  );
}

function MessageView({ m, onResult }: { m: Msg; onResult: (r: ConfirmResult) => void }) {
  const expert = useExpert();
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-base text-white shadow-sm">
          {m.attachment && (
            <div className="mb-1 flex items-center gap-1 text-xs text-brand-100"><FileText className="h-3.5 w-3.5" /> {m.attachment}</div>
          )}
          <div className="whitespace-pre-wrap text-base">{m.text}</div>
        </div>
      </div>
    );
  }
  if (m.role === 'system') {
    return <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs text-slate-500">{m.text}</div>;
  }
  return (
    <div className="space-y-2">
      {m.text && (
        <div className="flex gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Sparkles className="h-4 w-4" /></div>
          <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-white px-4 py-3 text-base text-slate-800 shadow-sm ring-1 ring-slate-200">
            <div className="whitespace-pre-wrap">{renderInline(m.text)}</div>
            {expert && m.steps && m.steps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                {m.steps.map((s, i) => (
                  <a key={i} href={`/audit#seq-${s.auditSeq}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 hover:ring-brand-200" title="Agent action — open in audit log">
                    <span className="font-mono">{s.tool}</span>
                    <TierBadge tier={s.tier} compact />
                    <DecisionPill decision={s.decision} />
                  </a>
                ))}
                <span className="text-[10px] text-slate-400">{m.mode === 'llm' ? 'planned by AI' : 'planned by offline planner'} · decided by the gate</span>
              </div>
            )}
            {m.notice && <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{expert ? m.notice : /quota/.test(m.notice) ? 'The AI has reached today’s free limit, so our simple assistant answered. The safety checks are the same.' : 'The AI is busy right now, so our simple assistant answered. The safety checks are the same.'}</div>}
          </div>
        </div>
      )}
      {m.cards?.map((c, i) => (
        <div key={i} className="sm:pl-9">
          <CardView card={c} onResult={onResult} />
        </div>
      ))}
    </div>
  );
}
