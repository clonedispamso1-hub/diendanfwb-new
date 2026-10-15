/**
 * Lượt đăng bài: 20 lượt miễn phí cho mọi tài khoản, sau đó 5.000 gem/bài.
 *
 * Supabase 1 (`reserve_post_slot`) quyết định giá / lượt / số dư và trả về một
 * "vé đăng bài" có chữ ký. Supabase 3 (trigger trên `posts`) chỉ nhận bài có
 * vé hợp lệ, mỗi vé dùng đúng 1 lần — nên gửi thẳng vào database cũng bị chặn.
 * Vé chưa dùng (đăng lỗi) được tái sử dụng ở lần đăng sau, không trừ tiền lại.
 */
import { supabase } from "@/lib/db/router";

export const POST_FEE_MESSAGE =
  "Bạn đã hết lượt đăng bài miễn phí. Chi phí đăng bài là 5.000đ/bài. Vui lòng thanh toán để tiếp tục.";

export class PostSlotError extends Error {}

export interface PostTicket {
  chargeId: string | null;
  ticket: string;
}

type Reserve = {
  ok: boolean;
  code?: string;
  charge_id?: string | null;
  ticket?: string;
  balance?: number;
  message?: string;
};

function isMissingFn(err: any) {
  const m = `${err?.code ?? ""} ${err?.message ?? ""}`;
  return /PGRST202|42883|Could not find the function/i.test(m);
}

export function isTicketUsedError(err: unknown): boolean {
  const m = String((err as any)?.message ?? err ?? "");
  return /POST_TICKET_USED/.test(m);
}

async function call(confirmPaid: boolean): Promise<Reserve | "missing"> {
  const { data, error } = await (supabase as any).rpc("reserve_post_slot", {
    p_confirm_paid: confirmPaid,
  });
  if (error) {
    if (isMissingFn(error)) return "missing";
    throw new PostSlotError("Không kiểm tra được lượt đăng bài, vui lòng thử lại.");
  }
  return data as Reserve;
}

/**
 * Lấy vé đăng 1 bài. null = SQL chưa được cài (giữ hành vi cũ).
 * Ném PostSlotError khi người dùng huỷ thanh toán / không đủ số dư.
 */
export async function reservePostSlot(): Promise<PostTicket | null> {
  let res = await call(false);
  if (res === "missing") {
    console.warn("reserve_post_slot chưa được cài trên Supabase 1 — bỏ qua giới hạn lượt.");
    return null;
  }
  if (!res.ok && res.code === "PAYMENT_REQUIRED") {
    const bal = Number(res.balance ?? 0).toLocaleString("vi-VN");
    const agreed = window.confirm(
      `${POST_FEE_MESSAGE}\n\nSố dư ví hiện tại: ${bal}.\nBấm OK để thanh toán 5.000 từ ví và đăng bài.`,
    );
    if (!agreed) throw new PostSlotError("Bạn chưa thanh toán nên bài chưa được đăng.");
    const paid = await call(true);
    if (paid === "missing") return null;
    res = paid;
  }
  if (!res.ok || !res.ticket) {
    if (res.code === "INSUFFICIENT") {
      throw new PostSlotError("Số dư ví không đủ 5.000 để đăng bài. Vui lòng nạp thêm rồi thử lại.");
    }
    throw new PostSlotError(res.message || "Không đăng được bài, vui lòng thử lại.");
  }
  return { chargeId: res.charge_id ?? null, ticket: res.ticket };
}

/** Báo Supabase 1 vé đã dùng (bài đã tạo) để lần sau không trả lại vé này. */
export async function markPostTicketUsed(chargeId: string | null | undefined) {
  if (!chargeId) return;
  try {
    await (supabase as any).rpc("mark_post_charge_used", { p_charge_id: chargeId });
  } catch {
    /* lần đăng sau sẽ tự sửa qua POST_TICKET_USED */
  }
}

/** Gắn vé vào payload cho các đường đăng bài của Admin (Admin nhận vé miễn trừ). */
export async function withPostTicket<T extends Record<string, any>>(payload: T): Promise<T> {
  const t = await reservePostSlot();
  return t ? { ...payload, post_ticket: t.ticket } : payload;
}

/**
 * Insert 1 bài kèm vé (dùng cho các đường đăng của Admin / clone / seed).
 * Trả về đúng dạng { data, error } của supabase-js.
 */
export async function insertPostWithTicket(
  client: any,
  payload: Record<string, any>,
  opts: { selectId?: boolean } = {},
): Promise<{ data: any; error: any }> {
  const run = (p: Record<string, any>) => {
    const q = client.from("posts").insert([p]);
    return opts.selectId ? q.select("id").single() : q;
  };
  let t = await reservePostSlot();
  let res = await run(t ? { ...payload, post_ticket: t.ticket } : payload);
  if (res.error && isTicketUsedError(res.error)) {
    await markPostTicketUsed(t?.chargeId);
    t = await reservePostSlot();
    res = await run(t ? { ...payload, post_ticket: t.ticket } : payload);
  }
  if (res.error && /post_ticket/i.test(res.error.message || "") && /column/i.test(res.error.message || "")) {
    res = await run(payload); // Supabase 3 chưa chạy SQL → giữ hành vi cũ.
  }
  if (!res.error) void markPostTicketUsed(t?.chargeId);
  return res;
}

/**
 * Admin Panel → Tài khoản thứ hai: lấy vé "internal" (miễn ticket, không trừ gem).
 * Supabase 1 tự kiểm tra Super Admin + tài khoản đích là tài khoản thứ hai; Supabase 3
 * chỉ nhận vé có chữ ký hợp lệ, đúng user_id, dùng 1 lần. Không fallback sang vé trả phí.
 */
export async function reserveInternalPostTicket(rpcClient: any, accountId: string): Promise<string> {
  const { data, error } = await rpcClient.rpc("reserve_internal_post_ticket", { p_account_id: accountId });
  if (error) {
    if (isMissingFn(error)) {
      throw new PostSlotError("Chưa chạy SQL vé nội bộ trên Supabase 1 (RUN_NOW_2026-10-17_SB1_internal_post_ticket.sql).");
    }
    throw new PostSlotError("Không lấy được vé nội bộ, vui lòng thử lại.");
  }
  const r = data as Reserve;
  if (!r?.ok || !r.ticket) throw new PostSlotError(r?.message || "Không có quyền đăng bài cho tài khoản này.");
  return r.ticket;
}

/** Insert bài của Tài khoản thứ hai kèm vé internal. Trả về { data, error } như supabase-js. */
export async function insertInternalPost(
  client: any,
  rpcClient: any,
  payload: Record<string, any>,
  opts: { selectId?: boolean } = {},
): Promise<{ data: any; error: any }> {
  const ticket = await reserveInternalPostTicket(rpcClient, String(payload.user_id ?? ""));
  const q = client.from("posts").insert([{ ...payload, post_ticket: ticket }]);
  return opts.selectId ? q.select("id").single() : q;
}
