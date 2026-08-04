/* ============================================================
   FavoritesPage — nội dung của tab "Yêu thích"
   2 tab con: ❤️ Đã yêu thích | 👀 Ai xem hồ sơ (hôm nay)
   - Chỉ query khi mở tab, pagination 20, không realtime.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import "@/styles/favorites-page.css";
import { unfollowUser } from "@/lib/follow-actions";
import {
  PEOPLE_PAGE_SIZE,
  fetchMyFavorites,
  fetchTodayViewers,
  formatWhen,
  markViewersSeen,
  type PersonRow,
} from "@/lib/profile-views";

type SubTab = "favorites" | "viewers";

interface Props {
  meId: string;
  onViewProfile: (userId: string) => void;
  onOpenChat?: (userId: string) => void;
  /** gọi khi người dùng đã xem tab "Ai xem hồ sơ" → tắt chấm đỏ */
  onViewersSeen?: () => void;
}

export function FavoritesPage({ meId, onViewProfile, onOpenChat, onViewersSeen }: Props) {
  const [tab, setTab] = useState<SubTab>("favorites");
  const [items, setItems] = useState<PersonRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (nextPage: number, reset: boolean) => {
      if (!meId) return;
      const id = ++reqId.current;
      setLoading(true);
      const rows =
        tab === "favorites"
          ? await fetchMyFavorites(meId, nextPage)
          : await fetchTodayViewers(meId, nextPage);
      if (id !== reqId.current) return;
      setItems((prev) => (reset ? rows : [...prev, ...rows]));
      setPage(nextPage);
      setDone(rows.length < PEOPLE_PAGE_SIZE);
      setLoading(false);
    },
    [meId, tab],
  );

  // Chỉ query khi đổi tab / mở tab.
  useEffect(() => {
    setItems([]);
    setDone(false);
    void load(0, true);
    if (tab === "viewers" && meId) {
      markViewersSeen(meId);
      onViewersSeen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, meId]);

  // Cuộn tới cuối mới load tiếp (IntersectionObserver — không polling).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading && !done) void load(page + 1, false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [page, loading, done, load]);

  const removeFavorite = async (userId: string) => {
    setItems((prev) => prev.filter((x) => x.id !== userId));
    try {
      await unfollowUser(meId, userId);
    } catch {
      /* im lặng */
    }
  };

  const subtitle = (p: PersonRow) => {
    const bits: string[] = [];
    if (p.age) bits.push(`${p.age} tuổi`);
    if (p.area) bits.push(p.area);
    const when = formatWhen(p.at);
    if (when) bits.push(when);
    return bits.join(" · ");
  };

  return (
    <div className="fav-page">
      <div className="fav-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "favorites"}
          className={`fav-subtab${tab === "favorites" ? " is-active" : ""}`}
          onClick={() => setTab("favorites")}
        >
          Đã yêu thích
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "viewers"}
          className={`fav-subtab${tab === "viewers" ? " is-active" : ""}`}
          onClick={() => setTab("viewers")}
        >
          Ai xem hồ sơ
        </button>
      </div>

      {items.length === 0 && !loading ? (
        <p className="fav-empty">
          {tab === "favorites"
            ? "Bạn chưa yêu thích ai."
            : "Hôm nay chưa có ai xem hồ sơ của bạn."}
        </p>
      ) : (
        <ul className="fav-list">
          {items.map((p) => (
            <li key={p.id} className="fav-card">
              <img
                className="fav-avatar"
                loading="lazy"
                decoding="async"
                src={p.avatar || "/placeholder.svg"}
                alt=""
                onClick={() => onViewProfile(p.id)}
              />
              <div className="fav-info">
                <div className="fav-name">{p.name}</div>
                <div className="fav-sub">{subtitle(p)}</div>
              </div>
              <div className="fav-actions">
                <button type="button" className="fav-btn" onClick={() => onViewProfile(p.id)}>
                  Xem hồ sơ
                </button>
                <button
                  type="button"
                  className="fav-btn fav-btn--primary"
                  onClick={() => onOpenChat?.(p.id)}
                >
                  Nhắn tin
                </button>
                {tab === "favorites" && (
                  <button
                    type="button"
                    className="fav-btn fav-btn--danger"
                    onClick={() => void removeFavorite(p.id)}
                  >
                    Bỏ yêu thích
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {loading && <p className="fav-loading">Đang tải…</p>}
      {!done && !loading && items.length > 0 && <div ref={sentinelRef} style={{ height: 1 }} />}
    </div>
  );
}
