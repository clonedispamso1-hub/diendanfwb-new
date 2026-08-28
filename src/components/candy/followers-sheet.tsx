import { useOverlayAutoClose } from "@/lib/modal-manager";
import { Portal } from "@/components/candy/portal";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Sparkles, Search } from "lucide-react";
import { List, type RowComponentProps } from "react-window";
import { supabase } from "@/lib/supabase";
import UniversalBadge from "@/components/candy/universal-badge";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { loadFakeFollowers } from "@/lib/buff-followers";
import { toggleFollow } from "@/lib/follow-actions";
import {
  getFollowingSet,
  refreshFollowingSet,
  setFollowingCached,
} from "@/lib/follow-set-cache";
import { useAuth } from "@/components/candy/auth-provider";
import { bumpFollowerCount } from "@/lib/follow-count-store";
import { isNewFollower, markFollowersSeen } from "@/lib/new-followers";
import type { FakeFollowerJoined } from "@/integrations/supabase/fake-types";

import { read3 } from "@/lib/content-db";
import { resolveUserName } from "@/lib/user-name";
import { deriveUid } from "@/lib/user-uid";
import { AppLoading } from "@/components/candy/app-loading";

interface FollowerItem {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  vip_level: number | null;
  location: string | null;
  /** Mã UID công khai (hiển thị thay cho khu vực). */
  public_id: string | null;
  isFake: boolean;
  /** Thời điểm follow — dùng cho nhãn NEW trong 24 giờ. */
  followedAt?: string | null;
}

interface FollowersSheetProps {
  userId: string;
  followersCount: number;
  initialTab?: "followers" | "following";
  onClose: () => void;
  onSelect: (id: string) => void;
}

const ROW_HEIGHT = 72;
/** Số dòng mỗi lần nạp — cắt payload so với .limit(1000) trước đây. */
const PAGE_SIZE = 40;
type TabKey = "followers" | "following";

