// VIP progression helpers (client side mirror of SQL vip_threshold).
// Cumulative EXP required to REACH a level.
//   L1 = 0, L2 = 100, L3 = 500, L4 = 2000, then *2.5 each step.

const BASE: Record<number, number> = { 1: 0, 2: 100, 3: 500, 4: 2000 };

export function vipThreshold(level: number): number {
  if (level <= 1) return 0;
  if (level <= 4) return BASE[level];
  let v = 2000;
  for (let i = 5; i <= level; i++) v = Math.floor((v * 25) / 10);
  return v;
}

export interface VipProgress {
  level: number;
  exp: number;
  curThreshold: number;   // exp at start of current level
  nextThreshold: number;  // exp needed to reach next level
  expIntoLevel: number;   // exp - curThreshold
  expForLevel: number;    // nextThreshold - curThreshold
  remaining: number;      // nextThreshold - exp
  percent: number;        // 0..100
}

export function computeVipProgress(exp: number, level?: number | null): VipProgress {
  let lvl = Math.max(1, level || 1);
  // Recompute level from exp in case server lags
  while (lvl < 50 && exp >= vipThreshold(lvl + 1)) lvl++;
  const cur = vipThreshold(lvl);
  const next = vipThreshold(lvl + 1);
  const expForLevel = Math.max(1, next - cur);
  const expIntoLevel = Math.max(0, exp - cur);
  const remaining = Math.max(0, next - exp);
  const percent = Math.min(100, Math.round((expIntoLevel / expForLevel) * 100));
  return { level: lvl, exp, curThreshold: cur, nextThreshold: next, expIntoLevel, expForLevel, remaining, percent };
}
