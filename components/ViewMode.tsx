'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Simple view (default): plain language for students and parents.
 * Expert view: tiers, hashes, audit numbers and every safety check, for judges and developers.
 */
type Mode = 'simple' | 'expert';
const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: 'simple', setMode: () => {} });

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('simple');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('viewMode');
      if (saved === 'expert' || saved === 'simple') setModeState(saved);
    } catch {
      /* storage unavailable: stay simple */
    }
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem('viewMode', m);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useViewMode = () => useContext(Ctx);
export const useExpert = () => useContext(Ctx).mode === 'expert';

export function ViewModeToggle() {
  const { mode, setMode } = useViewMode();
  return (
    <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm font-medium" role="group" aria-label="View mode">
      {(['simple', 'expert'] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`min-h-[36px] rounded-full px-3 transition-colors duration-200 ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {m === 'simple' ? 'Simple' : 'Expert'}
        </button>
      ))}
    </div>
  );
}

/** Content only shown in Expert view. */
export function ExpertOnly({ children }: { children: ReactNode }) {
  return useExpert() ? <>{children}</> : null;
}
