/** Small helper used by every mock service to simulate async work. */
export const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const nowIso = () => new Date().toISOString();

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `mock-${Math.random().toString(36).slice(2, 10)}`;
