/**
 * Account Switcher — lưu tối đa 3 tài khoản gần nhất để đăng nhập nhanh.
 * Chỉ lưu refresh_token + thông tin hiển thị (avatar, tên). Sau 24h yêu cầu nhập lại password.
 */
import { supabase } from "@/lib/supabase";
import { securityGate } from "@/lib/access-guard";

export interface SavedAccount {
  username: string;
  fullName: string;
  avatar: string | null;
  refreshToken: string;
  accessToken: string;
  savedAt: number; // ms epoch
}

const KEY = "fwb_saved_accounts_v1";
const MAX = 2;
export const PASSWORD_REVALIDATE_MS = 24 * 60 * 60 * 1000;

function read(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && typeof a.username === "string");
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch { /* ignore quota */ }
}

export function getSavedAccounts(): SavedAccount[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveAccount(input: Omit<SavedAccount, "savedAt">) {
  const now = Date.now();
  const list = read().filter((a) => a.username !== input.username);
  list.unshift({ ...input, savedAt: now });
  write(list.slice(0, MAX));
}

export function removeAccount(username: string) {
  write(read().filter((a) => a.username !== username));
}

export function isFresh(account: SavedAccount): boolean {
  return Date.now() - account.savedAt < PASSWORD_REVALIDATE_MS;
}

/** Khôi phục session bằng refresh_token đã lưu. */
export async function quickLogin(account: SavedAccount): Promise<{ success: boolean; error?: string }> {
  try {
    const gate = await securityGate();
    if (gate.blocked) {
      if (typeof window !== "undefined") window.location.replace("/blocked");
      return { success: true };
    }
    const { error } = await supabase.auth.setSession({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    if (error) return { success: false, error: error.message };
    // refresh & cập nhật token mới
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const postGate = await securityGate();
      if (postGate.blocked) {
        if (typeof window !== "undefined") window.location.replace("/blocked");
        return { success: true };
      }
      saveAccount({
        username: account.username,
        fullName: account.fullName,
        avatar: account.avatar,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Quick login failed" };
  }
}
