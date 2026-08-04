import { supabase } from "@/integrations/supabase/client";

export interface BannedKeyword {
  id: number;
  keyword: string;
  normalized: string;
  severity: string;
  penalty: number;
}

/** Lowercase + bỏ dấu tiếng Việt + bỏ space/dấu chấm/phẩy/gạch/_/ký tự đặc biệt. */
export function normalizeText(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // Bỏ dấu tiếng Việt
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d");
  // Bỏ mọi ký tự không phải a-z 0-9
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

let cache: { ts: number; list: BannedKeyword[] } | null = null;
const TTL = 30_000;

export async function loadBannedKeywords(force = false): Promise<BannedKeyword[]> {
  if (!force && cache && Date.now() - cache.ts < TTL) return cache.list;
  const { data, error } = await supabase
    .from("banned_keywords" as any)
    .select("id, keyword, normalized, severity, penalty");
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
    if (!k.normalized) continue;
    if (norm.includes(k.normalized)) {
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

/** Nhận diện lỗi kỹ thuật (SQL/PostgREST) để KHÔNG bao giờ hiển thị ra UI. */
export function isTechnicalError(message?: string | null): boolean {
  return Boolean(message) && message !== MODERATION_MESSAGE;
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


