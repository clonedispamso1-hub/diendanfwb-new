// 63 tỉnh/thành Việt Nam — dùng cho dropdown chọn khu vực.
export const VN_PROVINCES: readonly string[] = [
  "An Giang", "Bà Rịa - Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn",
  "Bắc Ninh", "Bến Tre", "Bình Dương", "Bình Định", "Bình Phước",
  "Bình Thuận", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng",
  "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp",
  "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh",
  "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên",
  "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lạng Sơn",
  "Lào Cai", "Lâm Đồng", "Long An", "Nam Định", "Nghệ An",
  "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình",
  "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng",
  "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa",
  "Thừa Thiên Huế", "Tiền Giang", "TP. Hồ Chí Minh", "Trà Vinh", "Tuyên Quang",
  "Vĩnh Long", "Vĩnh Phúc", "Yên Bái",
] as const;

export type Intent = "fwb" | "ons" | "serious" | "love";

// 3 nhãn nhu cầu cố định.
export const INTENT_LABELS: Record<Intent, string> = {
  fwb: "Tìm FWB kín đáo",
  ons: "Tìm ONS",
  serious: "Tìm người yêu nghiêm túc",
  love: "Tìm người yêu nghiêm túc",
};


/** 3 lựa chọn nhu cầu — DUY NHẤT, không thể đổi sau khi hoàn tất. */
export const INTENT_OPTIONS: Array<{ value: Intent; label: string; emoji: string; description: string }> = [
  { value: "fwb",     label: "Tìm FWB kín đáo",        emoji: "🎯", description: "Kết nối kín đáo, tôn trọng & an toàn." },
  { value: "ons",     label: "Tìm ONS",                 emoji: "⚡", description: "Gặp gỡ nhanh — thẳng thắn, rõ ràng." },
  { value: "serious", label: "Tìm người yêu nghiêm túc", emoji: "🌹", description: "Mối quan hệ dài lâu, chân thành." },
];

/** Trả về nhãn rút gọn (giá trị legacy `love`/`dating` map → `serious`). */
export function getIntentDisplay(intent: string | null | undefined): { label: string; emoji: string; color: string } {
  if (intent === "fwb") return { label: "Tìm FWB kín đáo", emoji: "🎯", color: "#c026d3" };
  if (intent === "ons") return { label: "Tìm ONS", emoji: "⚡", color: "#e11d48" };
  if (intent === "serious" || intent === "love" || intent === "dating")
    return { label: "Tìm người yêu nghiêm túc", emoji: "🌹", color: "#ec4899" };
  return { label: "Chưa chọn", emoji: "✨", color: "#94a3b8" };
}


/** Khoá 24h: kiểm tra còn hiệu lực không. */
export function isIntentLocked(lockedUntil: string | null | undefined): boolean {
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > Date.now();
}

export function getIntentLockRemainingMs(lockedUntil: string | null | undefined): number {
  if (!lockedUntil) return 0;
  return Math.max(0, new Date(lockedUntil).getTime() - Date.now());
}

export function formatIntentLockRemaining(ms: number): string {
  if (ms <= 0) return "0 giờ";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút`;
}

/** Cooldown: 60 ngày sau lần đổi khu vực đầu tiên, trừ khi VIP >= 5. */
export const LOCATION_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
export const LOCATION_VIP_BYPASS_LEVEL = 5;

export interface LocationCooldownStatus {
  blocked: boolean;
  remainingMs: number;
  unlocksAt: Date | null;
  reason: "ok" | "needs_vip5" | "first_change_free";
}

export function getLocationCooldownStatus(
  changeCount: number | null | undefined,
  lastChangedAt: string | null | undefined,
  vipLevel: number | null | undefined,
): LocationCooldownStatus {
  const count = changeCount ?? 0;
  const vip = vipLevel ?? 1;
  if (count < 1) {
    return { blocked: false, remainingMs: 0, unlocksAt: null, reason: "first_change_free" };
  }
  if (vip >= LOCATION_VIP_BYPASS_LEVEL) {
    return { blocked: false, remainingMs: 0, unlocksAt: null, reason: "ok" };
  }
  const last = lastChangedAt ? new Date(lastChangedAt).getTime() : 0;
  const elapsed = Date.now() - last;
  if (elapsed >= LOCATION_COOLDOWN_MS) {
    return { blocked: false, remainingMs: 0, unlocksAt: null, reason: "ok" };
  }
  const remainingMs = LOCATION_COOLDOWN_MS - elapsed;
  return {
    blocked: true,
    remainingMs,
    unlocksAt: new Date(last + LOCATION_COOLDOWN_MS),
    reason: "needs_vip5",
  };
}

export function formatCooldownRemaining(ms: number): string {
  if (ms <= 0) return "0 ngày";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `${days} ngày ${hours} giờ`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours} giờ ${minutes} phút`;
}
