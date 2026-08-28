import { supabase } from "@/lib/db/router";

export interface BannedKeyword {
  id: number;
  keyword: string;
  normalized: string;
  severity: string;
  penalty: number;
}

/**
 * Chuẩn hoá chống né từ khoá:
 *  - Unicode NFKC (ký tự full-width / ký tự lạ → ASCII) rồi NFD để bỏ dấu.
 *  - Bỏ ký tự vô hình (zero-width, soft hyphen…).
 *  - Lowercase, đ → d.
 *  - Bỏ TOÀN BỘ ký tự ngăn cách/đặc biệt (space, ".", "..", "_", "-", "*"…).
 * Nhờ vậy "A.D..M...IN chó", "a d m i n c h ó" đều về cùng "admincho".
 */
export function normalizeText(input: string): string {
  if (!input) return "";
  let s = String(input).normalize("NFKC").toLowerCase();
  // Ký tự vô hình thường bị dùng để né bộ lọc
  s = s.replace(/[\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g, "");
  // Bỏ dấu tiếng Việt
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d");
  // Bỏ mọi ký tự không phải a-z 0-9
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

/** Từ khoá quá ngắn sau chuẩn hoá dễ match bừa → bỏ qua (chống khoá oan). */
export const MIN_KEYWORD_LENGTH = 3;

let cache: { ts: number; list: BannedKeyword[] } | null = null;
const TTL = 30_000;

export async function loadBannedKeywords(force = false): Promise<BannedKeyword[]> {
  if (!force && cache && Date.now() - cache.ts < TTL) return cache.list;
  const { data, error } = await supabase
    .from("banned_keywords" as any)
    .select("id, keyword, normalized, severity, penalty").limit(200);
  if (error) return cache?.list ?? [];
  const list = (data as any as BannedKeyword[]) ?? [];
  cache = { ts: Date.now(), list };
  return list;
}

export function invalidateKeywordCache() {
  cache = null;
}

/** Trả về keyword khớp đầu tiên (penalty cao nhất ưu tiên). */
export function checkContent(
  content: string,
  keywords: BannedKeyword[],
): { matched: string; penalty: number } | null {
  if (!content) return null;
  const norm = normalizeText(content);
  if (!norm) return null;
  const sorted = [...keywords].sort((a, b) => b.penalty - a.penalty);
  for (const k of sorted) {
    // Luôn chuẩn hoá lại từ khoá bằng CÙNG một hàm với nội dung.
    const key = normalizeText(k.normalized || k.keyword);
    if (!key || key.length < MIN_KEYWORD_LENGTH) continue;
    if (norm.includes(key)) {
      return { matched: k.keyword, penalty: k.penalty };
    }
  }
  return null;
}

/** Điểm uy tín bị trừ mỗi lần vi phạm từ cấm (theo yêu cầu: trừ thẳng 15). */
export const KEYWORD_PENALTY = 15;

export type ModerationKind = "post" | "comment" | "message";

/** Thông báo DUY NHẤT hiển thị cho người dùng khi nội dung bị chặn. */
export const MODERATION_MESSAGE =
  "💖 Cái mỏ xinh xắn là cái mỏ không biết chửi thề. Chúc bạn có một ngày thật may mắn nhé! 🌸";

/** Thông báo chặn CHUNG cho mọi write path (bài viết/comment/tin nhắn/tên/bio). */
export const CONTENT_BLOCKED_MESSAGE = "Nội dung không phù hợp, vui lòng chỉnh sửa.";

export type ModerationTarget = ModerationKind | "display_name" | "bio";

/**
 * COMMON MODERATION GATE — gọi TRƯỚC mọi thao tác lưu nội dung.
 * Quét cục bộ (nguồn quyết định, luôn chạy được) + RPC server (log/uy tín).
 * Ném Error(CONTENT_BLOCKED_MESSAGE) nếu dính từ cấm. Không khoá/xoá tài khoản.
 */
export async function assertContentAllowed(
  content: string,
  target: ModerationTarget = "post",
): Promise<void> {
  const text = (content || "").trim();
  if (!text) return;

  let blocked = false;

  // 1) RPC kiểm tra thuần (SECURITY DEFINER) — user thường không đọc được
  //    banned_keywords nên đây là nguồn quyết định chính.
  try {
    const { data, error } = await supabase.rpc("is_content_blocked" as any, { _content: text });
    if (!error && data === true) blocked = true;
  } catch { /* nuốt lỗi kỹ thuật */ }

  // 2) Quét cục bộ (khi client đọc được danh sách từ cấm).
  if (!blocked) {
    try {
      blocked = Boolean(checkContent(text, await loadBannedKeywords()));
    } catch { /* nuốt lỗi kỹ thuật */ }
  }

  // 3) RPC đầy đủ (ghi log + trừ uy tín) cho nội dung post/comment/message.
  if (target === "post" || target === "comment" || target === "message") {
    try {
      const { data, error } = await supabase.rpc("moderate_content" as any, {
        _content: text,
        _kind: target,
        _device: deviceInfo(),
      });
      if (!error && (data as any)?.blocked === true) blocked = true;
    } catch { /* nuốt lỗi kỹ thuật */ }
  }


  if (blocked) throw new Error(CONTENT_BLOCKED_MESSAGE);
}

/** Nhận diện lỗi kỹ thuật (SQL/PostgREST) để KHÔNG bao giờ hiển thị ra UI. */
export function isTechnicalError(message?: string | null): boolean {
  return Boolean(message) && message !== MODERATION_MESSAGE && message !== CONTENT_BLOCKED_MESSAGE;
}

function deviceInfo(): string {
  if (typeof navigator === "undefined") return "server";
  return `${navigator.userAgent}`.slice(0, 300);
}

/**
 * Bot kiểm duyệt cho Đăng bài / Bình luận / Tin nhắn — DÙNG CHUNG 100%.
 *
 * Thứ tự:
 *  1. Đối chiếu danh sách từ cấm (RPC server nếu chạy được, nếu server lỗi
 *     — ví dụ keyword_logs NOT NULL — thì tự động quét cục bộ).
 *  2. Nếu dính từ cấm → LUÔN throw đúng MODERATION_MESSAGE.
 *
 * TUYỆT ĐỐI không để lỗi PostgreSQL rò ra ngoài giao diện.
 */
export async function enforceContentRules(
  content: string,
  kind: ModerationKind = "post",
): Promise<void> {
  const text = (content || "").trim();
  if (!text) return;

  let serverDecided = false;
  let blocked = false;

  // 1) RPC đầy đủ (ghi log + trừ uy tín). Mọi lỗi đều bị nuốt.
  try {
    const { data, error } = await supabase.rpc("moderate_content" as any, {
      _content: text,
      _kind: kind,
      _device: deviceInfo(),
    });
    if (!error) {
      serverDecided = true;
      blocked = (data as any)?.blocked === true;
    }
  } catch {
    /* nuốt lỗi kỹ thuật */
  }

  // 2) RPC cũ chỉ quét từ cấm.
  if (!serverDecided) {
    try {
      const { data, error } = await supabase.rpc("scan_post_keywords" as any, { _content: text });
      if (!error) {
        serverDecided = true;
        blocked = data === true;
      }
    } catch {
      /* nuốt lỗi kỹ thuật */
    }
  }

  // 3) Fallback cục bộ: đọc bảng banned_keywords và tự đối chiếu.
  //    Đảm bảo Post + Comment + Message luôn bị chặn như nhau kể cả khi RPC lỗi.
  if (!serverDecided) {
    try {
      const keywords = await loadBannedKeywords();
      blocked = Boolean(checkContent(text, keywords));
    } catch {
      blocked = false;
    }
  }

  if (blocked) throw new Error(MODERATION_MESSAGE);
}



/* ============================================================
 * ĐÁNH DẤU "KHÔNG PHÙ HỢP" (không xoá nội dung)
 * Dùng cho Bài viết + Bình luận: nội dung vẫn được đăng, nhưng bị gắn cờ
 * để Admin xem lại và xử lý sau.
 * ========================================================== */

export const INAPPROPRIATE_STATUS = "inappropriate";
export const INAPPROPRIATE_LABEL = "Không Phù Hợp";

export interface ScreenResult {
  flagged: boolean;
  /** Từ khoá khớp — chỉ có khi quét được cục bộ (Admin đọc được danh sách). */
  matched?: string | null;
  severity?: string | null;
}

/**
 * Quét nội dung nhưng KHÔNG chặn: chỉ trả kết quả để caller gắn cờ.
 * Thứ tự: RPC server (ghi log + trừ uy tín) → RPC cũ → quét cục bộ.
 */
export async function screenContent(
  content: string,
  kind: ModerationKind = "post",
): Promise<ScreenResult> {
  const text = (content || "").trim();
  if (!text) return { flagged: false };

  let decided = false;
  let flagged = false;
  let severity: string | null = null;

  try {
    const { data, error } = await supabase.rpc("moderate_content" as any, {
      _content: text,
      _kind: kind,
      _device: deviceInfo(),
    });
    if (!error) {
      decided = true;
      flagged = (data as any)?.blocked === true;
      severity = ((data as any)?.severity as string) ?? null;
    }
  } catch { /* nuốt lỗi kỹ thuật */ }

  if (!decided) {
    try {
      const { data, error } = await supabase.rpc("scan_post_keywords" as any, { _content: text });
      if (!error) { decided = true; flagged = data === true; }
    } catch { /* nuốt lỗi kỹ thuật */ }
  }

  // Quét cục bộ để lấy từ khoá cụ thể (và làm fallback khi RPC lỗi).
  try {
    const local = checkContent(text, await loadBannedKeywords());
    if (local) return { flagged: true, matched: local.matched, severity };
    if (!decided) return { flagged: false };
  } catch { /* noop */ }

  return { flagged, severity };
}

/**
 * Gắn cờ "Không Phù Hợp" lên bản ghi (posts / comments). Best-effort:
 * nếu DB chưa có cột kiểm duyệt thì bỏ qua, KHÔNG làm hỏng luồng đăng.
 */
export async function flagContentRecord(
  table: "posts" | "comments",
  id: string,
  result: ScreenResult,
): Promise<void> {
  if (!id || !result?.flagged) return;
  const reason = result.matched
    ? `Bộ lọc từ khoá: "${result.matched}"`
    : "Bộ lọc từ khoá phát hiện nội dung vi phạm";
  const payload: Record<string, any> = {
    moderation_status: INAPPROPRIATE_STATUS,
    moderation_reason: reason,
    moderation_keyword: result.matched ?? null,
    moderated_at: new Date().toISOString(),
  };
  try {
    const { error } = await (supabase.from(table) as any).update(payload).eq("id", id);
    if (!error) return;
    // DB chưa migrate → thử tối giản.
    if (/column .* does not exist/i.test(error.message || "")) {
      await (supabase.from(table) as any)
        .update({ moderation_status: INAPPROPRIATE_STATUS })
        .eq("id", id);
    }
  } catch { /* noop */ }
}
