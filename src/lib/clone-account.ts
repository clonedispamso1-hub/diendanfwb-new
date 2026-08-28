import { supabase } from "@/lib/db/router";

/**
 * Nhận diện "Tài khoản thứ hai" (Clone) — profiles.account_source = 'internal'.
 *
 * Thiết kế: Clone KHÔNG nhận bất kỳ Notification nào.
 *  - Không subscribe realtime notification, không mở websocket notification.
 *  - Không fetch / polling / đếm unread notification.
 *  - Không hiển thị badge đỏ hay chuông có số.
 *
 * Thành viên thật KHÔNG bị ảnh hưởng.
 */

export function isCloneProfile(profile: unknown): boolean {
  return (profile as any)?.account_source === "internal";
}

let cloneFlag = false;

/** Cập nhật khi profile của user hiện tại được load / xoá (auth-provider). */
export function setCloneAccountFlag(value: boolean): void {
  cloneFlag = value;
}

/** Dùng ở tầng lib (không có React context): user hiện tại có phải Clone không. */
export function isCloneAccount(): boolean {
  return cloneFlag;
}

/**
 * Kiểm tra 1 user_id có phải Clone không (dùng trước khi TẠO notification).
 * Lỗi/không đọc được → coi như không phải clone (thành viên thật vẫn nhận đủ).
 */
export async function isCloneUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("account_source")
      .eq("id", userId)
      .maybeSingle();
    return (data as any)?.account_source === "internal";
  } catch {
    return false;
  }
}
