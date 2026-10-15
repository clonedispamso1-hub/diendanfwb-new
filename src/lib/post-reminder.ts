/** Popup nhắc đăng bài: tối đa 1 lần / 4 giờ / tài khoản (lần đầu hiện ngay sau đăng ký). */
export const POST_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function shouldShowPostReminder(lastShownAt: number | null, now: number): boolean {
  if (lastShownAt == null || !Number.isFinite(lastShownAt)) return true;
  return now - lastShownAt >= POST_REMINDER_INTERVAL_MS;
}

/** Chỉ user thật: loại Admin, Tài khoản thứ hai, tài khoản mô phỏng/seed. */
export function isRealUserForReminder(me: any): boolean {
  if (!me?.id) return false;
  if (me.is_admin) return false;
  if (me.account_source === "internal") return false;
  if (me.is_virtual || me.is_seed_account) return false;
  return true;
}
