import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

interface Sender {
  gift_id: string;
  user_id: string;
  full_name: string | null;
  avatar: string | null;
  gift_key: string | null;
  gift_name: string | null;
  emoji: string | null;
  amount: number;
  created_at: string;
}

interface GiftSendersModalProps {
  postId: string;
  totalGifted: number;
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
}

/** Danh sách người đã tặng quà cho bài viết — RPC `post_gift_senders`. */
export function GiftSendersModal({
  postId,
  totalGifted,
  onClose,
  onViewProfile,
}: GiftSendersModalProps) {
  const [rows, setRows] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);

  useBodyScrollLock(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.rpc("post_gift_senders" as any, { p_post_id: postId });
      if (!alive) return;
      setLoading(false);
      if (error) return;
      setRows(((data as any[]) || []).map((r) => ({ ...r, amount: Number(r.amount) || 0 })));
    })();
    return () => {
      alive = false;
    };
  }, [postId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="gs-overlay" role="dialog" aria-modal="true" aria-label="Người đã tặng quà" onClick={onClose}>
      <div className="gs-modal gs-modal--list" onClick={(e) => e.stopPropagation()}>
        <header className="gs-head">
          <div>
            <h3 className="gs-title">🎁 Người đã tặng bài viết này</h3>
            <p className="gs-sub">Tổng: {totalGifted.toLocaleString("vi-VN")} xu</p>
          </div>
          <button type="button" className="gs-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>

        <div className="gs-body" data-scroll-lock-ignore>
        {loading ? (
          <div className="gs-loading">
            <Loader2 size={20} className="gs-spin" /> Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <div className="gs-loading">Chưa có ai tặng quà cho bài viết này.</div>
        ) : (
          <ul className="gs-senders">
            {rows.map((r) => (
              <li key={r.gift_id}>
                <button
                  type="button"
                  className="gs-sender"
                  onClick={() => (r.user_id ? onViewProfile?.(r.user_id) : undefined)}
                >
                  {r.avatar ? (
                    <img decoding="async" className="gs-sender-avatar" src={avatarSrc(r.avatar, 64)} alt="" loading="lazy" />
                  ) : (
                    <span className="gs-sender-avatar gs-sender-avatar--fallback" aria-hidden>
                      {(r.full_name || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="gs-sender-main">
                    <span className="gs-sender-name">{r.full_name || "Người dùng"}</span>
                    <span className="gs-sender-gift">
                      {r.emoji || "🎁"} {r.gift_name || "Quà"}
                    </span>
                  </span>
                  <span className="gs-sender-amount">+{r.amount.toLocaleString("vi-VN")} xu</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>

        <div className="gs-total">
          <span>Có tổng cộng</span>
          <strong>{totalGifted.toLocaleString("vi-VN")} xu</strong>
        </div>
      </div>
    </div>,
    document.body,
  );
}
