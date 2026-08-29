/**
 * Ban Realtime — lắng nghe Supabase Realtime trên hàng profiles của CHÍNH
 * tài khoản đang đăng nhập. Khi Admin (máy khác) đặt ban_level = 1 / 2 / 3,
 * event UPDATE bắn về trong < 1 giây:
 *   1) xoá sạch session / localStorage / sessionStorage / cache
 *   2) đóng toàn bộ realtime channel
 *   3) window.location.replace("/blocked")  ← KHÔNG cần F5
 *
 * Mức 3 còn đánh dấu THIẾT BỊ (device fingerprint phần cứng) bị khóa vĩnh viễn.
 * Tuyệt đối KHÔNG chặn theo IP.
 *
 * Không polling. Fail-open: lỗi kênh realtime không ảnh hưởng app.
 */
import { supabase } from "@/lib/db/router";
import { invalidateGateCache, markDeviceBlocked } from "@/lib/access-guard";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

/** Khóa localStorage PHẢI giữ lại khi xoá sạch (nếu mất → fingerprint đổi). */
const KEEP_KEYS = ["fwb_device_fp_v2", "fwb_dev_blk"];

function wipeStorage() {
  if (typeof window === "undefined") return;
  try {
    const keep: Array<[string, string]> = [];
    for (const k of KEEP_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) keep.push([k, v]);
    }
    localStorage.clear();
    for (const [k, v] of keep) localStorage.setItem(k, v);
  } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
}

function closeAllChannels() {
  try {
    supabase.getChannels().forEach((c) => { void supabase.removeChannel(c); });
  } catch { /* ignore */ }
}

function gotoBlocked() {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/blocked")) {
    window.location.replace("/blocked");
  }
}

/**
 * Mức 3 — khóa vĩnh viễn THIẾT BỊ: xoá sạch phiên + đánh dấu fingerprint +
 * đẩy sang /blocked NGAY (không cần F5).
 */
export async function purgeSessionAndBlock() {
  invalidateGateCache();
  // Giữ fingerprint hiện tại rồi mới đánh dấu (đọc trước khi wipe).
  try { getDeviceFingerprint(); } catch { /* ignore */ }
  markDeviceBlocked();
  closeAllChannels();
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
  wipeStorage();
  markDeviceBlocked();
  gotoBlocked();
}

/**
 * Mức 1 / 2 — đăng xuất tức thì, xoá sạch storage và sang /blocked ngay lập tức.
 * KHÔNG đánh dấu thiết bị (chỉ khóa tài khoản).
 */
export async function purgeSessionAndLock() {
  invalidateGateCache();
  closeAllChannels();
  try { await supabase.auth.signOut(); } catch { /* ignore */ }
  wipeStorage();
  gotoBlocked();
}

function levelFromRow(row: any): number {
  if (!row) return 0;
  if (row.is_admin === true) return 0;
  const status = String(row.account_status ?? row.status ?? "");
  let level = Number(row.ban_level ?? row.block_level ?? 0);
  if (
    level === 0 &&
    (row.is_banned === true || status === "banned" || status === "suspended" || status === "banned_15")
  ) {
    level = 1;
  }
  return level;
}

/** Áp dụng ngay quyết định ban theo level (dùng chung cho realtime + gate). */
export async function applyBanLevel(level: number) {
  if (level >= 3) return purgeSessionAndBlock();
  if (level >= 1) return purgeSessionAndLock();
}

/**
 * Bật kênh realtime cho 1 user. Trả về hàm huỷ đăng ký.
 * - profiles(id=uid) UPDATE → ban_level 1/2/3 áp dụng tức thì.
 * - blocked_devices INSERT (fingerprint của máy này) → mức 3 tức thì.
 */
export function watchBanRealtime(userId: string): () => void {
  if (typeof window === "undefined" || !userId) return () => {};

  const topic = `ban-watch:${userId}`;
  // Gỡ kênh cũ cùng tên (StrictMode mount 2 lần) để không .on() sau subscribe().
  try {
    supabase.getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => { void supabase.removeChannel(c); });
  } catch { /* ignore */ }

  let fingerprint = "";
  try { fingerprint = getDeviceFingerprint(); } catch { /* ignore */ }

  const channel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      (payload: any) => { void applyBanLevel(levelFromRow(payload?.new)); },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      (payload: any) => { void applyBanLevel(levelFromRow(payload?.new)); },
    );

  if (fingerprint) {
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "blocked_devices",
        filter: `fingerprint=eq.${fingerprint}`,
      },
      () => { void purgeSessionAndBlock(); },
    );
  }

  channel.subscribe();

  return () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
}

/**
 * Theo dõi khóa THIẾT BỊ khi CHƯA đăng nhập (tab ẩn danh / trình duyệt khác).
 * Chỉ dựa vào fingerprint phần cứng — không dính dáng IP.
 */
export function watchDeviceBanRealtime(): () => void {
  if (typeof window === "undefined") return () => {};
  let fingerprint = "";
  try { fingerprint = getDeviceFingerprint(); } catch { /* ignore */ }
  if (!fingerprint) return () => {};

  const topic = `device-ban-watch:${fingerprint}`;
  try {
    supabase.getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => { void supabase.removeChannel(c); });
  } catch { /* ignore */ }

  const channel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "blocked_devices",
        filter: `fingerprint=eq.${fingerprint}`,
      },
      () => { void purgeSessionAndBlock(); },
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
}
