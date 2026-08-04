/**
 * Chuẩn hoá lỗi cho toàn bộ website: giấu chi tiết kỹ thuật khỏi người dùng,
 * log đầy đủ vào console cho developer. Chỉ trả về thông báo tiếng Việt
 * thân thiện.
 */

const TECHNICAL_MARKERS = [
  "sqlstate",
  "postgres",
  "postgrest",
  "supabase",
  "jwt",
  "rpc",
  "duplicate key",
  "constraint",
  "violates",
  "database error",
  "authretryable",
  "networkerror",
  "fetch failed",
  "unexpected token",
  "trigger",
  "policy",
  "row-level security",
  "column ",
  "relation ",
  "schema ",
  "syntax error",
  "null value",
  "unique",
];

function looksTechnical(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower) return true;
  if (lower === "{}" || lower === "[object object]") return true;
  return TECHNICAL_MARKERS.some((m) => lower.includes(m));
}

/** Lỗi tiếng Anh phổ biến (Supabase Auth…) → thông báo tiếng Việt. */
const EN_TO_VI: Array<[RegExp, string]> = [
  [/user already registered|already been registered|email address already/i,
    "Số điện thoại này đã được đăng ký."],
  [/invalid login credentials/i, "Số điện thoại hoặc mật khẩu không đúng."],
  [/password should be at least/i, "Mật khẩu phải có ít nhất 6 ký tự."],
  [/email not confirmed/i, "Tài khoản chưa được xác nhận."],
  [/user not found/i, "Không tìm thấy tài khoản."],
  [/rate limit|too many requests/i, "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút."],
  [/network|failed to fetch/i, "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet."],
  [/upload failed/i, "Tải tệp lên không thành công. Vui lòng thử lại."],
];

/** Chuỗi không có dấu tiếng Việt và toàn ASCII → coi như tiếng Anh. */
function looksEnglish(text: string): boolean {
  if (/[ăâđêôơưàáảãạằắẳẵặèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵÀ-Ỹ]/i.test(text)) return false;
  return /[a-z]{3,}/i.test(text);
}


/**
 * Nếu `raw` là một chuỗi tiếng Việt do chính app tạo (đã whitelist), trả về
 * nguyên văn. Nếu là lỗi kỹ thuật/không xác định, trả về thông báo chung.
 */
export function getFriendlyError(
  raw: unknown,
  fallback = "Thao tác không thành công. Vui lòng thử lại sau.",
): string {
  try {
    // Log đầy đủ để dev debug — người dùng không nhìn thấy.
    console.log("[getFriendlyError] raw", raw);
  } catch {
    /* ignore */
  }

  if (raw == null) return fallback;

  let text = "";
  if (typeof raw === "string") text = raw;
  else if (raw instanceof Error) text = raw.message ?? "";
  else if (typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const cand = rec.message ?? rec.error_description ?? rec.error ?? rec.msg;
    if (typeof cand === "string") text = cand;
  } else {
    text = String(raw);
  }

  text = (text || "").trim();
  if (!text) return fallback;

  // Dịch các lỗi tiếng Anh đã biết sang tiếng Việt.
  for (const [re, vi] of EN_TO_VI) {
    if (re.test(text)) return vi;
  }

  if (looksTechnical(text)) return fallback;

  // Chỉ giữ lại thông báo nếu là tiếng Việt "app-friendly": không chứa dấu {,
  // ngoặc vuông, dấu chấm phẩy đặc trưng của stack trace.
  if (/[{}\[\]]|\bat\s+\w|\.ts:\d+|\.js:\d+/.test(text)) return fallback;

  // Không bao giờ hiển thị chuỗi tiếng Anh cho người dùng.
  if (looksEnglish(text)) return fallback;

  return text;
}


/** Alias cho các trường hợp lỗi mạng cụ thể. */
export function getFriendlyNetworkError(raw: unknown): string {
  const t = raw instanceof Error ? raw.message : String(raw ?? "");
  if (/network|fetch|offline|failed to fetch/i.test(t)) {
    return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet và thử lại.";
  }
  return getFriendlyError(raw);
}