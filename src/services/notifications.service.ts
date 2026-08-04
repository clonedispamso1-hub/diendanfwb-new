/**
 * Notifications service.
 *
 * TODO(supabase): subscribe with supabase.channel(`notif:${userId}`) for
 * realtime; list via .from("notifications").select(...).
 */
import type { Notification, ServiceResult, UUID } from "./types";
import { delay, nowIso, uid } from "./_mock";

const mockNotifications: Notification[] = [];

export const notificationsService = {
  async list(userId: UUID): Promise<Notification[]> {
    await delay();
    return mockNotifications.filter((n) => n.user_id === userId);
  },

  async unreadCount(userId: UUID): Promise<number> {
    await delay();
    return mockNotifications.filter(
      (n) => n.user_id === userId && !n.read_at,
    ).length;
  },

  async markRead(id: UUID): Promise<ServiceResult> {
    await delay();
    const n = mockNotifications.find((n) => n.id === id);
    if (n) n.read_at = nowIso();
    return { ok: true };
  },

  async markAllRead(userId: UUID): Promise<ServiceResult> {
    await delay();
    mockNotifications
      .filter((n) => n.user_id === userId && !n.read_at)
      .forEach((n) => (n.read_at = nowIso()));
    return { ok: true };
  },

  async push(
    input: Omit<Notification, "id" | "created_at" | "read_at">,
  ): Promise<ServiceResult<Notification>> {
    await delay();
    const notif: Notification = {
      id: uid(),
      read_at: null,
      created_at: nowIso(),
      ...input,
    };
    mockNotifications.push(notif);
    return { ok: true, data: notif };
  },
};
