// Catalog quà tặng - hiển thị ⭐ nhưng backend dùng gem_balance.
export type GiftItem = {
  key: string;
  name: string;
  emoji: string;
  amount: number;   // gem
  gradient: string; // Tailwind gradient utility
  glow: string;     // shadow color
};

export const GIFT_CATALOG: GiftItem[] = [
  { key: "rose",   name: "Hoa Hồng", emoji: "🌹", amount: 1_000,
    gradient: "from-pink-400 to-rose-500",     glow: "rgba(244,63,94,0.5)" },
  { key: "bear",   name: "Gấu Bông", emoji: "🧸", amount: 10_000,
    gradient: "from-amber-300 to-orange-500",  glow: "rgba(249,115,22,0.5)" },
  { key: "ring",   name: "Nhẫn",     emoji: "💍", amount: 100_000,
    gradient: "from-cyan-300 to-sky-500",      glow: "rgba(56,189,248,0.55)" },
  { key: "car",    name: "Siêu Xe",  emoji: "🚗", amount: 200_000,
    gradient: "from-red-400 to-rose-600",      glow: "rgba(239,68,68,0.55)" },
  { key: "yacht",  name: "Yacht",    emoji: "🛥️", amount: 300_000,
    gradient: "from-teal-300 to-emerald-600",  glow: "rgba(16,185,129,0.55)" },
  { key: "castle", name: "Castle",   emoji: "🏰", amount: 400_000,
    gradient: "from-violet-400 to-purple-600", glow: "rgba(139,92,246,0.55)" },
  { key: "crown",  name: "Crown",    emoji: "👑", amount: 500_000,
    gradient: "from-yellow-300 to-amber-500",  glow: "rgba(245,158,11,0.6)" },
];

export function getGiftByKey(key: string | null | undefined): GiftItem | null {
  if (!key) return null;
  return GIFT_CATALOG.find((g) => g.key === key) ?? null;
}
