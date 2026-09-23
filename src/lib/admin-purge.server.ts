/**
 * 🔐 LÕI CHẠY PHÍA MÁY CHỦ cho tính năng "Xóa tất cả" (Cá / Bài viết / Tố cáo).
 *
 * NGUYÊN TẮC BẤT BIẾN
 *  • Service Role Key CHỈ đọc từ process.env TRONG hàm (không module scope),
 *    không bao giờ log, không bao giờ trả về trình duyệt.
 *  • Không tạo bảng, không đổi schema, không đổi RLS, không thêm policy public.
 *  • Chỉ DELETE theo allowlist bảng + điều kiện cố định trong file này.
 *  • KHÔNG BAO GIỜ chạm: gem_transactions, profiles (gem_balance), auth.users,
 *    bangchu, storage (file ảnh/bằng chứng).
 *
 * File có hậu tố `.server.ts` → Vite chặn không cho vào bundle trình duyệt.
 */
import process from "node:process";

/* ------------------------------- Kết nối DB ------------------------------- */

export type DbId = "sb1" | "sb3" | "sb4";

const CONN: Record<DbId, { url: string; envKey: string; label: string }> = {
  sb1: {
    url: "https://gxfxqbhxoghdhokwjpex.supabase.co",
    envKey: "SUPABASE1_SERVICE_ROLE_KEY",
    label: "Supabase #1 (core: ví, chuyển tiền, rút tiền, quà)",
  },
  sb3: {
    url: "https://uaqsetfdciyzxpuhulux.supabase.co",
    envKey: "SUPABASE3_SERVICE_ROLE_KEY",
    label: "Supabase #3 (bài viết, bình luận, lượt thích, lượt xem)",
  },
  sb4: {
    url: "https://ybzdpxwbpbkeqkqwbscp.supabase.co",
    envKey: "SUPABASE4_SERVICE_ROLE_KEY",
    label: "Supabase #4 (đơn tố cáo)",
  },
};

/** Public (anon/publishable) key của SB1 — chỉ dùng để gọi /auth/v1/user. */
const SB1_ANON = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";

function serviceKey(db: DbId): string | null {
  const k = process.env[CONN[db].envKey];
  return k && k.trim() ? k.trim() : null;
}

/** Tên biến môi trường còn THIẾU (không tiết lộ giá trị). */
export function missingServiceKeys(dbs: DbId[]): string[] {
  return dbs.filter((d) => !serviceKey(d)).map((d) => CONN[d].envKey);
}

export const dbLabel = (db: DbId) => CONN[db].label;
export const dbEnvKey = (db: DbId) => CONN[db].envKey;
export const dbUrl = (db: DbId) => CONN[db].url;

