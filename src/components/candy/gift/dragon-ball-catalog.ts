import type { BallTier } from "./dragon-ball-icon";

export interface DragonBallItem {
  tier: BallTier;
  name: string;
  amount: number;
}

/** Bảng giá cố định — đồng bộ với RPC gift_dragon_ball_to_post. */
export const DRAGON_BALL_CATALOG: DragonBallItem[] = [
  { tier: 1, name: "Ngọc Rồng 1 Sao", amount: 5_000 },
  { tier: 2, name: "Ngọc Rồng 2 Sao", amount: 10_000 },
  { tier: 3, name: "Ngọc Rồng 3 Sao", amount: 30_000 },
  { tier: 4, name: "Ngọc Rồng 4 Sao", amount: 80_000 },
  { tier: 5, name: "Ngọc Rồng 5 Sao", amount: 100_000 },
  { tier: 6, name: "Ngọc Rồng 6 Sao", amount: 200_000 },
  { tier: 7, name: "Ngọc Rồng 7 Sao", amount: 500_000 },
];

export function getBallByTier(tier: number | null | undefined): DragonBallItem | null {
  if (!tier) return null;
  return DRAGON_BALL_CATALOG.find((b) => b.tier === tier) ?? null;
}
