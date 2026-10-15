/**
 * From Reply — quy tắc thuần (dùng chung cho server và kiểm thử).
 * Giới hạn 2 lượt tính theo user thật trên toàn hệ thống, không theo từng bot.
 */
export const FROM_REPLY_MAX = 2;
export const FROM_REPLY_DELAY_MS = [60_000, 180_000] as const;

/** Mỗi dòng không rỗng là một mẫu trả lời. */
export function parseTemplates(text: string): string[] {
  return Array.from(new Set((text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean))).slice(0, 200);
}

export function pickTemplate(list: string[], rnd: () => number = Math.random): string | null {
  const clean = list.map((s) => s.trim()).filter(Boolean);
  if (!clean.length) return null;
  return clean[Math.min(clean.length - 1, Math.floor(rnd() * clean.length))];
}

export type ProfileFlags = {
  account_source?: string | null;
  is_admin?: boolean | null;
  is_internal?: boolean | null;
  is_clone?: boolean | null;
  is_virtual?: boolean | null;
  is_seed_account?: boolean | null;
};

/** User thật: không phải admin, tài khoản thứ hai, mô phỏng hay seed. */
export function isRealUser(p: ProfileFlags | null | undefined): boolean {
  if (!p) return false;
  return p.account_source !== "internal" && !p.is_admin && !p.is_internal && !p.is_clone && !p.is_virtual && !p.is_seed_account;
}

/** Tài khoản thứ hai nhận tin. */
export function isSecondAccount(p: ProfileFlags | null | undefined): boolean {
  return p?.account_source === "internal";
}

export type ReplyState = { count: number; status: "idle" | "pending" | "sending" };
export type EnqueueResult = "queued" | "done" | "busy" | "no_template";

/** Mô hình TS của from_reply_enqueue (SQL) — để kiểm thử quy tắc. */
export function decideEnqueue(state: ReplyState, templates: { r1: string[]; r2: string[] }): { result: EnqueueResult; delayMs?: number } {
  if (state.count >= FROM_REPLY_MAX) return { result: "done" };
  if (state.status !== "idle") return { result: "busy" };
  const list = state.count === 0 ? templates.r1 : templates.r2;
  if (!list.some((s) => s.trim())) return { result: "no_template" };
  return { result: "queued", delayMs: FROM_REPLY_DELAY_MS[state.count] };
}

/** Mô hình from_reply_complete: chỉ tăng khi gửi thành công. */
export function applyComplete(state: ReplyState, ok: boolean): ReplyState {
  return { count: ok ? Math.min(state.count + 1, FROM_REPLY_MAX) : state.count, status: "idle" };
}
