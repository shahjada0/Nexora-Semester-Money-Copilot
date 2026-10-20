import { setFixedNow } from '@/lib/clock';
import { resetDb } from '@/lib/db';

/** Pinned "today" for every test: 18 Oct 2026, 09:00 UTC. */
export const T0 = Date.parse('2026-10-18T09:00:00Z');

export function freshSandbox(): void {
  setFixedNow(T0);
  resetDb();
}
