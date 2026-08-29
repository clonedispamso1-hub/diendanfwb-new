/**
 * Ban Watchdog — lớp kiểm tra NGẦM chạy song song với Supabase Realtime.
 *
 * Realtime có thể rớt kết nối âm thầm (mạng yếu, tab ngủ, WebSocket bị proxy chặn)
 * → người bị khóa Mức 1/2 vẫn dùng được cho tới khi F5. Watchdog này:
 *   - polling mỗi 2 giây trạng thái ban của CHÍNH tài khoản đang đăng nhập
 *   - kiểm tra ngay khi tab được focus / visible trở lại / đổi route
 *   - phát hiện ban_level >= 1 | is_banned | status banned → signOut + wipe + /blocked
 *
 * Fail-open: lỗi mạng / lỗi query → bỏ qua, không khóa oan.
 * Không dính dáng IP.
 */
import { supabase } from "@/lib/db/router";
import { visibleInterval } from "@/lib/page-visibility";
import { applyBanLevel, purgeSessionAndBlock } from "@/lib/ban-realtime";
import { isCurrentUserAdmin, isDeviceBlockedSticky } from "@/lib/access-guard";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { getDeviceCookieId } from "@/lib/device-signal";
import { cachedQuery } from "@/lib/request-cache";

const POLL_MS = 30_000;
/** Chu kỳ kiểm tra khóa THIẾT BỊ (Mức 3) — chạy cả khi CHƯA đăng nhập. */
const DEVICE_POLL_MS = 60_000;

let started = false;
let checking = false;
let fired = false;

function isBlockedPath() {
  return (
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/blocked") ||
      window.location.pathname.startsWith("/locked"))
  );
}

function levelFromRow(row: any): number {
  if (!row) return 0;
  if (row.is_admin === true) return 0;
  const lvl = Number(row.ban_level ?? row.block_level ?? 0);
  if (lvl > 0) return lvl;
  const st = String(row.account_status ?? row.status ?? "");
  if (row.is_banned === true || st === "banned" || st === "suspended" || st === "banned_15") return 1;
  return 0;
}

/** Một lần kiểm tra ngầm. Trả về true nếu đã cưỡng chế đá ra. */
export async function checkBanNow(): Promise<boolean> {
  if (typeof window === "undefined" || fired || checking || isBlockedPath()) return false;
  checking = true;
  try {
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth?.session?.user?.id;
    if (!uid) return false;

    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("ban_level, is_banned, is_admin, account_status, status")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return false;

    const level = levelFromRow(data);
    if (level < 1) return false;

    // Admin không bao giờ bị đá.
    if (await isCurrentUserAdmin()) return false;

    fired = true;
    await applyBanLevel(level);
    return true;
  } catch {
    return false;
  } finally {
    checking = false;
  }
}

/**
 * Kiểm tra khóa THIẾT BỊ (Mức 3) — chạy cả khi CHƯA đăng nhập, nên tab ẩn danh
 * hoặc trình duyệt khác trên cùng máy cũng bị chặn dù không có cờ dính.
 * Chỉ dựa vào fingerprint phần cứng + cookie thiết bị, không dính dáng IP.
 */
export async function checkDeviceBanNow(): Promise<boolean> {
  if (typeof window === "undefined" || fired || isBlockedPath()) return false;
  if (isDeviceBlockedSticky()) {
    fired = true;
    await purgeSessionAndBlock();
    return true;
  }
  try {
    const fingerprint = getDeviceFingerprint();
    let cookieId: string | null = null;
    try { cookieId = getDeviceCookieId(); } catch { /* ignore */ }
    const blocked = await cachedQuery(
      `device_is_blocked:${fingerprint ?? ""}:${cookieId ?? ""}`,
      async () => {
        const { data, error } = await (supabase as any).rpc("device_is_blocked", {
          p_fingerprint: fingerprint,
          p_cookie: cookieId,
        });
        return !error && data === true;
      },
      60_000,
    );
    if (!blocked) return false;
    // Admin không bao giờ bị đá.
    if (await isCurrentUserAdmin()) return false;
    fired = true;
    await purgeSessionAndBlock();
    return true;
  } catch {
    return false;
  }
}

/** Bật watchdog toàn cục (idempotent). Trả về hàm dừng. */
export function startBanWatchdog(): () => void {
  if (typeof window === "undefined") return () => {};
  if (started) return () => {};
  started = true;

  const tick = () => {
    if (document.visibilityState !== "visible") return;
    void checkBanNow();
  };
  const deviceTick = () => {
    if (document.visibilityState !== "visible") return;
    void checkDeviceBanNow();
  };

  void checkBanNow();
  void checkDeviceBanNow();
  const stopBanPoll = visibleInterval(tick, POLL_MS);
  const stopDevicePoll = visibleInterval(deviceTick, DEVICE_POLL_MS);

  const runAll = () => { void checkBanNow(); void checkDeviceBanNow(); };
  const onVisible = () => { if (document.visibilityState === "visible") runAll(); };
  const onFocus = () => { runAll(); };
  const onPageShow = () => { runAll(); };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);

  return () => {
    stopBanPoll();
    stopDevicePoll();
    started = false;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onPageShow);
  };
}
