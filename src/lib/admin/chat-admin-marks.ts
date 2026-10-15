/**
 * Lịch sử dùng Kịch bản cho khu "Tài khoản thứ hai → Tin nhắn" — CHỈ dùng trong Admin Panel.
 * Bảng `admin_chat_script_usage` (peer_id, script_id, script_name, account_id,
 * account_username, used_by, used_at) ở Supabase #1, RLS chỉ cho admin đọc/ghi.
 * SQL: supabase-sql/SB1/PENDING_2026-10-13_admin_chat_marks_private.sql.
 */
import { useEffect, useState } from "react";
import { adminDb } from "@/lib/admin-db";

const USAGE_TABLE = "admin_chat_script_usage";

export type ScriptUsage = {
  peer_id: string;
  script_id: string;
  script_name: string;
  account_id: string;
  account_username: string | null;
  at: string;
};

type State = { usage: ScriptUsage[]; loaded: boolean; error: string | null };
let state: State = { usage: [], loaded: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((cb) => { try { cb(); } catch { /* noop */ } });
};

function friendly(err: any): string {
  const msg = String(err?.message || err?.code || err || "");
  if (/does not exist|schema cache|PGRST205|PGRST202|404|Missing table/i.test(msg)) {
    return "Chưa tạo bảng lưu riêng cho admin trên Supabase #1 (cần chạy SQL PENDING_2026-10-13_admin_chat_marks_private.sql).";
  }
  if (/42501|row-level security|permission denied|JWT|401|403/i.test(msg)) {
    return "Phiên Admin không hợp lệ hoặc không đủ quyền. Hãy đăng nhập lại Admin Panel.";
  }
  return msg || "Lỗi không xác định";
}

let inflight: Promise<void> | null = null;
export function refreshAdminMarks(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const db = (await adminDb()) as any;
      const u = await db.from(USAGE_TABLE)
        .select("peer_id, script_id, script_name, account_id, account_username, used_at")
        .order("used_at", { ascending: true }).limit(10000);
      if (u.error) throw u.error;
      const usage: ScriptUsage[] = (u.data ?? []).map((r: any) => ({
        peer_id: String(r.peer_id), script_id: String(r.script_id), script_name: r.script_name,
        account_id: String(r.account_id), account_username: r.account_username ?? null, at: r.used_at,
      }));
      set({ usage, loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: friendly(e) });
    } finally { inflight = null; }
  })();
  return inflight;
}

/** Ghi nhận 1 lần gửi Kịch bản — CHỈ gọi sau khi RPC gửi tin trả về thành công. */
export async function recordScriptUsage(entry: Omit<ScriptUsage, "at">): Promise<void> {
  const db = (await adminDb()) as any;
  const at = new Date().toISOString();
  const { error } = await db.from(USAGE_TABLE).upsert(
    { ...entry, used_at: at },
    { onConflict: "peer_id,script_id,account_id" },
  );
  if (error) throw new Error(friendly(error));
  const rest = state.usage.filter((u) =>
    !(u.peer_id === entry.peer_id && u.script_id === entry.script_id && u.account_id === entry.account_id));
  set({ usage: [...rest, { ...entry, at }] });
}

export function useAdminMarks() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    refreshAdminMarks().catch(() => {});
    return () => { listeners.delete(cb); };
  }, []);
  return state;
}
