/**
 * 🔗 SUPABASE #4 — dành riêng cho tính năng "Nhóm Mồi" (Bait Groups).
 *
 * Không đi qua Database Router vì đây là instance độc lập, chỉ phục vụ
 * 2 bảng: `bait_group_folders` và `bait_groups` (+ bucket `bait-groups`).
 *
 * Chạy SQL khởi tạo: supabase-sql/SB4/2026-08-27_bait_groups.sql
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_V4_URL = "https://ybzdpxwbpbkeqkqwbscp.supabase.co";
export const SUPABASE_V4_ANON_KEY = "sb_publishable_1EMCL_1QFrg_A94S6yBYtw_M-tzirb8";
/** ⚠️ Chỉ đọc trên server (không bao giờ nhúng secret vào bundle client). */
export const SUPABASE_V4_SERVICE_ROLE_KEY =
  typeof window === "undefined" ? (process.env["SUPABASE4_SERVICE_ROLE_KEY"] ?? "") : "";

const opts = {
  auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
} as const;

let _read: SupabaseClient<any> | null = null;
let _admin: SupabaseClient<any> | null = null;

/** Client đọc (anon / publishable). */
export function sb4(): SupabaseClient<any> {
  if (!_read) _read = createClient<any>(SUPABASE_V4_URL, SUPABASE_V4_ANON_KEY, opts as any);
  return _read;
}

/**
 * Client ghi cho Admin Panel.
 * ⚠️ Trên TRÌNH DUYỆT tuyệt đối không dùng secret key (Supabase chặn:
 * "Forbidden use of secret API key in browser") → dùng anon/publishable key.
 */
export function sb4Admin(): SupabaseClient<any> {
  if (!_admin) {
    const key =
      typeof window === "undefined" && SUPABASE_V4_SERVICE_ROLE_KEY
        ? SUPABASE_V4_SERVICE_ROLE_KEY
        : SUPABASE_V4_ANON_KEY;
    _admin = createClient<any>(SUPABASE_V4_URL, key, opts as any);
  }
  return _admin;
}

export const supabaseV4 = sb4();

/* ------------------------------ Kiểu dữ liệu ------------------------------ */

export interface BaitGroupFolder {
  id: string;
  name: string;
  /** true = tên hiển thị đổi theo Tỉnh/Thành của user ("Nhóm [Location]"). */
  by_location: boolean;
  /** Mẫu tên khi by_location = true, dùng token [Location]. */
  name_template: string | null;
  sort_order: number;
  created_at: string;
}

export interface BaitGroup {
  id: string;
  folder_id: string;
  name: string;
  province: string | null;
  avatar_url: string | null;
  member_count: number;
  message_count: number;
  preview_text: string | null;
  /** Nội dung mô tả do admin cấu hình, hiện trong Popup Thông tin Nhóm. */
  info_text?: string | null;
  sort_order: number;
  created_at: string;
}

/** Rút gọn số: 354 → "354", 1000 → "1k", 91729 → "91k", 1.2tr → "1.2M". */
export function shortCount(n: number): string {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${Math.floor(v / 1000)}k`;
  const m = v / 1_000_000;
  return `${m >= 10 ? Math.floor(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
}

/**
 * Thay metavariable động trong tên: `{location}` (và `[Location]` cũ)
 * bằng Tỉnh/Thành trong hồ sơ user. Chưa có → "Gần Bạn".
 */
export function applyLocation(text: string, province?: string | null): string {
  const loc = (province || "").trim() || "Gần Bạn";
  return (text || "").replace(/\{location\}|\[location\]/gi, loc);
}

/** Tên hiển thị của thư mục theo tỉnh/thành người xem. */
export function folderLabel(f: BaitGroupFolder, province?: string | null): string {
  if (!f.by_location) return applyLocation(f.name, province);
  const tpl = f.name_template?.trim() || "Nhóm {location}";
  return applyLocation(tpl, province);
}
