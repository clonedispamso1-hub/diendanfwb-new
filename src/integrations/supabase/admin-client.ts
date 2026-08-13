// Client Supabase RIÊNG cho phiên Admin (Bang Chủ).
// Dùng storageKey khác để session admin hoàn toàn tách biệt session user.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zbuwddjcqdlyijcunwgd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gfG2jAvZPFS-8ZS2xlmRtQ_z4uiRihk";

export const supabaseAdminSession = createClient<any>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "candy.admin.auth",
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
  },
});

/** Email tổng hợp cho admin từ username — để tận dụng Supabase Auth password flow. */
export const adminEmailFromUsername = (username: string) =>
  `${username.trim().toLowerCase()}@admin.candy.local`;

export type BangchuRole = "admin_1" | "admin_2" | "agent";
export type BangchuStatus = "pending" | "approved" | "rejected";

export interface BangchuRow {
  id: string;
  auth_user_id: string;
  username: string;
  role: BangchuRole;
  status: BangchuStatus;
  is_active: boolean;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

const BANGCHU_COLUMNS =
  "id, auth_user_id, username, role, status, is_active, created_at, approved_by, approved_at";

export async function fetchCurrentBangchu(): Promise<BangchuRow | null> {
  const { data: auth } = await supabaseAdminSession.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabaseAdminSession
    .from("bangchu")
    .select(BANGCHU_COLUMNS)
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  return (data as BangchuRow) ?? null;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{6,30}$/;
export const PASSWORD_RE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export function validateUsername(u: string): string | null {
  if (!USERNAME_RE.test(u))
    return "Username 6-30 ký tự, chỉ chữ/số/_";
  return null;
}

export function validatePassword(p: string): string | null {
  if (!PASSWORD_RE.test(p))
    return "Password ≥10 ký tự, có chữ hoa, thường, số, ký tự đặc biệt";
  return null;
}