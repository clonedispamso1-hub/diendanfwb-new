/** All regional transition phases are timed locally; no network dependencies. */
export const SEVER_PHASE_DURATION_MS = 10_000;

export function getSeverTiming(elapsed: number) {
  const bounded = Math.max(0, Math.min(SEVER_PHASE_DURATION_MS, elapsed));
  return {
    progress: 1 + Math.floor((bounded / SEVER_PHASE_DURATION_MS) * 99),
    remaining: Math.ceil((SEVER_PHASE_DURATION_MS - bounded) / 1000),
  };
}