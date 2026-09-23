/**
 * gem-realtime-bridge — cầu nối Realtime cho XU / GEM (không polling).
 *
 * Nhiệm vụ (chạy ở MỌI trang, vì được mount trong <NotificationProvider/>):
 *  1. Nghe INSERT `gem_transactions` (to_id = tôi)  → cộng xu ngay + popup.
 *  2. Nghe INSERT `coin_transactions` (user_id = tôi) → cộng xu ngay + popup.
 *  3. Nghe INSERT `notifications` (user_id = tôi) → popup thông báo ngay.
 *
 * Không tạo bảng mới, không đổi RLS, không polling: chỉ dùng
 * `realtime-registry` (1 channel duy nhất / user, ref-count, filter server-side).
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/candy/auth-provider";
import { subscribeRealtime, pickNew } from "@/lib/realtime-registry";
import { fetchProfileById } from "@/lib/profile-cache";
import { supabase } from "@/lib/supabase";
import { playNotifySound, emitNotifyBump } from "@/lib/notify-sound";

type Notify = (n: {
  title: string;
  message: string;
  type?: "info" | "success" | "candy" | "message" | "follow";
  avatarUrl?: string | null;
  onClick?: () => void;
}) => void;

const isIncomingCoinType = (t: string | null | undefined) => {
  const v = (t || "").toLowerCase();
  return (
    v.includes("gem") ||
    v.includes("coin") ||
    v.includes("xu") ||
    v.includes("gift") ||
    v.includes("transfer")
  );
};

/** Thông báo phát sinh từ tin nhắn chat (đã có popup Messenger-style riêng). */
const isChatMessageNotification = (
  row: Record<string, any>,
  title: string,
  message: string,
) => {
  const t = String(row.type ?? row.kind ?? "").toLowerCase();
  if (/message|chat|\bdm\b|inbox/.test(t)) return true;
  const text = `${title} ${message}`.toLowerCase();
  return text.includes("tin nhắn");
};

