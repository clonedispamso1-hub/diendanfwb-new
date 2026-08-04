import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { X, MessageCircle, Crown, Heart, Sparkles, Lock } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { getFollowSet, getFollowSetServer, subscribeFollow } from "@/lib/follow-store";
import { loadFwbFakeProfiles, type FakeProfileRecord } from "@/lib/fake-profiles";
import UniversalBadge from "@/components/candy/universal-badge";

type Tab = "liked" | "likedYou" | "matches";

interface LikedSheetProps {
  onClose: () => void;
  onOpenChat: (userId: string) => void;
  viewerProvince: string | null;
  isVip: boolean;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function LikedSheet({ onClose, onOpenChat, viewerProvince, isVip }: LikedSheetProps) {
  useBodyScrollLock(true);
  const [tab, setTab] = useState<Tab>("liked");
  const likedIds = useSyncExternalStore(subscribeFollow, getFollowSet, getFollowSetServer);
  const [pool, setPool] = useState<FakeProfileRecord[]>([]);

  useEffect(() => {
    let alive = true;
    void loadFwbFakeProfiles({ province: viewerProvince, limit: 80 }).then((rows) => {
      if (alive) setPool(rows);
    });
    return () => { alive = false; };
  }, [viewerProvince]);

  const byId = useMemo(() => {
    const m = new Map<string, FakeProfileRecord>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  const liked = useMemo(() =>
    [...likedIds].map((id) => byId.get(id)).filter(Boolean) as FakeProfileRecord[],
  [likedIds, byId]);

  // Simulated "đã thích bạn" — 25% of pool, deterministic by id
  const likedYou = useMemo(() =>
    pool.filter((p) => (hashId(p.id + ":liked-you") % 100) < 25),
  [pool]);

  // Matches = intersection (mutual)
  const matches = useMemo(() =>
    liked.filter((p) => (hashId(p.id + ":liked-you") % 100) < 25),
  [liked]);

  const tabs: Array<{ key: Tab; label: string; count: number; icon: string }> = [
    { key: "liked",    label: "Đã thích",     count: liked.length,    icon: "❤️" },
    { key: "likedYou", label: "Đã thích bạn", count: likedYou.length, icon: "💖" },
    { key: "matches",  label: "Ghép đôi",     count: matches.length,  icon: "🔥" },
  ];

  return (
    <Portal>
      <div className="fwb-liked-backdrop" onClick={onClose}>
        <div className="fwb-liked-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <header className="fwb-liked-head">
            <h2><Heart size={18} fill="#ff5b8a" stroke="#ff5b8a" /> Kết nối của bạn</h2>
            <button onClick={onClose} aria-label="Đóng" className="fwb-liked-x"><X size={18} /></button>
          </header>

          <nav className="fwb-liked-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={`fwb-liked-tab${tab === t.key ? " is-active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                <span>{t.icon}</span> {t.label}
                <em>{t.count}</em>
              </button>
            ))}
          </nav>

          <div className="fwb-liked-body">
            {tab === "liked" && <LikedGrid items={liked} onOpenChat={onOpenChat} viewerProvince={viewerProvince} emptyText="Bạn chưa thích ai. Vuốt phải để bắt đầu!" />}
            {tab === "likedYou" && (
              isVip
                ? <LikedGrid items={likedYou} onOpenChat={onOpenChat} viewerProvince={viewerProvince} emptyText="Chưa có ai thích bạn. Hãy cập nhật ảnh đẹp hơn nhé!" />
                : <VipGate count={likedYou.length} items={likedYou.slice(0, 6)} />
            )}
            {tab === "matches" && <LikedGrid items={matches} onOpenChat={onOpenChat} viewerProvince={viewerProvince} emptyText="Chưa có cặp đôi nào. Tiếp tục vuốt để ghép đôi 🔥" highlight />}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function LikedGrid({
  items, onOpenChat, viewerProvince, emptyText, highlight,
}: {
  items: FakeProfileRecord[];
  onOpenChat: (id: string) => void;
  viewerProvince: string | null;
  emptyText: string;
  highlight?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="fwb-liked-empty">
        <Sparkles size={32} />
        <p>{emptyText}</p>
      </div>
    );
  }
  return (
    <ul className="fwb-liked-grid">
      {items.map((p) => {
        const avatar = p.avatar_url || p.avatar || "/placeholder.svg";
        const province = p.province || viewerProvince || "—";
        const age = (p as any).age || (20 + (hashId(p.id) % 13));
        const lastActive = ["vừa online", "5 phút trước", "đang xem hồ sơ", "1 giờ trước"][hashId(p.id) % 4];
        return (
          <li key={p.id} className={`fwb-liked-card${highlight ? " is-match" : ""}`}>
            <div className="fwb-liked-card__media">
              <img src={avatar} alt={p.display_name || ""} loading="lazy" />
              {highlight ? <span className="fwb-liked-card__match-tag">🔥 Ghép đôi</span> : null}
            </div>
            <div className="fwb-liked-card__body">
              <div className="fwb-liked-card__name">
                {p.display_name || p.full_name || p.username}
                <UniversalBadge
                  profile={{
                    id: p.id,
                    badge_id: (p as any).badge_id ?? null,
                    is_virtual: (p as any).is_virtual ?? true,
                    province,
                  }}
                />
                <span>{age}</span>
              </div>
              <div className="fwb-liked-card__meta">📍 {province} · {lastActive}</div>
              <button className="fwb-liked-card__chat" onClick={() => onOpenChat(p.id)}>
                <MessageCircle size={14} /> Nhắn tin
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function VipGate({ count, items }: { count: number; items: FakeProfileRecord[] }) {
  return (
    <div className="fwb-liked-vipgate">
      <div className="fwb-liked-vipgate__previews">
        {items.map((p) => (
          <div key={p.id} className="fwb-liked-vipgate__thumb">
            <img loading="lazy" decoding="async" src={p.avatar_url || p.avatar || "/placeholder.svg"} alt="" />
            <span className="fwb-liked-vipgate__lock"><Lock size={14} /></span>
          </div>
        ))}
      </div>
      <Crown size={36} color="#f0c14b" />
      <h3>{count} người đã thích bạn</h3>
      <p>Nâng cấp VIP để xem ai đã thích, nhắn tin trước & xuất hiện ưu tiên trong Discovery.</p>
      <ul className="fwb-liked-vipgate__perks">
        <li>👀 Xem ai đã thích bạn</li>
        <li>♾️ Vuốt không giới hạn</li>
        <li>🚀 Boost hồ sơ +10× lượt xem</li>
        <li>🎯 Bộ lọc nâng cao</li>
      </ul>
      <button className="fwb-liked-vipgate__cta">
        <Crown size={16} /> Nâng cấp VIP ngay
      </button>
    </div>
  );
}