function headers(db: DbId, extra: Record<string, string> = {}): Record<string, string> {
  const key = serviceKey(db)!;
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/* --------------------------- Xác thực quyền admin -------------------------- */

export type AdminCheck =
  | { ok: true; uid: string; via: "bangchu" | "profiles.is_admin" }
  | { ok: false; reason: string };

/**
 * Xác minh CHÍNH PHÍA MÁY CHỦ rằng access token thuộc một admin thật.
 * Dùng đúng cơ chế hiện có của dự án (bảng `bangchu` approved+active,
 * fallback cờ `profiles.is_admin`) — không tin bất kỳ giá trị nào từ client.
 */
export async function verifyAdmin(accessToken: string | undefined): Promise<AdminCheck> {
  const token = (accessToken || "").trim();
  if (!token) return { ok: false, reason: "AUTH_REQUIRED: thiếu phiên đăng nhập." };

  // 1) Token → user id (Supabase Auth tự xác thực chữ ký, hết hạn...).
  const res = await fetch(`${CONN.sb1.url}/auth/v1/user`, {
    headers: { apikey: SB1_ANON, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false, reason: "AUTH_INVALID: phiên không hợp lệ hoặc đã hết hạn." };
  const user = (await res.json()) as { id?: string };
  const uid = user?.id;
  if (!uid) return { ok: false, reason: "AUTH_INVALID: không xác định được người dùng." };

  const key = serviceKey("sb1");
  if (!key) return { ok: false, reason: `MISSING_ENV: ${CONN.sb1.envKey}` };

  // 2) Bang chủ đã duyệt & đang hoạt động.
  const bc = await fetch(
    `${CONN.sb1.url}/rest/v1/bangchu?auth_user_id=eq.${uid}&select=status,is_active&limit=1`,
    { headers: headers("sb1") },
  );
  if (bc.ok) {
    const rows = (await bc.json()) as Array<{ status?: string; is_active?: boolean }>;
    const r = rows?.[0];
    if (r && r.status === "approved" && r.is_active === true) {
      return { ok: true, uid, via: "bangchu" };
    }
  }

  // 3) Fallback: cờ profiles.is_admin.
  const pf = await fetch(`${CONN.sb1.url}/rest/v1/profiles?id=eq.${uid}&select=is_admin&limit=1`, {
    headers: headers("sb1"),
  });
  if (pf.ok) {
    const rows = (await pf.json()) as Array<{ is_admin?: boolean }>;
    if (rows?.[0]?.is_admin === true) return { ok: true, uid, via: "profiles.is_admin" };
  }

  return { ok: false, reason: "FORBIDDEN: tài khoản này không phải admin." };
}

/* ------------------------- Đếm / Xoá qua PostgREST ------------------------ */

/** Đếm chính xác (privileged) — trả null nếu lỗi. */
export async function countRows(db: DbId, table: string, filter = ""): Promise<number | null> {
  if (!serviceKey(db)) return null;
  const q = filter ? `&${filter}` : "";
  const res = await fetch(`${CONN[db].url}/rest/v1/${table}?select=*${q}`, {
    method: "HEAD",
    headers: headers(db, { Prefer: "count=exact", Range: "0-0" }),
  });
  if (!res.ok) return null;
  const cr = res.headers.get("content-range"); // "0-0/123"
  const total = cr?.split("/")?.[1];
  const n = total && total !== "*" ? Number(total) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** DELETE có điều kiện. `filter` rỗng = xoá toàn bộ bảng (chỉ bảng lịch sử). */
export async function deleteRows(
  db: DbId,
  table: string,
  filter: string,
): Promise<{ deleted: number | null; error?: string }> {
  if (!serviceKey(db)) return { deleted: null, error: `MISSING_ENV: ${CONN[db].envKey}` };
  const q = filter ? `?${filter}` : "?id=not.is.null";
  const res = await fetch(`${CONN[db].url}/rest/v1/${table}${q}`, {
    method: "DELETE",
    headers: headers(db, { Prefer: "count=exact,return=minimal" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { deleted: null, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const cr = res.headers.get("content-range");
  const total = cr?.split("/")?.[1];
  const n = total && total !== "*" ? Number(total) : NaN;
  return { deleted: Number.isFinite(n) ? n : null };
}

/* ----------------------------- Allowlist xoá ------------------------------ */

/** Trạng thái đơn rút đã kết thúc → an toàn xoá khỏi lịch sử. */
export const WITHDRAW_FINISHED = ["approved", "rejected", "refunded", "paid", "cancelled"];
/** Trạng thái đơn rút chưa kết thúc → TUYỆT ĐỐI giữ lại. */
export const WITHDRAW_PROTECTED = ["pending", "processing", "reviewing"];

const inList = (col: string, v: string[]) => `${col}=in.(${v.join(",")})`;

/** Duy nhất 3 mục xoá được phép, kèm điều kiện cố định. */
export const PURGE_PLAN = {
  fish: {
    db: "sb1" as DbId,
    steps: [
      { label: "Chuyển tiền / Nhận tiền", table: "transfer_transactions", filter: "" },
      { label: "Tặng quà / Nhận quà (đã nhận)", table: "post_gifts", filter: "claimed=eq.true" },
      {
        label: "Rút tiền (đã xử lý xong)",
        table: "withdrawal_requests",
        filter: inList("status", WITHDRAW_FINISHED),
      },
    ],
  },
  posts: {
    db: "sb3" as DbId,
    steps: [
      { label: "Lượt thích bình luận", table: "comment_likes", filter: "" },
      { label: "Bình luận", table: "comments", filter: "" },
      { label: "Lượt thích bài", table: "likes", filter: "" },
      { label: "Lượt xem", table: "post_views", filter: "post_id=not.is.null" },
      { label: "Bài viết", table: "posts", filter: "" },
    ],
  },
  reports: {
    db: "sb4" as DbId,
    steps: [{ label: "Đơn tố cáo", table: "reports", filter: "" }],
  },
} as const;

export type PurgeModule = keyof typeof PURGE_PLAN;