export function FollowersSheet({ userId, followersCount, initialTab = "followers", onClose, onSelect }: FollowersSheetProps) {
  // Modal manager: tự đóng khi có popup lớp cao hơn (vd: Hồ sơ) được mở.
  useOverlayAutoClose(true, onClose, "followers-sheet");
  useBodyScrollLock(true);
  // Người đang đăng nhập (có thể khác `userId` khi đang xem hồ sơ người khác).
  const { me } = useAuth();
  const currentUserId = me?.id ?? null;
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [followersReal, setFollowersReal] = useState<FollowerItem[]>([]);
  const [followersFake, setFollowersFake] = useState<FollowerItem[]>([]);
  const [followingItems, setFollowingItems] = useState<FollowerItem[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(true);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreFollowers, setHasMoreFollowers] = useState(false);
  const [hasMoreFollowing, setHasMoreFollowing] = useState(false);

  const followersItems = useMemo(
    () => [...followersReal, ...followersFake],
    [followersReal, followersFake],
  );

  // Con trỏ phân trang (Egress: chỉ kéo đúng 1 trang mỗi lần).
  const realOffset = useRef(0);
  const fakeOffset = useRef(0);
  const followingOffset = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /** 1 trang followers thật: follows(range) → profiles(chỉ id của trang đó). */
  const fetchFollowersPage = async (offset: number) => {
    const from = offset;
    const to = offset + PAGE_SIZE - 1;
    let followRows: Array<{ follower_id: string; created_at?: string | null }> = [];
    const withTime = await read3()
      .from("follows")
      .select("follower_id, created_at")
      .eq("following_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (withTime.error) {
      const plain = await read3()
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId)
        .range(from, to);
      followRows = (plain.data ?? []) as any[];
    } else {
      followRows = (withTime.data ?? []) as any[];
    }
    const followedAtById = new Map<string, string | null>(
      followRows.map((r) => [r.follower_id, r.created_at ?? null]),
    );
    const followerIds = followRows.map((row) => row.follower_id);
    let items: FollowerItem[] = [];
    if (followerIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar, vip_level, location, public_id")
        .in("id", followerIds);
      items = (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name ?? null,
        username: p.username ?? null,
        avatar: p.avatar ?? null,
        vip_level: p.vip_level ?? 0,
        location: p.location ?? null,
        public_id: (p as any).public_id ?? null,
        isFake: false,
        followedAt: followedAtById.get(p.id) ?? null,
      }));
      items.sort((a, b) => Date.parse(b.followedAt || "") - Date.parse(a.followedAt || "") || 0);
    }
    return { items, full: followRows.length >= PAGE_SIZE };
  };

  /** 1 trang followers ảo. */
  const fetchFakePage = async (offset: number) => {
    let fakeRows: FakeFollowerJoined[] = [];
    try {
      fakeRows = await loadFakeFollowers(userId, { from: offset, to: offset + PAGE_SIZE - 1 });
    } catch {
      fakeRows = [];
    }
    const items: FollowerItem[] = fakeRows
      .filter((row) => row.fake_profile)
      .map((row) => ({
        id: `fake-${row.id}`,
        full_name: row.fake_profile.display_name || row.fake_profile.full_name || null,
        username: row.fake_profile.username,
        avatar: row.fake_profile.avatar_url || row.fake_profile.avatar || null,
        vip_level: row.fake_profile.vip_level ?? 0,
        location: localeLabel(row.fake_profile.locale),
        public_id: (row.fake_profile as any).public_id ?? null,
        isFake: true,
        followedAt: row.created_at ?? null,
      }));
    return { items, full: fakeRows.length >= PAGE_SIZE };
  };

  /** 1 trang "đang theo dõi". */
  const fetchFollowingPage = async (offset: number) => {
    const { data: followRows } = await read3()
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = (followRows ?? []) as any[];
    const ids = rows.map((r) => r.following_id);
    let items: FollowerItem[] = [];
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar, vip_level, location, public_id")
        .in("id", ids);
      items = (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name ?? null,
        username: p.username ?? null,
        avatar: p.avatar ?? null,
        vip_level: p.vip_level ?? 0,
        location: p.location ?? null,
        public_id: (p as any).public_id ?? null,
        isFake: false,
      }));
    }
    return { items, full: rows.length >= PAGE_SIZE };
  };

  // Trang đầu của tab "Theo dõi tôi".
  useEffect(() => {
    setLoadingFollowers(true);
    setFollowersReal([]);
    setFollowersFake([]);
    realOffset.current = 0;
    fakeOffset.current = 0;
    (async () => {
      try {
        const real = await fetchFollowersPage(0);
        const fake = real.full ? { items: [] as FollowerItem[], full: true } : await fetchFakePage(0);
        if (!aliveRef.current) return;
        setFollowersReal(real.items);
        setFollowersFake(fake.items);
        realOffset.current = real.full ? PAGE_SIZE : -1;
        fakeOffset.current = real.full ? 0 : fake.items.length;
        setHasMoreFollowers(real.full || fake.full);
      } finally {
        if (aliveRef.current) setLoadingFollowers(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Lazy: chỉ tải khi người dùng mở tab này (tiết kiệm Egress).
  const followingLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "following") return;
    if (followingLoadedFor.current === userId) return;
    followingLoadedFor.current = userId;
    setLoadingFollowing(true);
    followingOffset.current = 0;
    (async () => {
      try {
        const page = await fetchFollowingPage(0);
        if (!aliveRef.current) return;
        setFollowingItems(page.items);
        followingOffset.current = PAGE_SIZE;
        setHasMoreFollowing(page.full);
      } finally {
        if (aliveRef.current) setLoadingFollowing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab]);

  /** Nút "Tải thêm" — nạp thêm đúng 1 trang. */
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (tab === "following") {
        const page = await fetchFollowingPage(followingOffset.current);
        if (!aliveRef.current) return;
        setFollowingItems((prev) => [...prev, ...page.items]);
        followingOffset.current += PAGE_SIZE;
        setHasMoreFollowing(page.full);
        return;
      }
      if (realOffset.current >= 0) {
        const real = await fetchFollowersPage(realOffset.current);
        if (!aliveRef.current) return;
        setFollowersReal((prev) => [...prev, ...real.items]);
        if (real.full) {
          realOffset.current += PAGE_SIZE;
          setHasMoreFollowers(true);
          return;
        }
        realOffset.current = -1;
      }
      const fake = await fetchFakePage(fakeOffset.current);
      if (!aliveRef.current) return;
      setFollowersFake((prev) => [...prev, ...fake.items]);
      fakeOffset.current += PAGE_SIZE;
      setHasMoreFollowers(fake.full);
    } finally {
      if (aliveRef.current) setLoadingMore(false);
    }
  };




  // Mở tab "Người theo dõi" → badge đỏ trên Floating Dock biến mất.
  useEffect(() => {
    if (tab === "followers") markFollowersSeen();
  }, [tab]);

  const [query, setQuery] = useState("");
  // Tập hợp những người MÌNH (người đang đăng nhập) đang theo dõi.
  // Dùng CHUNG follow-set cache (getFollowingSet) cho CẢ HAI tab, nên nút
  // Follow/Unfollow luôn đúng ở tab "Theo dõi tôi" lẫn "Đang theo dõi",
  // kể cả khi tab "Đang theo dõi" chưa được mở (chưa có followingItems).
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  // Nạp lần đầu / sau reload: 1 query duy nhất, có TTL + gộp request.
  useEffect(() => {
    if (!currentUserId) {
      setFollowingSet(new Set());
      return;
    }
    let alive = true;
    void getFollowingSet(currentUserId).then((s) => {
      if (alive) setFollowingSet(new Set(s));
    });
    return () => {
      alive = false;
    };
  }, [currentUserId]);

  // Realtime + hành động ở component khác: follow-actions bắn `nfwb:follow-change`
  // (kèm actorId) cho mọi thay đổi, kể cả từ Postgres realtime.
  useEffect(() => {
    if (typeof window === "undefined" || !currentUserId) return;
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ targetId?: string; following?: boolean; actorId?: string | null }>).detail;
      if (!d?.targetId || typeof d.following !== "boolean") return;
      if (d.actorId && d.actorId !== currentUserId) return;
      setFollowingSet((prev) => {
        if (prev.has(d.targetId!) === d.following) return prev;
        const next = new Set(prev);
        if (d.following) next.add(d.targetId!);
        else next.delete(d.targetId!);
        return next;
      });
    };
    window.addEventListener("nfwb:follow-change", onChange);
    return () => window.removeEventListener("nfwb:follow-change", onChange);
  }, [currentUserId]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const onToggleFollow = async (targetUserId: string) => {
    if (!currentUserId || targetUserId === currentUserId) return;
    setBusyId(targetUserId);
    const cur = followingSet.has(targetUserId);
    // Optimistic để nút phản hồi tức thì.
    setFollowingSet((prev) => {
      const s2 = new Set(prev);
      if (cur) s2.delete(targetUserId);
      else s2.add(targetUserId);
      return s2;
    });
    try {
      const next = await toggleFollow(currentUserId, targetUserId, cur);
      // Trạng thái THẬT từ server là nguồn duy nhất.
      setFollowingSet((prev) => {
        const s2 = new Set(prev);
        if (next) s2.add(targetUserId);
        else s2.delete(targetUserId);
        return s2;
      });
      setFollowingCached(targetUserId, next);
      bumpFollowerCount(targetUserId, next ? 1 : -1);
      // Đồng bộ danh sách "Đang theo dõi" nếu đang xem chính mình.
      if (userId === currentUserId) {
        setFollowingItems((prev) =>
          next ? prev : prev.filter((i) => i.id !== targetUserId),
        );
        if (next) followingLoadedFor.current = null;
      }
      // Cache dùng chung khớp lại với DB (bỏ TTL, vẫn gộp query).
      const fresh = await refreshFollowingSet(currentUserId);
      setFollowingSet(new Set(fresh));
    } catch {
      // Rollback khi lỗi (toast đã hiển thị ở follow-actions).
      setFollowingSet((prev) => {
        const s2 = new Set(prev);
        if (cur) s2.add(targetUserId);
        else s2.delete(targetUserId);
        return s2;
      });
    } finally {
      setBusyId(null);
    }
  };


  const allItems = tab === "followers" ? followersItems : followingItems;
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) =>
      `${i.full_name ?? ""} ${i.username ?? ""}`.toLowerCase().includes(q),
    );
  }, [allItems, query]);
  const loading = tab === "followers" ? loadingFollowers : loadingFollowing;
  const total = useMemo(
    () => (tab === "followers"
      ? Math.max(followersCount || 0, followersItems.length)
      : followingItems.length),
    [tab, followersItems.length, followingItems.length, followersCount]
  );

  return (
    <Portal>
    <div
      data-lv-layer="modal"
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card text-foreground shadow-2xl animate-in slide-in-from-bottom-6 duration-300"
        style={{
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          height: "80vh",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted" />
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b">
          <h3 className="text-base font-semibold">
            {tab === "followers" ? "Theo dõi tôi" : "Đang theo dõi"} ({total.toLocaleString()})
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div role="tablist" style={{ display: "flex", gap: 4, padding: "4px 14px 0", borderBottom: "1px solid hsl(var(--border))" }}>
          <FollowTab
            active={tab === "following"}
            label={`Đang theo dõi${followingItems.length ? ` · ${followingItems.length}` : ""}`}
            onClick={() => setTab("following")}
          />
          <FollowTab
            active={tab === "followers"}
            label={`Theo dõi tôi${followersItems.length ? ` · ${followersItems.length}` : ""}`}
            onClick={() => setTab("followers")}
          />
        </div>

        <div style={{ padding: "10px 14px 6px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            border: "1px solid hsl(var(--border))", borderRadius: 999,
            padding: "8px 12px", background: "hsl(var(--muted) / .5)",
          }}>
            <Search size={16} style={{ opacity: .6, flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm…"
              aria-label="Tìm kiếm"
              style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontSize: 14, color: "inherit" }}
            />
          </div>
        </div>

        <div
          data-scroll-lock-ignore
          style={{
            padding: 0,
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-y",
          }}
        >

          {loading ? (
            <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
              <AppLoading label="Đang tải danh sách…" />
            </div>

          ) : items.length === 0 ? (
            <p className="muted-copy" style={{ padding: 16 }}>
              {tab === "followers" ? "Chưa có người yêu thích." : "Chưa yêu thích ai."}
            </p>
          ) : (
            <>
              <div style={{ height: items.length * ROW_HEIGHT + 8, padding: "4px 0" }}>
                <List
                  rowCount={items.length}
                  rowHeight={ROW_HEIGHT}
                  rowProps={{ items, onSelect, onClose, meId: currentUserId, followingSet, busyId, onToggleFollow, tab }}
                  rowComponent={FollowerRow}
                  overscanCount={6}
                  style={{ height: "100%", width: "100%" }}
                />
              </div>
              {(tab === "followers" ? hasMoreFollowers : hasMoreFollowing) && !query && (
                <div style={{ padding: "4px 14px 16px" }}>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="list-row-button"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--muted) / .4)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loadingMore ? "default" : "pointer",
                    }}
                  >
                    {loadingMore ? "Đang tải…" : "Tải thêm"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );

}

function FollowTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        position: "relative",
        flex: 1,
        padding: "10px 8px",
        background: "transparent",
        border: "none",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
        transition: "color .2s",
      }}
    >
      {label}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: -1,
          height: 3,
          borderRadius: 999,
          background: "hsl(var(--foreground))",
          opacity: active ? 1 : 0,
          transform: active ? "scaleX(1)" : "scaleX(0)",
          transition: "all .2s",
        }}
      />
    </button>
  );
}

