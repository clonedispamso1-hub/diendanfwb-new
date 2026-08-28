/**
 * Notifications service — đã chuyển sang Supabase #3 (`db3()`).
 *
 * Bảng `public.notifications` nằm ở Supabase #3 (logs / thống kê). Client #3
 * chuyển tiếp access token của Supabase #1 nên RLS theo `auth.uid()` vẫn đúng.
 *
 * Lưu ý schema thật: cột đánh dấu đã đọc là `is_read` (boolean), không phải
 * `read_at`. Service map hai chiều để giữ nguyên kiểu `Notification` cũ.
 */
import { db3 } from "@/lib/db/router";
import { subscribeRealtime, pickRow } from "@/lib/realtime-registry";
import type { Notification, ServiceResult, UUID } from "./types";
import { nowIso } from "./_mock";

/** Client #3 — mọi truy vấn notifications đi qua đây. */
const logs = () => db3() as any;

const SELECT =
  "id, user_id, type, title, message, data, link, related_id, is_read, created_at";

function mapRow(row: any): Notification {
  return {
    ...row,
    // is_read (schema thật) → read_at (kiểu dùng trong app)
    read_at: row?.is_read ? (row.updated_at ?? row.created_at ?? nowIso()) : null,
  } as Notification;
}

export const notificationsService = {
  async list(userId: UUID): Promise<Notification[]> {
    const { data, error } = await logs()
      .from("notifications")
      .select(SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("[notifications] list failed", error);
      return [];
    }
    return ((data as any[]) ?? []).map(mapRow);
  },

  async unreadCount(userId: UUID): Promise<number> {
    const { count, error } = await logs()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) {
      console.warn("[notifications] unreadCount failed", error);
      return 0;
    }
    return count ?? 0;
  },

  async markRead(id: UUID): Promise<ServiceResult> {
    const { error } = await logs()
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async markAllRead(userId: UUID): Promise<ServiceResult> {
    const { error } = await logs()
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async push(
    input: Omit<Notification, "id" | "created_at" | "read_at">,
  ): Promise<ServiceResult<Notification>> {
    const { data, error } = await logs()
      .from("notifications")
      .insert({
        user_id: (input as any).user_id,
        type: (input as any).type ?? "system",
        title: (input as any).title ?? "",
        message: (input as any).message ?? "",
        data: (input as any).data ?? {},
        link: (input as any).link ?? null,
        related_id: (input as any).related_id ?? null,
        is_read: false,
      })
      .select(SELECT)
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: mapRow(data) };
  },

  /**
   * Realtime cho notifications — channel chạy trên client #3 (registry tự
   * chọn client theo tên bảng log).
   */
  subscribe(userId: UUID, onChange: (row: Notification | null) => void): () => void {
    return subscribeRealtime({
      key: `notif:${userId}`,
      topics: [{ table: "notifications", event: "*", filter: `user_id=eq.${userId}` }],
      onChange: (payload) => {
        const row = pickRow(payload);
        onChange(row ? mapRow(row) : null);
      },
    });
  },
};
