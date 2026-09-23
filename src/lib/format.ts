/* ============================================================
   Number formatting helpers — dùng chung toàn site.
   - formatNumber:  1000 → "1,000", 1000000 → "1,000,000"
   - parseDigits:   "1,000" → 1000 (an toàn cho input)
   - formatCompact: 1200 → "1.2K", 25_000_000 → "25M"
   ============================================================ */
export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const v = typeof n === "number" ? n : Number(String(n).replace(/[^\d-]/g, ""));
  if (!Number.isFinite(v)) return "0";
  return Math.trunc(v).toLocaleString("en-US");
}

export function parseDigits(s: string): number {
  if (!s) return 0;
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const v = Number(digits);
  return Number.isFinite(v) ? v : 0;
}

export function formatCompact(n: number): string {
  const v = Math.max(0, Math.floor(n || 0));
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}

/**
 * SHORTFORM XU — dùng cho Floating HUD + Ví tiền.
 *  < 1.000        → giữ nguyên (500)
 *  ≥ 1.000        → K  (10.000 → 10K, 250.000 → 250K)
 *  ≥ 1.000.000    → M  (5.500.000 → 5.5M)
 *  ≥ 1.000.000.000→ B  (1B)
 */
export function formatCoinShort(n: number | string | null | undefined): string {
  const raw = typeof n === "number" ? n : Number(String(n ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(raw)) return "0";
  const neg = raw < 0;
  const v = Math.abs(raw);
  const trim = (x: number, unit: string) => `${x.toFixed(1).replace(/\.0$/, "")}${unit}`;
  let out: string;
  if (v >= 1_000_000_000) out = trim(v / 1_000_000_000, "B");
  else if (v >= 1_000_000) out = trim(v / 1_000_000, "M");
  else if (v >= 1_000) out = trim(v / 1_000, "K");
  else out = String(Math.round(v * 100) / 100);
  return neg ? `-${out}` : out;
}

/** 1000 → 1K, 100000 → 100K, 1.2M, 3.4B, ... */
export function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(n || 0));
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}

/** Tạo cặp (views, likes) ảo cố định theo videoId, kích hoạt sau 30 phút. */
export function fakeVideoStats(videoId: string, createdAt: string | null | undefined): { views: number; likes: number; active: boolean } {
  const created = new Date(createdAt ?? Date.now()).getTime();
  const ageMin = (Date.now() - (Number.isNaN(created) ? Date.now() : created)) / 60000;
  if (ageMin < 30) return { views: 0, likes: 0, active: false };
  // Hash xác định seeded từ videoId
  let h = 2166136261 >>> 0;
  for (let i = 0; i < videoId.length; i++) {
    h ^= videoId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const r1 = ((h % 100000) / 100000); // 0..1
  const r2 = (((h >>> 7) % 100000) / 100000);
  // views: log-uniform 100..1e11
  const exp = 2 + r1 * 9; // 2..11
  const views = Math.min(99_999_999_999, Math.max(100, Math.floor(Math.pow(10, exp))));
  // likes ratio 0.5%..2% → tỉ lệ phù hợp views
  const ratio = 0.005 + r2 * 0.015;
  const likes = Math.min(99_999_999, Math.max(2, Math.floor(views * ratio)));
  return { views, likes, active: true };
}

export function formatCandy(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  // Hiển thị nhất quán dùng dấu phẩy ngăn cách hàng nghìn (yêu cầu UX toàn site).
  return Math.trunc(n).toLocaleString("en-US");
}

export const VN_PROVINCES = [
  "An Giang", "Bà Rịa - Vũng Tàu", "Bắc Giang", "Bắc Kạn", "Bạc Liêu",
  "Bắc Ninh", "Bến Tre", "Bình Định", "Bình Dương", "Bình Phước",
  "Bình Thuận", "Cà Mau", "Cần Thơ", "Cao Bằng", "Đà Nẵng",
  "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp",
  "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh",
  "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên",
  "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng",
  "Lạng Sơn", "Lào Cai", "Long An", "Nam Định", "Nghệ An",
  "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình",
  "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng",
  "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa",
  "Thừa Thiên Huế", "Tiền Giang", "TP Hồ Chí Minh", "Trà Vinh", "Tuyên Quang",
  "Vĩnh Long", "Vĩnh Phúc", "Yên Bái",
  "Nước ngoài"
];

/**
 * Quy định màu chữ VIP:
 *   VIP 1        → Vàng (#facc15)
 *   VIP 2 → 20   → Đỏ  (#ef4444)
 */
export function getVipColor(level: number): string {
  const safe = Math.max(1, level || 1);
  if (safe === 1) return "#facc15"; // amber-400
  return "#ef4444"; // red-500
}

export function getVipLabel(level: number): string {
  return `VIP ${Math.max(1, level || 1)}`;
}
