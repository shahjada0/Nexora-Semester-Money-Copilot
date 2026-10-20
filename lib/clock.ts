/**
 * Injectable clock. The app uses real time; tests and the eval suite pin or advance it
 * so rolling limits and cooling-off timers can be tested without waiting.
 */
let offsetMs = 0;
let fixedMs: number | null = null;

export function now(): number {
  return fixedMs !== null ? fixedMs + offsetMs : Date.now() + offsetMs;
}

export function setFixedNow(ms: number | null): void {
  fixedMs = ms;
  offsetMs = 0;
}

export function advance(ms: number): void {
  offsetMs += ms;
}

export function isoNow(): string {
  return new Date(now()).toISOString();
}
