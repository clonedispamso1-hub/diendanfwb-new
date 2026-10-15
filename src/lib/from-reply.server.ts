/**
 * 🔐 From Reply — chạy phía máy chủ. Service keys chỉ đọc trong hàm.
 * SB1: xác thực + profiles · SB3: messages · SB4: cấu hình + trạng thái.
 */
import process from "node:process";
import { isRealUser, isSecondAccount, type ProfileFlags } from "./from-reply";

const URLS = {
  sb1: "https://gxfxqbhxoghdhokwjpex.supabase.co",
  sb3: "https://uaqsetfdciyzxpuhulux.supabase.co",
  sb4: "https://ybzdpxwbpbkeqkqwbscp.supabase.co",
} as const;
type Db = keyof typeof URLS;
const SB1_ANON = "sb_publishable_SzW_67SMUOkMvxvfmT7_ug_imLv9mmx";
const ENV: Record<Db, string[]> = {
  sb1: ["SUPABASE1_SERVICE_ROLE_KEY"],
  sb3: ["SUPABASE3_SERVICE_ROLE_KEY", "SB3_SERVICE_ROLE_KEY"],
  sb4: ["SUPABASE4_SERVICE_ROLE_KEY"],
};

function key(db: Db): string | null {
  for (const n of ENV[db]) { const v = (process.env[n] || "").trim(); if (v) return v; }
  return null;
}
export function missingKeys(): string[] {
  return (Object.keys(ENV) as Db[]).filter((d) => !key(d)).map((d) => ENV[d][0]);
}

