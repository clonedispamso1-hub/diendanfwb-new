/**
 * Dịch mọi thông điệp lỗi backend RESTRICTED:<kind>:<duration> sang tiếng Việt
 * thân thiện — người dùng KHÔNG BAO GIỜ nhìn thấy chuỗi RESTRICTED thô.
 */
export type RestrictKind =
  | "suspend" | "post" | "comment" | "like" | "message"
  | "find_zalo" | "avatar_change" | "bio_change" | "gift" | "nearby"
  | "verify_required" | "permanent_ban";

const KIND_MESSAGES: Record<string, string> = {
  post: "Bạn hiện không được phép đăng bài.",
  comment: "Bạn hiện không được phép bình luận.",
  message: "Bạn hiện không được phép gửi tin nhắn.",
  like: "Bạn hiện không được phép thả tim.",
  gift: "Bạn hiện không được phép tặng quà.",
  find_zalo: "Bạn hiện không được phép tìm Zalo.",
  nearby: "Bạn hiện không được phép dùng tính năng Quanh đây.",
  avatar_change: "Bạn hiện không được phép đổi ảnh đại diện.",
  bio_change: "Bạn hiện không được phép chỉnh sửa giới thiệu.",
  suspend: "Tài khoản của bạn đang bị tạm khoá.",
  permanent_ban: "Tài khoản của bạn đã bị khoá vĩnh viễn.",
  verify_required: "Tài khoản cần được Admin xác minh trước khi sử dụng.",
};

/** Nhận diện chuỗi lỗi backend dạng `RESTRICTED:<kind>[:<duration>]`. */
export function isRestrictionCode(msg: unknown): msg is string {
  return typeof msg === "string" && /^RESTRICTED:[a-z_]+/i.test(msg.trim());
}

/**
 * Trả về câu tiếng Việt tương ứng với 1 chuỗi RESTRICTED bất kỳ. Chuỗi không
 * khớp sẽ trả về fallback thân thiện thay vì lộ SQL/English raw.
 */
export function friendlyRestrictionMessage(input: unknown, fallback?: string): string {
  if (typeof input !== "string") return fallback ?? "Hành động này hiện không khả dụng.";
  const raw = input.trim();
  if (!raw) return fallback ?? "Hành động này hiện không khả dụng.";
  const m = raw.match(/^RESTRICTED:([a-z_]+)(?::([a-z0-9_]+))?/i);
  if (!m) return fallback ?? raw;
  const kind = m[1].toLowerCase();
  const duration = (m[2] || "").toLowerCase();
  const base = KIND_MESSAGES[kind] ?? "Hành động này hiện không khả dụng.";
  if (duration === "permanent" && kind !== "permanent_ban" && kind !== "suspend") {
    return `${base} (khoá vĩnh viễn)`;
  }
  return base;
}

/** Wrap 1 Error/message bất kỳ: nếu là RESTRICTED thì thay bằng câu thân thiện. */
export function toastFriendly(err: unknown, fallback = "Đã có lỗi xảy ra."): string {
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : (err as any)?.message || "";
  if (isRestrictionCode(msg)) return friendlyRestrictionMessage(msg);
  return msg || fallback;
}
