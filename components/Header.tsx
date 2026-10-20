'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Cpu } from 'lucide-react';
import { ViewModeToggle, useExpert } from './ViewMode';

export function Header({ llm }: { llm?: { enabled: boolean; model: string | null } | null }) {
  const path = usePathname();
  const expert = useExpert();
  const nav = [
    { href: '/', label: 'Home' },
    { href: '/calendar', label: 'My plan' },
    { href: '/audit', label: expert ? 'Audit log' : 'Activity' },
  ];
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="Nexora logo" width={40} height={34} priority />
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">Semester Money Copilot</div>
            <div className="text-[11px] font-medium text-brand-600">by Nexora</div>
          </div>
        </Link>
        <nav className="ml-4 hidden gap-1 sm:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${path === n.href ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {expert && llm && (
            <span
              className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 md:inline-flex ${llm.enabled ? 'bg-brand-50 text-brand-700 ring-brand-100' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}
              title={llm.enabled ? 'LLM plans; the Permission Gate decides.' : 'No LLM API key: the rule-based planner runs every flow. Safety checks are identical.'}
            >
              {llm.enabled ? <Bot className="h-3.5 w-3.5" aria-hidden /> : <Cpu className="h-3.5 w-3.5" aria-hidden />}
              {llm.enabled ? `AI: ${llm.model}` : 'Offline planner'}
            </span>
          )}
          <ViewModeToggle />
        </div>
      </div>
      <nav className="flex gap-1 px-4 pb-2 sm:hidden">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium ${path === n.href ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