type RowProps = {
  items: FollowerItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
  meId: string | null;
  followingSet: Set<string>;
  busyId: string | null;
  onToggleFollow: (id: string) => void;
  tab: TabKey;
};

function FollowerRow({ index, style, items, onSelect, onClose, meId, followingSet, busyId, onToggleFollow, tab, ariaAttributes }: RowComponentProps<RowProps>) {
  const item = items[index];
  if (!item) return null;
  const handleClick = () => {
    if (item.isFake) return;
    onSelect(item.id);
    onClose();
  };
  return (
    <div
      style={{ ...style, padding: "4px 14px" }}
      {...ariaAttributes}
    >
      <button
        type="button"
        className="list-row list-row-button"
        onClick={handleClick}
        disabled={item.isFake}
        style={{
          width: "100%",
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: item.isFake ? "default" : "pointer",
          opacity: item.isFake ? 0.95 : 1,
        }}
      >
        <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
          <AvatarGlow
            avatar={item.avatar || null}
            userId={item.isFake ? null : item.id}
            size={44}
            alt={resolveUserName(item as any, "Tài khoản")}
            imgClassName="avatar-md"
          />
          {isNewFollower(item.followedAt) ? (
            <span
              title="Vừa theo dõi trong 24 giờ qua"
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: 0.3,
                color: "#fff",
                padding: "2px 5px",
                borderRadius: 999,
                background: "linear-gradient(140deg,#ff5f6d,#ff3b30)",
                boxShadow: "0 0 0 2px hsl(var(--card)), 0 4px 10px -4px rgba(255,59,48,.9)",
              }}
            >
              NEW
            </span>
          ) : null}
        </span>
        <div className="stack-xs grow text-left" style={{ minWidth: 0, flex: 1 }}>
          <div className="inline-flex items-center gap-2 flex-wrap" style={{ gap: 6 }}>
            <span
              className="row-title"
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 220,
              }}
            >
              {resolveUserName(item as any, "Người dùng")}
            </span>
            {item.isFake ? (
              <span
                title="Nick được hệ thống tạo để hỗ trợ hiển thị"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: "hsl(335 80% 95%)",
                  color: "hsl(340 60% 45%)",
                  border: "1px solid hsl(335 70% 88%)",
                }}
              >
                <Sparkles size={10} /> Fan
              </span>
            ) : (
              <UniversalBadge profile={item as any} />
            )}
          </div>
          <span className="row-meta">
            {/* CHỈ hiện UID — không bao giờ lộ UUID thật của tài khoản. */}
            {`UID: ${item.public_id || deriveUid(item.isFake ? item.id.replace(/^fake-/, "") : item.id)}`}

          </span>
        </div>
        {!item.isFake && item.id !== meId ? (() => {
          const isFollowing = followingSet.has(item.id);
          // Tab "Theo dõi tôi": người ta đã follow mình mà mình chưa follow lại → "Theo dõi lại".
          const label = isFollowing ? "Đang theo dõi" : tab === "followers" ? "Theo dõi lại" : "Theo dõi";
          return (
            <span
              role="button"
              tabIndex={0}
              aria-label={isFollowing ? "Bỏ theo dõi" : label}
              onClick={(e) => { e.stopPropagation(); if (busyId !== item.id) onToggleFollow(item.id); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onToggleFollow(item.id); } }}
              style={{
                flexShrink: 0, padding: "6px 12px", borderRadius: 999,
                fontSize: 12, fontWeight: 800, cursor: "pointer",
                opacity: busyId === item.id ? 0.6 : 1,
                border: isFollowing ? "1px solid hsl(var(--border))" : "none",
                background: isFollowing ? "transparent" : "linear-gradient(135deg,#a855f7,#ec4899)",
                color: isFollowing ? "hsl(var(--muted-foreground))" : "#fff",
              }}
            >
              {label}
            </span>
          );
        })() : null}
      </button>
    </div>

  );
}

function localeLabel(loc: string | null): string {
  switch (loc) {
    case "ja": return "🇯🇵 Tokyo";
    case "ko": return "🇰🇷 Seoul";
    case "en": return "🇬🇧 London";
    case "zh": return "🇨🇳 Shanghai";
    case "vi":
    default:   return "🇻🇳 Việt Nam";
  }
}
