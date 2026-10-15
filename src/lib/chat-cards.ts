/**
 * Thẻ tin nhắn "Sao chép" và "QR" do Admin (tài khoản thứ hai) gửi.
 * Nhúng vào `content` của message (không đổi schema):
 *   [[copytext:<base64 JSON>]]  → { text }
 *   [[qrpay:<base64 JSON>]]     → { qrUrl, minutes, notes }
 * Thời hạn QR = created_at của message (do DB gán) + minutes.
 */
export interface CopyTextLine { text: string; copyEnabled: boolean; label?: string; kind?: "field" | "note" }
export interface CopyTextPayload { text: string; lines?: CopyTextLine[]; title?: string }
export interface QrPayPayload { qrUrl: string; minutes: number; notes: string[]; title?: string; bankName?: string; accountNumber?: string; accountName?: string; transferContent?: string }

const COPY_RE = /\[\[copytext:([A-Za-z0-9+/=_-]+)\]\]/;
const QR_RE = /\[\[qrpay:([\s\S]*?)\]\]/i;
export const hasQrPayToken = (content?: string | null): boolean => /\[\[qrpay:/i.test(content ?? "");
/** Strip even malformed/truncated tokens before any plain-text fallback. */
export const stripQrPayTokens = (content?: string | null): string =>
  (content ?? "").replace(/\[\[qrpay:[\s\S]*?(?:\]\]|$)/gi, "");

function enc(v: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function dec<T>(b64: string): T | null {
  try {
    const normalized = b64.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch { return null; }
}

/** Legacy text-only tokens remain valid; lines add presentation settings only. */
export const copyTextToken = (text: string, lines?: CopyTextLine[], title?: string) =>
  `[[copytext:${enc({ text, ...(lines ? { lines } : {}), ...(title ? { title } : {}) })}]]`;
export function copyTextLines(data: CopyTextPayload): CopyTextLine[] {
  if (Array.isArray(data.lines) && data.lines.length > 0 && data.lines.every((line) => line && typeof line.text === "string") && data.lines.some((line) => typeof line.label === "string" || line.kind === "field" || line.kind === "note")) {
    return data.lines.map((line) => ({
      text: line.text,
      label: typeof line.label === "string" ? line.label : "",
      kind: line.kind === "note" ? "note" : "field",
      copyEnabled: line.copyEnabled !== false,
    }));
  }
  const textLines = data.text.split(/\r?\n/);
  return textLines.map((text, index) => ({
    text,
    copyEnabled: typeof data.lines?.[index]?.copyEnabled === "boolean"
      ? data.lines[index].copyEnabled : true,
  }));
}
export function parseCopyText(content?: string | null): CopyTextPayload | null {
  const m = content ? COPY_RE.exec(content) : null;
  const d = m ? dec<CopyTextPayload>(m[1]) : null;
  return d && typeof d.text === "string" && d.text ? d : null;
}

export function qrPayToken(p: QrPayPayload): string {
  const minutes = Number.isFinite(p.minutes) && p.minutes > 0 ? Math.round(p.minutes * 100) / 100 : 0;
  const title = p.title?.trim();
  return `[[qrpay:${enc({ ...p, qrUrl: p.qrUrl, minutes, notes: p.notes.map((n) => n.trim()).filter(Boolean), ...(title ? { title } : { title: undefined }) })}]]`;
}
export function parseQrPay(content?: string | null): QrPayPayload | null {
  const m = content ? QR_RE.exec(content) : null;
  const d = m?.[1] ? dec<Record<string, unknown>>(m[1]) : null;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const string = (...values: unknown[]) => values.find((v): v is string => typeof v === "string" && !!v.trim())?.trim();
  const qrUrl = string(d.qrUrl, d.qr_url, d.qrImageUrl, d.imageUrl, d.image_url, d.url);
  if (!qrUrl || !/^(?:https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp);base64,)/i.test(qrUrl)) return null;
  const bank = d.bank && typeof d.bank === "object" ? d.bank as Record<string, unknown> : {};
  const notes = Array.isArray(d.notes) ? d.notes : [d.notes ?? d.note];
  const minutes = Number(d.minutes);
  return {
    qrUrl, minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
    notes: notes.filter((n): n is string => typeof n === "string" && !!n.trim()).map((n) => n.trim()),
    title: string(d.title), bankName: string(d.bankName, d.bank_name, bank.name, typeof d.bank === "string" ? d.bank : null),
    accountNumber: string(d.accountNumber, d.account_number, bank.accountNumber, bank.account_number),
    accountName: string(d.accountName, d.account_name, bank.accountName, bank.account_name),
    transferContent: string(d.transferContent, d.transfer_content, bank.transferContent),
  };
}

export const hasChatCardToken = (c?: string | null) => !!c && (COPY_RE.test(c) || hasQrPayToken(c));

/** Hạn dùng (epoch ms) dựa trên created_at do DB lưu; null = không giới hạn. */
export function qrExpiresAt(p: QrPayPayload, createdAt?: string | null): number | null {
  if (!p.minutes) return null;
  const t = createdAt ? Date.parse(createdAt) : NaN;
  // Không có thời điểm từ DB → coi như đã hết hạn để an toàn.
  if (!Number.isFinite(t)) return 0;
  return t + p.minutes * 60_000;
}

export const DEFAULT_QR_NOTES = [
  "Lưu ý: Chuyển tiền theo mã QR, chỉ cần quét mã QR là được.",
  "Lưu ý: KHÔNG ĐƯỢC CHUYỂN KHI HẾT THỜI GIAN QUY ĐỊNH.",
];

/** Lệch đồng hồ giữa máy user và server (lấy từ header Date của server). */
let offsetPromise: Promise<number> | null = null;
export function serverClockOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = (async () => {
      try {
        const t0 = Date.now();
        const res = await fetch(`/?_t=${t0}`, { method: "HEAD", cache: "no-store" });
        const d = Date.parse(res.headers.get("date") || "");
        if (!Number.isFinite(d)) return 0;
        return d + 500 - (t0 + Date.now()) / 2;
      } catch { return 0; }
    })();
  }
  return offsetPromise;
}
