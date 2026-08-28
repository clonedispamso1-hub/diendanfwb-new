/**
 * SOCIAL DATABASE (Supabase 3) — dữ liệu phát sinh khi người dùng dùng web.
 *
 * Đổi sang Supabase 4/5: chỉ cần trỏ `db3()` (hoặc biến môi trường
 * VITE_LOGS_SUPABASE_URL / VITE_LOGS_SUPABASE_ANON_KEY) sang project mới.
 */
import { db3, isLogsDbConfigured } from "@/lib/db/router";
import type { SupabaseClient } from "@supabase/supabase-js";

export const socialDb = (): SupabaseClient<any> => db3() as SupabaseClient<any>;
export const isSocialDbConfigured = isLogsDbConfigured;
