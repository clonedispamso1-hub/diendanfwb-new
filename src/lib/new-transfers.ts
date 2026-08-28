/**
 * Badge "chuyển tiền mới" cho icon Game Xu trên Floating Dock.
 *
 * - Đếm notification `wallet_transfer` (Supabase #3) gửi tới user hiện tại,
 *   trong 24 giờ gần nhất VÀ sau lần cuối user mở trang Rút tiền / Dòng tiền.
 * - Realtime INSERT trên `notifications` (filter user_id = me) → badge +1 ngay.
 * - Mở trang → markTransfersSeen() → badge biến mất.
 * - KHÔNG tạo bảng mới: dùng đúng dữ liệu notifications hiện có.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { db3 } from "@/lib/db/router";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEEN_KEY = "nfwb:transfers-seen-at";
export const NEW_TRANSFERS_EVENT = "nfwb:new-transfers-seen";

const TRANSFER_TYPES = ["wallet_transfer"];

function readSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.localStorage.getItem(SEEN_KEY) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

/** Gọi khi user mở trang Rút tiền / Dòng tiền → badge biến mất. */
export function markTransfersSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent(NEW_TRANSFERS_EVENT));
}

async function countNewTransfers(meId: string): Promise<number> {
  const since = new Date(Math.max(Date.now() - DAY_MS, readSeenAt())).toISOString();
  const { count, error } = await db3()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", meId)
    .in("type", TRANSFER_TYPES)
    .gt("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

/** Số giao dịch chuyển tiền mới chưa xem (24h). 0 khi chưa đăng nhập. */
export function useNewTransferCount(meId: string | null | undefined): number {
  const [count, setCount] = useState(0);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!meId) {
      setCount(0);
      return;
    }
    const n = await countNewTransfers(meId);
    if (aliveRef.current) setCount(n);
  }, [meId]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();

    const onSeen = () => setCount(0);
    window.addEventListener(NEW_TRANSFERS_EVENT, onSeen);

    const rt = db3();
    let channel: ReturnType<typeof rt.channel> | null = null;
    if (meId) {
      channel = rt
        .channel(`new-transfers-${meId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${meId}`,
          },
          (payload: any) => {
            const row = payload?.new || {};
            const kind = String(row.type || row.kind || "");
            if (!TRANSFER_TYPES.includes(kind)) return;
            setCount((c) => c + 1);
          },
        )
        .subscribe();
    }

    return () => {
      aliveRef.current = false;
      window.removeEventListener(NEW_TRANSFERS_EVENT, onSeen);
      if (channel) void rt.removeChannel(channel);
    };
  }, [meId, refresh]);

  return count;
}
