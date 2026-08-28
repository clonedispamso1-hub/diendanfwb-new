import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { resolveUserName } from "@/lib/user-name";
import { getGiftByKey } from "@/components/candy/gift/gift-catalog";
import { formatRelativeTime } from "@/lib/time-format";

interface Sender {
  gift_id: string;
  user_id: string;
  full_name: string | null;
  username?: string | null;
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

/**
 * Danh sách người đã tặng quà cho bài viết.
 * Đọc trực tiếp `post_gifts` (Supabase #1) + `profiles` để hiển thị avatar,
 * tên, số xu và thời gian — RPC `post_gift_senders` không tồn tại trên DB.
 * Chỉ đọc, không tạo/đổi dữ liệu giao dịch.
 */
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
      // 1) Quà của bài viết
      const { data: gifts, error } = await supabase
        .from("post_gifts")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!alive) return;
      if (error || !gifts) {
        if (error) console.error("post_gifts load error:", error.message);
        setLoading(false);
        return;
      }

      const list = (gifts as any[]).map((g) => ({
        gift_id: String(g.id),
        user_id: String(g.sender_id || g.from_user_id || ""),
        amount: Number(g.amount) || 0,
        gift_key: g.gift_key ?? null,
        created_at: g.created_at,
      }));

      const senderIds = Array.from(new Set(list.map((g) => g.user_id).filter(Boolean)));
      
      // 2) Hồ sơ người tặng + 3) tên/emoji của quà
      const profRes = senderIds.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, username, avatar, badge_id, is_admin, role")
            .in("id", senderIds)
        : { data: [] as any[] };

      if (!alive) return;

      const profiles = new Map<string, any>(
        (((profRes as any).data as any[]) || []).map((p) => [String(p.id), p]),
      );
      // Tên/emoji quà lấy từ catalog trong app (bảng `gift_items` không tồn tại trên DB).

      setRows(
        list.map((g) => {
          const p = profiles.get(g.user_id);
          const item = getGiftByKey(g.gift_key);
          return {
            ...g,
            full_name: p?.full_name ?? null,
            username: p?.username ?? null,
            avatar: p?.avatar ?? null,
            gift_name: item?.name ?? null,
            emoji: item?.emoji ?? null,
          } as Sender;
        }),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [postId]);

  // Tổng phải khớp với dữ liệu thật; fallback về số đang hiển thị khi chưa tải xong.
  const sumFromRows = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const total = rows.length > 0 ? sumFromRows : totalGifted;

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
            <p className="gs-sub">Tổng: {total.toLocaleString("vi-VN")} xu</p>
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
                      {(resolveUserName(r as any, "?")).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="gs-sender-main">
                    <span className="gs-sender-name">{resolveUserName(r as any, "Người dùng")}</span>
                    <span className="gs-sender-gift">
                      {r.emoji || "🎁"} {r.gift_name || "Quà"} · {formatRelativeTime(r.created_at)}
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
          <strong>{total.toLocaleString("vi-VN")} xu</strong>
        </div>
      </div>
    </div>,
    document.body,
  );
}
