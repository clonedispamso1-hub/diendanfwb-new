/**
 * Coin Transfer Bill — marker cho tin nhắn hoá đơn chuyển Xu.
 *
 * Sau khi RPC `secure_transfer_gem` thành công, một tin nhắn được gửi vào
 * cuộc trò chuyện với `content` dạng:
 *   [[coinbill:<base64 của JSON payload>]]
 * → cả người gửi và người nhận đều thấy cùng một thẻ giao dịch.
 */

export interface CoinBillPayload {
  /** Mã giao dịch duy nhất hiển thị cho người dùng */
  code: string;
  /** id giao dịch trong DB (nếu có) */
  txId?: string | null;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string | null;
  /** Số xu đã chuyển */
  amount: number;
  /** Nội dung chuyển xu */
  note?: string | null;
  /** Thời điểm giao dịch (epoch ms) */
  at: number;
  status: "success";
}

const RE = /\[\[coinbill:([A-Za-z0-9+/=_-]+)\]\]/;

function encode(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function decode(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function coinBillToken(payload: CoinBillPayload): string {
  return `[[coinbill:${encode(JSON.stringify(payload))}]]`;
}

export function parseCoinBill(content?: string | null): CoinBillPayload | null {
  if (!content) return null;
  const m = RE.exec(content);
  if (!m) return null;
  try {
    const data = JSON.parse(decode(m[1]!)) as CoinBillPayload;
    if (!data || typeof data !== "object" || !data.code) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasCoinBillToken(content?: string | null): boolean {
  return !!content && RE.test(content);
}

/** Mã giao dịch duy nhất, ví dụ: TX-LM4K2P-7F3A9C */
export function generateTransactionCode(): string {
  const base = Date.now().toString(36).toUpperCase();
  let rand = "";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i += 1) buf[i] = Math.floor(Math.random() * 256);
  buf.forEach((b) => { rand += chars[b % chars.length]; });
  return `TX-${base}-${rand}`;
}

/** Định dạng thời gian giao dịch: 21:05 · 15/09/2026 */
export function formatBillTime(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Định dạng số xu: 3333 -> 3.333 */
function formatAmount(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? "");
  return n.toLocaleString("vi-VN");
}

/**
 * Văn bản thuần (người đọc được) của biên lai chuyển Xu.
 * Dùng cho hành động "Sao chép" — TUYỆT ĐỐI không chứa marker nội bộ.
 */
export function coinBillToPlainText(data: CoinBillPayload): string {
  const lines = [
    "Biên lai chuyển xu",
    `Người gửi: ${data.senderName ?? ""}`.trim(),
    `Người nhận: ${data.receiverName ?? ""}`.trim(),
    `Số tiền: ${formatAmount(data.amount)} Xu`,
  ];
  const time = formatBillTime(data.at);
  if (time) lines.push(`Thời gian: ${time}`);
  if (data.note && data.note.trim()) lines.push(`Nội dung: ${data.note.trim()}`);
  if (data.code) lines.push(`Mã GD: ${data.code}`);
  return lines.join("\n");
}

/**
 * Loại bỏ mọi marker [[coinbill:...]] khỏi nội dung do người dùng nhập/dán.
 * → Nội dung dán lại chỉ là văn bản thường, không bao giờ tạo giao dịch mới.
 * Văn bản/URL bình thường không bị ảnh hưởng.
 */
export function stripCoinBillTokens(content: string): string {
  return content.replace(/\[\[coinbill:[A-Za-z0-9+/=_-]+\]\]/g, "").trim();
}