export function GemRealtimeBridge({ notify }: { notify: Notify }) {
  const { me, applyGemDelta, setGemBalance } = useAuth();
  const userId = me?.id ?? null;
  // Chống popup / cộng xu trùng khi nhiều sự kiện cùng mô tả 1 giao dịch.
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    seen.current = new Set();
    let alive = true;

    const once = (key: string) => {
      if (seen.current.has(key)) return false;
      seen.current.add(key);
      if (seen.current.size > 200) {
        seen.current = new Set(Array.from(seen.current).slice(-100));
      }
      return true;
    };

    /** Đồng bộ lại số dư thật (1 cột duy nhất — cực nhẹ) để tránh lệch. */
    const syncBalance = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("gem_balance")
          .eq("id", userId)
          .maybeSingle();
        const bal = Number((data as any)?.gem_balance);
        if (alive && Number.isFinite(bal)) setGemBalance(bal);
      } catch {
        /* im lặng — số dư lạc quan ở trên vẫn đúng trong hầu hết trường hợp */
      }
    };

    const senderName = async (id: string | null | undefined) => {
      if (!id) return "Một thành viên";
      try {
        const p = await fetchProfileById(id);
        return (p?.display_name || p?.full_name || p?.username || "Một thành viên") as string;
      } catch {
        return "Một thành viên";
      }
    };

    const off = subscribeRealtime({
      key: `gem-bridge-${userId}`,
      topics: [
        { table: "gem_transactions", event: "INSERT", filter: `to_id=eq.${userId}` },
        { table: "coin_transactions", event: "INSERT", filter: `user_id=eq.${userId}` },
        { table: "notifications", event: "INSERT", filter: `user_id=eq.${userId}` },
      ],
      onChange: (payload, topicIndex) => {
        if (!alive) return;
        const row = pickNew(payload) as Record<string, any> | undefined;
        if (!row) return;

        // --- 1) Tặng xu / chuyển xu qua gem_transactions ---
        if (topicIndex === 0) {
          const amount = Number(row.amount ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) return;
          if (!once(`gem:${row.id ?? `${row.from_id}-${row.created_at}`}`)) return;
          applyGemDelta(amount);
          void syncBalance();
          void (async () => {
            const name = await senderName(row.from_id);
            if (!alive) return;
            notify({
              type: "candy",
              title: `+${amount.toLocaleString("vi-VN")} xu`,
              message: `${name} vừa chuyển xu cho bạn.`,
            });
          })();
          playNotifySound();
          emitNotifyBump();
          window.dispatchEvent(new CustomEvent("app:gem-received", { detail: row }));
          return;
        }

        // --- 2) coin_transactions (RPC transfer_balance) ---
        if (topicIndex === 1) {
          const amount = Number(row.amount ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) return;
          if (!once(`coin:${row.id ?? row.created_at}`)) return;
          applyGemDelta(amount);
          void syncBalance();
          notify({
            type: "candy",
            title: `+${amount.toLocaleString("vi-VN")} xu`,
            message: "Bạn vừa nhận được xu.",
          });
          window.dispatchEvent(new CustomEvent("app:gem-received", { detail: row }));
          return;
        }

        // --- 3) notifications: popup ngay lập tức ---
        const nid = String(row.id ?? "");
        if (!once(`notif:${nid}`)) return;
        const title = (row.title as string) || "Thông báo mới";
        const message = (row.message as string) || "";
        // Tin nhắn chat đã có popup Messenger-style riêng (app-shell) → KHÔNG
        // hiện thêm popup "Thông báo mới" để tránh 2 hệ thống thông báo trùng.
        if (isChatMessageNotification(row, title, message)) {
          playNotifySound();
          emitNotifyBump();
          return;
        }
        // --- Thông báo theo dõi ("đã theo dõi bạn"): popup kèm avatar + tên ---
        const kind = String(row.type ?? row.kind ?? "").toLowerCase();
        const dataOpen = String((row.data as any)?.open ?? "").toLowerCase();
        const isFollow = kind.includes("follow") || dataOpen === "followers";
        if (isFollow) {
          void (async () => {
            const actorId =
              (row.last_actor_id as string) ||
              (row.actor_ids as any)?.[0] ||
              ((row.data as any)?.follower_id as string) ||
              null;
            let name = "Một thành viên";
            let avatar: string | null = null;
            if (actorId) {
              try {
                const p = await fetchProfileById(actorId);
                name = (p?.display_name || p?.full_name || p?.username || name) as string;
                avatar = ((p as any)?.avatar ?? null) as string | null;
              } catch {
                /* giữ fallback */
              }
            }
            if (!alive) return;
            notify({
              type: "follow",
              title: name,
              message: "đã theo dõi bạn",
              avatarUrl: avatar,
              // Bấm vào popup → mở thẳng màn hình "Theo dõi tôi" hiện có.
              onClick: () =>
                window.dispatchEvent(new CustomEvent("app:open-followers")),
            });
          })();
          playNotifySound();
          emitNotifyBump();
          return;
        }
        const isCoinReward = isIncomingCoinType(row.type ?? row.kind);
        notify({
          type: isCoinReward ? "candy" : "info",
          title,
          message,
          // Quà / xu (vd: "💎 Admin đã tặng bạn một Kim Cương… Bấm Nhận…"):
          // bấm vào popup CHỈ mở mục Thông báo (panel sẵn có) — KHÔNG tự claim.
          // Xu chỉ được cộng khi user bấm nút "Nhận" bên trong panel đó.
          onClick: isCoinReward
            ? () => window.dispatchEvent(new CustomEvent("app:open-notifications"))
            : undefined,
        });
        // Bình luận / tặng quà: kêu 1 tiếng ngắn + nảy số trên chuông NGAY.
        playNotifySound();
        emitNotifyBump();
        // Thông báo liên quan tới xu → đồng bộ số dư ngay, không chờ.
        if (isIncomingCoinType(row.type ?? row.kind)) void syncBalance();
      },
    });

    // Khi quay lại tab (mạng vừa mất / socket vừa nối lại) → đồng bộ 1 lần.
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncBalance();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [userId, applyGemDelta, setGemBalance, notify]);

  return null;
}
