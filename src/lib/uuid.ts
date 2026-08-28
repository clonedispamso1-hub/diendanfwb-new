/**
 * Helper UUID dùng chung.
 *
 * Cột `id` của Postgres là kiểu UUID. Nếu ghép chuỗi tìm kiếm bất kỳ vào
 * `id.eq.${term}` thì Postgres báo lỗi: `operator does not exist: uuid = text`.
 * Luôn kiểm tra bằng `isUuid()` TRƯỚC khi so sánh với cột uuid.
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v.trim());

/** Trả về uuid hợp lệ hoặc null. */
export const asUuid = (v: unknown): string | null =>
  isUuid(v) ? (v as string).trim() : null;

/** UUID "không bao giờ khớp" — dùng khi cần giữ nguyên hình dạng query. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
