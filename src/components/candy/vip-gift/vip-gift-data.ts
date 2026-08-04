// Danh sách quà VIP. 1 GEM = 10 VNĐ.
// Effect: tên hiệu ứng dùng trong VipGiftEffect overlay.

export type GiftTier = "small" | "mid" | "vip" | "ultimate";
export type GiftEffect =
  | "rose"
  | "chocolate"
  | "bear"
  | "kiss"
  | "diamond"
  | "cake"
  | "butterfly"
  | "dolphin"
  | "unicorn"
  | "dragon"
  | "crown"
  | "ring"
  | "tiger"
  | "car"
  | "yacht"
  | "jet"
  | "castle"
  | "galaxy"
  | "whale";

export interface VipGift {
  id: string;
  name: string;
  emoji: string;
  gem: number;
  tier: GiftTier;
  effect: GiftEffect;
  /** Màu glow chủ đạo cho card & hiệu ứng */
  glow: string;
}

export const VIP_GIFTS: VipGift[] = [
  // Quà nhỏ
  { id: "rose", name: "Hoa hồng", emoji: "🌹", gem: 100, tier: "small", effect: "rose", glow: "#ff5d8f" },
  { id: "choco", name: "Chocolate", emoji: "🍫", gem: 200, tier: "small", effect: "chocolate", glow: "#b06a3b" },
  { id: "bear", name: "Gấu bông", emoji: "🧸", gem: 500, tier: "small", effect: "bear", glow: "#f5a96b" },
  { id: "kiss", name: "Nụ hôn", emoji: "💋", gem: 1_000, tier: "small", effect: "kiss", glow: "#ff3d7a" },
  { id: "diamond-s", name: "Kim cương nhỏ", emoji: "💎", gem: 2_000, tier: "small", effect: "diamond", glow: "#7ad7ff" },
  { id: "cake", name: "Bánh kem", emoji: "🎂", gem: 5_000, tier: "small", effect: "cake", glow: "#ffb3d1" },
  // Quà trung
  { id: "butterfly", name: "Cánh bướm neon", emoji: "🦋", gem: 10_000, tier: "mid", effect: "butterfly", glow: "#7df9ff" },
  { id: "dolphin", name: "Cá heo ánh sáng", emoji: "🐬", gem: 20_000, tier: "mid", effect: "dolphin", glow: "#5ec8ff" },
  { id: "unicorn", name: "Kỳ lân galaxy", emoji: "🦄", gem: 30_000, tier: "mid", effect: "unicorn", glow: "#c58bff" },
  { id: "dragon", name: "Rồng lửa mini", emoji: "🔥", gem: 50_000, tier: "mid", effect: "dragon", glow: "#ff6a2b" },
  { id: "crown", name: "Vương miện VIP", emoji: "👑", gem: 70_000, tier: "mid", effect: "crown", glow: "#ffd24a" },
  { id: "ring", name: "Nhẫn kim cương", emoji: "💍", gem: 100_000, tier: "mid", effect: "ring", glow: "#e8f4ff" },
  // Quà VIP
  { id: "tiger", name: "Hổ vàng hoàng gia", emoji: "🐅", gem: 120_000, tier: "vip", effect: "tiger", glow: "#ffb13c" },
  { id: "car", name: "Siêu xe neon", emoji: "🏎", gem: 150_000, tier: "vip", effect: "car", glow: "#ff2bd6" },
  { id: "yacht", name: "Du thuyền luxury", emoji: "🛥", gem: 180_000, tier: "vip", effect: "yacht", glow: "#5ad1ff" },
  { id: "jet", name: "Máy bay phản lực", emoji: "✈️", gem: 200_000, tier: "vip", effect: "jet", glow: "#aab4ff" },
  { id: "castle", name: "Lâu đài hoàng kim", emoji: "🏰", gem: 250_000, tier: "vip", effect: "castle", glow: "#ffcb57" },
  { id: "galaxy", name: "Thiên hà tình yêu", emoji: "🌌", gem: 280_000, tier: "vip", effect: "galaxy", glow: "#b072ff" },
  // Tối thượng
  { id: "whale", name: "Cá voi vũ trụ", emoji: "🐋", gem: 300_000, tier: "ultimate", effect: "whale", glow: "#7be5ff" },
];

export const TIER_LABEL: Record<GiftTier, string> = {
  small: "Quà nhỏ",
  mid: "Quà trung",
  vip: "Quà VIP",
  ultimate: "Tối thượng",
};

export const BROADCAST_THRESHOLD = 100_000;

export function gemToVnd(gem: number): string {
  const vnd = gem * 10;
  if (vnd >= 1_000_000) return `${(vnd / 1_000_000).toFixed(vnd % 1_000_000 === 0 ? 0 : 1)}M ₫`;
  if (vnd >= 1_000) return `${(vnd / 1_000).toFixed(0)}K ₫`;
  return `${vnd} ₫`;
}

export function formatGem(n: number): string {
  return n.toLocaleString("vi-VN");
}

// Sự kiện toàn cục
export interface BroadcastDetail {
  senderName: string;
  recipientName: string;
  gift: VipGift;
}
export const BROADCAST_EVENT = "vip-gift-broadcast";
// Supabase Realtime channel: phát thông báo quà VIP cho toàn bộ user online.
export const GLOBAL_GIFT_CHANNEL = "vip-gift-global";
export const GLOBAL_GIFT_EVENT = "gift";

