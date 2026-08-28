/**
 * CORE DATABASE (Supabase 1) — auth, profiles, ví/tài chính, VIP, admin,
 * phân quyền, reports, cấu hình website.
 *
 * Chỉ router (`./index.ts`) và các module hạ tầng được import file này.
 */
import { supabase } from "@/lib/db/router";
import type { SupabaseClient } from "@supabase/supabase-js";

export const coreDb = (): SupabaseClient<any> => supabase as SupabaseClient<any>;
