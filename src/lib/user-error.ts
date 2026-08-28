import { CONTENT_BLOCKED_MESSAGE, MODERATION_MESSAGE } from "./keyword-filter";
import { friendlyRestrictionMessage, isRestrictionCode } from "./friendly-restrictions";


/**
 * Chuẩn hoá lỗi trước khi hiển thị cho người dùng.
 *
 * - Thông báo kiểm duyệt (từ cấm) được giữ nguyên 100%.
 * - Mọi lỗi kỹ thuật (PostgreSQL / PostgREST / RLS / constraint...) bị thay
 *   bằng thông báo thân thiện — KHÔNG BAO GIỜ hiện SQL Error ra giao diện.
 */

const SQL_PATTERNS = [
  /null value in column/i,
  /violates .*constraint/i,
  /duplicate key value/i,
  /relation ".*" does not exist/i,
  /column ".*" does not exist/i,
  /permission denied/i,
  /row-level security/i,
  /invalid input syntax/i,
  /function .*\(.*\) does not exist/i,
  /PGRST\d+/i,
  /syntax error at or near/i,
  /^\s*\{.*\}\s*$/,
  /supabase/i,
];

export function isSqlLikeError(message?: string | null): boolean {
  if (!message) return false;
  return SQL_PATTERNS.some((re) => re.test(message));
}

export function toUserMessage(err: unknown, fallback = "Có lỗi xảy ra, vui lòng thử lại."): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as any).message || "")
        : "";
  if (raw === MODERATION_MESSAGE || raw === CONTENT_BLOCKED_MESSAGE) return raw;
  // Trigger dưới database trả về "RESTRICTED:<kind>[:<duration>]" → dịch thân thiện.
  const restrictMatch = raw.match(/RESTRICTED:[a-z_]+(?::[a-z0-9_]+)?/i);
  if (restrictMatch || isRestrictionCode(raw)) {
    return friendlyRestrictionMessage(restrictMatch ? restrictMatch[0] : raw);
  }
  if (!raw || isSqlLikeError(raw)) return fallback;
  return raw;

}
