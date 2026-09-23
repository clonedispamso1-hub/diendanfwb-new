/**
 * 🧹 "Xóa tất cả" — LỚP CLIENT MỎNG.
 *
 * Từ phiên bản này, TOÀN BỘ việc ĐẾM và XOÁ chạy PHÍA MÁY CHỦ
 * (src/lib/admin-purge.functions.ts + admin-purge.server.ts).
 * Trình duyệt chỉ gửi access token của phiên admin + cụm từ xác nhận "XOA";
 * không còn dùng khoá công khai để xoá, và không có khoá bí mật nào ở client.
 *
 * Bảng & database (đã xác minh bằng audit chỉ-đọc):
 *  • Supabase #1: transfer_transactions, post_gifts (claimed=true), withdrawal_requests (đã xử lý)
 *  • Supabase #3: comment_likes → comments → likes → post_views → posts
 *  • Supabase #4: reports
 * KHÔNG chạm: gem_transactions, profiles.gem_balance, tài khoản/auth, file storage.
 */
import { supabase } from "@/lib/db/router";
import { supabaseAdminSession } from "@/integrations/supabase/admin-client";
import { purgeCountFn, purgeExecuteFn } from "@/lib/admin-purge.functions";

/* --------------------------------- Kiểu ---------------------------------- */

export type CountRow = { label: string; count: number | null; note?: string };
export type PurgeLine = { label: string; deleted: number | null; kept?: number; error?: string };
export type PurgeResult = { lines: PurgeLine[]; blocked: string[] };

export type PurgeModule = "fish" | "posts" | "reports";

/** Trạng thái đơn rút đã kết thúc → an toàn xoá (bản sao để UI hiển thị). */
export const WITHDRAW_FINISHED = ["approved", "rejected", "refunded", "paid", "cancelled"];
/** Trạng thái đơn rút đang giữ tiền → TUYỆT ĐỐI không xoá. */
export const WITHDRAW_PROTECTED = ["pending", "processing", "reviewing"];

/* ------------------------------ Phiên admin ------------------------------ */

/** Lấy access token của phiên Admin Panel (ưu tiên) hoặc phiên user hiện tại. */
async function adminToken(): Promise<string> {
  const { data: a } = await supabaseAdminSession.auth.getSession();
  const t1 = a?.session?.access_token;
  if (t1) return t1;
  const { data: b } = await (supabase as any).auth.getSession();
  const t2 = b?.session?.access_token;
  if (t2) return t2;
  throw new Error("Chưa đăng nhập Admin Panel — hãy đăng nhập lại rồi thử lại.");
}

/* --------------------------- Gọi server (chung) -------------------------- */

async function serverCount(module: PurgeModule): Promise<CountRow[]> {
  const token = await adminToken();
  const res = await purgeCountFn({ data: { module, token } });
  if (!res.ok) throw new Error(res.error);
  return res.rows;
}

async function serverPurge(module: PurgeModule, confirm = "XOA"): Promise<PurgeResult> {
  const token = await adminToken();
  const res = await purgeExecuteFn({ data: { module, token, confirm } });
  if (!res.ok) throw new Error(res.error);
  return { lines: res.lines, blocked: res.blocked };
}

/* ============================ 🐟 Mục "Cá" ================================ */

export const countFishHistory = () => serverCount("fish");
export const purgeFishHistory = () => serverPurge("fish");

/* ========================== 📝 Mục "Bài viết" ============================ */

export const countPostHistory = () => serverCount("posts");
export const purgePostHistory = () => serverPurge("posts");

/* ===================== 🚩 Mục "Tố Cáo Nhận Thưởng" ======================= */

export const countReportHistory = () => serverCount("reports");
export const purgeReportHistory = () => serverPurge("reports");

/* ----------------- Tương thích API cũ (UI không phải sửa) ---------------- */

/** Server đã trả sẵn hàng hiển thị → các hàm *CountRows chỉ là passthrough. */
export const fishCountRows = (rows: CountRow[]): CountRow[] => rows;
export const postCountRows = (rows: CountRow[]): CountRow[] => rows;
export const reportCountRows = (rows: CountRow[]): CountRow[] => rows;
