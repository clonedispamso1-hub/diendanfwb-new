/**
 * Trích xuất số Gem an toàn từ input bất kỳ.
 * Loại bỏ ký tự không phải số; trả về số nguyên dương hoặc 0.
 * LUÔN dùng trước khi truyền amount lên RPC.
 */
export function safeGemAmount(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }
  if (typeof raw === "bigint") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^\d]/g, "");
    if (!cleaned) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}
