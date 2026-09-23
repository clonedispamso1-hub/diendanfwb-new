/**
 * VIP Zalo Payment Card — marker dùng chung cho tin nhắn.
 *
 * Lệnh thanh toán do Admin tạo được nhúng vào `content` của message dưới dạng:
 *   [[vippay:<base64 của JSON payload>]]
 * nhờ vậy mọi đường gửi tin hiện có (user thật, nick ảo, admin) đều dùng được
 * mà không phải đổi schema DB.
 */

export interface VipPaymentPayload {
  /** Tên ngân hàng */
  bank: string;
  /** Số tài khoản */
  account: string;
  /** Tên người nhận */
  holder: string;
  /** Khu vực VIP Zalo */
  zone: string;
  /** Nội dung chuyển khoản */
  note: string;
  /** Số tiền (VND, dạng số nguyên chuỗi) */
  amount: string;
  /** Thời điểm hết hiệu lực (epoch ms) */
  expiresAt: number;
  /** Tổng thời gian hiệu lực (giây) */
  durationSec: number;
  /** Ảnh QR (URL) — không có = lệnh không QR */
  qrUrl?: string | null;
}

const RE = /\[\[vippay:([A-Za-z0-9+/=_-]+)\]\]/;

function encode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function decode(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function vipPaymentToken(payload: VipPaymentPayload): string {
  return `[[vippay:${encode(JSON.stringify(payload))}]]`;
}

export function parseVipPayment(content?: string | null): VipPaymentPayload | null {
  if (!content) return null;
  const m = RE.exec(content);
  if (!m) return null;
  try {
    const data = JSON.parse(decode(m[1])) as VipPaymentPayload;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export function hasVipPaymentToken(content?: string | null): boolean {
  return !!content && RE.test(content);
}

/** Gỡ mọi marker lệnh nạp khỏi nội dung do người dùng nhập/dán. */
export function stripVipPaymentTokens(content: string): string {
  return content.replace(new RegExp(RE.source, "g"), "").trim();
}

/** Số tiền dạng "500.000 ₫". */
export function formatVipAmount(amount: string | number): string {
  const n = Number(String(amount).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return String(amount ?? "");
  return `${n.toLocaleString("vi-VN")} ₫`;
}

/** Đếm ngược dạng mm:ss. */
export function formatCountdown(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