async function rest<T>(db: Db, path: string, init: RequestInit = {}): Promise<T> {
  const k = key(db);
  if (!k) throw new Error(`MISSING_ENV: ${ENV[db][0]}`);
  const res = await fetch(`${URLS[db]}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${db} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}
const rpc = <T>(db: Db, fn: string, args: object) => rest<T>(db, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

export async function userFromToken(token: string): Promise<string | null> {
  const res = await fetch(`${URLS.sb1}/auth/v1/user`, { headers: { apikey: SB1_ANON, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string };
  return u?.id ?? null;
}

const PROFILE_COLS = "id,username,full_name,account_source,is_admin,is_internal,is_clone,is_virtual,is_seed_account";
type Prof = ProfileFlags & { id: string; username?: string | null; full_name?: string | null };

async function profiles(ids: string[]): Promise<Map<string, Prof>> {
  const map = new Map<string, Prof>();
  if (!ids.length) return map;
  let rows: Prof[];
  try {
    rows = await rest<Prof[]>("sb1", `profiles?id=in.(${ids.join(",")})&select=${PROFILE_COLS}`);
  } catch {
    // Một số cột cờ có thể chưa tồn tại — đọc tối thiểu.
    rows = await rest<Prof[]>("sb1", `profiles?id=in.(${ids.join(",")})&select=id,username,full_name,account_source,is_admin`);
  }
  rows.forEach((r) => map.set(r.id, r));
  return map;
}

async function isAdminUid(uid: string): Promise<boolean> {
  const bc = await rest<Array<{ status?: string; is_active?: boolean }>>("sb1", `bangchu?auth_user_id=eq.${uid}&select=status,is_active&limit=1`).catch(() => []);
  if (bc[0]?.status === "approved" && bc[0]?.is_active === true) return true;
  return (await profiles([uid])).get(uid)?.is_admin === true;
}

/* ---------------------- User gửi tin từ nút "Nhắn tin" ---------------------- */

export async function notifyPostMessage(token: string, receiverId: string): Promise<{ ok: boolean; result: string }> {
  if (missingKeys().length) return { ok: false, result: "not_configured" };
  const uid = await userFromToken(token);
  if (!uid || uid === receiverId) return { ok: false, result: "unauthorized" };
  const map = await profiles([uid, receiverId]);
  if (!isRealUser(map.get(uid)) || (await isAdminUid(uid))) return { ok: true, result: "not_real_user" };
  if (!isSecondAccount(map.get(receiverId))) return { ok: true, result: "not_second_account" };
  // Tin nhắn hợp lệ phải thật sự tồn tại: từ user → bot, gửi từ bài viết, trong 3 phút gần nhất.
  const since = new Date(Date.now() - 3 * 60_000).toISOString();
  const msgs = await rest<Array<{ id: string }>>("sb3",
    `messages?sender_id=eq.${uid}&receiver_id=eq.${receiverId}&created_at=gte.${encodeURIComponent(since)}` +
    `&content=like.${encodeURIComponent("[[postreply:*")}&select=id&limit=1`);
  if (!msgs.length) return { ok: true, result: "no_valid_message" };
  const result = await rpc<string>("sb4", "from_reply_enqueue", { p_user: uid, p_bot: receiverId });
  return { ok: true, result };
}

/* ------------------------------ Cron xử lý lượt ----------------------------- */

export async function runDueReplies(): Promise<{ sent: number; failed: number; skipped: number }> {
  const jobs = await rpc<Array<{ user_id: string; bot_id: string; stage: number; lease_token: string; content: string | null }>>(
    "sb4", "from_reply_claim", { p_limit: 20 });
  let sent = 0, failed = 0, skipped = 0;
  const map = await profiles(Array.from(new Set(jobs.flatMap((j) => [j.user_id, j.bot_id]))));
  for (const j of jobs) {
    const content = (j.content || "").trim();
    // Không gửi tin rỗng, không gửi nếu người nhận/gửi không còn đúng loại tài khoản.
    if (!content || !isSecondAccount(map.get(j.bot_id)) || !isRealUser(map.get(j.user_id))) {
      await rpc("sb4", "from_reply_complete", { p_user: j.user_id, p_lease: j.lease_token, p_ok: false });
      skipped++;
      continue;
    }
    let ok = false;
    try {
      await rest("sb3", "messages", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ sender_id: j.bot_id, receiver_id: j.user_id, content }),
      });
      ok = true;
    } catch (e) {
      console.error("[from-reply] send failed", (e as Error).message);
    }
    await rpc("sb4", "from_reply_complete", { p_user: j.user_id, p_lease: j.lease_token, p_ok: ok });
    ok ? sent++ : failed++;
  }
  return { sent, failed, skipped };
}

/* --------------------------------- Admin ---------------------------------- */

export type FromReplyRow = { userId: string; name: string; count: number; status: string; lastSentAt: string | null; lastBot: string | null };
export type FromReplyData = { replies1: string[]; replies2: string[]; rows: FromReplyRow[] };

async function requireAdmin(token: string): Promise<void> {
  const missing = missingKeys();
  if (missing.length) throw new Error(`Thiếu khoá máy chủ: ${missing.join(", ")}`);
  const uid = await userFromToken(token);
  if (!uid || !(await isAdminUid(uid))) throw new Error("Không có quyền Admin.");
}

export async function adminLoad(token: string): Promise<FromReplyData> {
  await requireAdmin(token);
  const [cfg, states] = await Promise.all([
    rest<Array<{ replies_1: string[]; replies_2: string[] }>>("sb4", "from_reply_config?id=eq.1&select=replies_1,replies_2"),
    rest<Array<{ user_id: string; reply_count: number; status: string; last_sent_at: string | null; last_bot_id: string | null; bot_id: string | null }>>(
      "sb4", "from_reply_state?select=user_id,reply_count,status,last_sent_at,last_bot_id,bot_id&order=updated_at.desc&limit=300"),
  ]);
  const names = await profiles(Array.from(new Set(states.flatMap((s) => [s.user_id, s.last_bot_id ?? s.bot_id].filter(Boolean) as string[]))));
  const nm = (id: string | null) => (id ? names.get(id)?.full_name || names.get(id)?.username || id.slice(0, 8) : null);
  return {
    replies1: cfg[0]?.replies_1 ?? [],
    replies2: cfg[0]?.replies_2 ?? [],
    rows: states.map((s) => ({ userId: s.user_id, name: nm(s.user_id) ?? "", count: s.reply_count, status: s.status, lastSentAt: s.last_sent_at, lastBot: nm(s.last_bot_id ?? s.bot_id) })),
  };
}

export async function adminSave(token: string, replies1: string[], replies2: string[]): Promise<void> {
  await requireAdmin(token);
  await rest("sb4", "from_reply_config?id=eq.1", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ replies_1: replies1, replies_2: replies2, updated_at: new Date().toISOString() }),
  });
}
