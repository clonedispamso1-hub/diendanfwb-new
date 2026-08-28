import { useEffect, useRef } from "react";
import { subscribeRealtime, pickNew } from "@/lib/realtime-registry";
import { usePostCard } from "./post-card-context";
import { bumpPostStats } from "@/lib/post-stats-batch";

/**
 * GiftedChip — "🎁 Được tặng: xxx xu".
 * Realtime: dùng registry chung (ref-count theo key) nên KHÔNG bao giờ gọi
 * `.on("postgres_changes")` sau `.subscribe()` dù có nhiều card cùng post.
 */
export function GiftedChip() {
  const { post, totalGifted, setTotalGifted, setGiftHistoryOpen } = usePostCard();
  const postId = post.id;
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!postId) return;
    const seen = seenRef.current;
    const apply = (giftId: string, amount: number) => {
      if (!amount || amount <= 0) return;
      if (giftId) {
        if (seen.has(giftId)) return;
        seen.add(giftId);
      }
      // Ghi vào cache dùng chung → Feed + Profile cùng cập nhật một lúc.
      bumpPostStats(postId, "gifts", amount);
    };

    // "post-gift:sent" đã được post-stats-batch xử lý (cache dùng chung).

    const off = subscribeRealtime({
      key: `post-gifts-${postId}`,
      topics: [{ table: "post_gifts", event: "INSERT", filter: `post_id=eq.${postId}` }],
      onChange: (payload) => {
        const row = pickNew(payload) as any;
        apply(String(row?.id || ""), Number(row?.amount) || 0);
      },
    });

    return () => {
      off();
    };
  }, [postId, setTotalGifted]);


  if (!totalGifted || totalGifted <= 0) return null;

  return (
    <button
      type="button"
      className="pc-gift-badge"
      onClick={() => setGiftHistoryOpen(true)}
      aria-label="Xem danh sách người đã tặng quà"
    >
      🎁 Được tặng {totalGifted.toLocaleString("vi-VN")} xu
    </button>
  );

}
