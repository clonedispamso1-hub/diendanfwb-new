/**
 * Restriction Guard — cổng chặn hành động phía frontend.
 *
 * Mọi handler submit (đăng bài, bình luận, gửi tin nhắn, thả tim) PHẢI gọi
 * `ensureAllowed(kind)` TRƯỚC khi gọi API. Khi bị hạn chế:
 *   - Chặn ngay, không gửi request lên database.
 *   - Bật popup `ddx:restriction-blocked` + Toast kèm lý do và thời gian còn lại.
 *
 * Nếu trigger dưới database trả về lỗi `RESTRICTED:<kind>` (đường dẫn khác
 * chưa qua guard), UI gọi `handleRestrictionError(err)` để hiển thị thông báo
 * hạn chế thân thiện thay vì lỗi SQL thô.
 */
import { toast } from "sonner";
import { friendlyRestrictionMessage } from "@/lib/friendly-restrictions";
import type { RestrictionKind, RestrictionRow } from "@/services/restrictions.service";

function emitBlocked(restriction: RestrictionRow, kind: RestrictionKind) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("ddx:restriction-blocked", { detail: { restriction, kind } }),
    );
  } catch {
    /* noop */
  }
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    return String(anyErr.message ?? anyErr.error_description ?? anyErr.details ?? "");
  }
  return "";
}

function buildMessage(
  restriction: RestrictionRow,
  kind: RestrictionKind,
  formatRemaining: (v: string | null) => string,
): string {
  const effectiveKind = restriction.kind === "suspend" ? "suspend" : kind;
  const base = friendlyRestrictionMessage(`RESTRICTED:${effectiveKind}`);
  const reason = restriction.reason ? ` Lý do: ${restriction.reason}.` : "";
  const remaining = restriction.expires_at
    ? ` Còn lại: ${formatRemaining(restriction.expires_at)}.`
    : " Hạn chế vĩnh viễn.";
  return `${base}${reason}${remaining}`;
}

/**
 * Trả về `true` khi được phép thực hiện hành động.
 * Trả về `false` (kèm popup + toast) khi đang bị hạn chế.
 * Lỗi hạ tầng (mất mạng, bảng chưa tồn tại) → fail-open để không khoá oan.
 */
export async function ensureAllowed(kind: RestrictionKind): Promise<boolean> {
  try {
    const { canDo, formatRemaining } = await import("@/services/restrictions.service");
    const { ok, restriction } = await canDo(kind);
    if (ok || !restriction) return true;
    emitBlocked(restriction, kind);
    toast.error(buildMessage(restriction, kind, formatRemaining));
    return false;
  } catch (err) {
    if ((err as any)?.name === "RestrictionError") return false;
    console.warn("[restriction-guard] check failed, fail-open:", err);
    return true;
  }
}

/**
 * Xử lý lỗi từ backend/trigger. Trả về `true` nếu đây là lỗi hạn chế và đã
 * hiển thị thông báo cho người dùng (caller không cần toast thêm nữa).
 */
export async function handleRestrictionError(err: unknown): Promise<boolean> {
  if ((err as any)?.name === "RestrictionError") {
    // ensureAllowed/assertCan đã bật popup rồi.
    return true;
  }
  const msg = errorMessage(err);
  const match = msg.match(/RESTRICTED:([a-z_]+)/i);
  if (!match) return false;
  const kind = match[1].toLowerCase() as RestrictionKind;

  let restriction: RestrictionRow | null = null;
  let formatRemaining: (v: string | null) => string = () => "";
  try {
    const svc = await import("@/services/restrictions.service");
    formatRemaining = svc.formatRemaining;
    svc.invalidateRestrictionsCache();
    const rows = await svc.refreshMyRestrictions().catch(() => [] as RestrictionRow[]);
    restriction =
      rows.find((r) => r.kind === kind) ?? rows.find((r) => r.kind === "suspend") ?? null;
  } catch {
    /* noop */
  }

  if (restriction) {
    emitBlocked(restriction, kind);
    toast.error(buildMessage(restriction, kind, formatRemaining));
  } else {
    toast.error(friendlyRestrictionMessage(msg));
  }
  return true;
}

/** Tiện ích cho các handler chỉ cần 1 dòng. */
export const ensureCanPost = () => ensureAllowed("post");
export const ensureCanComment = () => ensureAllowed("comment");
export const ensureCanLike = () => ensureAllowed("like");
export const ensureCanMessage = () => ensureAllowed("message");
