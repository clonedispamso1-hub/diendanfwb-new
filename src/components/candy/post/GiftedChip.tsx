import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { usePostCard } from "./post-card-context";

/**
 * GiftedChip — "🎁 Được tặng: xxx xu".
 * Realtime: lắng nghe INSERT trên `post_gifts` của đúng bài viết này (kèm
 * fallback sự kiện local khi chính mình vừa tặng) nên chip cập nhật ngay.
 * Bấm vào chip mở danh sách người đã tặng.
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
      setTotalGifted((v) => v + amount);
    };

    const onLocal = (e: Event) => {
      const d = (e as CustomEvent).detail as { postId?: string; giftId?: string; amount?: number };
      if (!d || d.postId !== postId) return;
      apply(String(d.giftId || ""), Number(d.amount) || 0);
    };
    window.addEventListener("post-gift:sent", onLocal as EventListener);

    const channel = supabase
      .channel(`post-gifts-${postId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_gifts", filter: `post_id=eq.${postId}` },
        (payload) => {
          const row = payload.new as any;
          apply(String(row?.id || ""), Number(row?.amount) || 0);
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener("post-gift:sent", onLocal as EventListener);
      void supabase.removeChannel(channel);
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
