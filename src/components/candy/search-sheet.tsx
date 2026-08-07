import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, UserRound, Loader2, Heart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { toast } from "sonner";
import { followUser, unfollowUser } from "@/lib/follow-actions";
import { UserDisplayName } from "@/components/vip/user-display-name";

const PAGE = 20;

/** Strip Vietnamese diacritics + lowercase for accent-insensitive matching. */
function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

interface UserRow {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  public_id: string | null;
  followers_count?: number | null;
}

interface SearchSheetProps {
  onViewProfile: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
  onClose: () => void;
}

/**
 * Tabbed search panel: Posts (ILIKE on content, ordered by likes_count DESC)
 * and Users (case-insensitive + accent-insensitive ILIKE, ordered by followers).
 * Paginates 20 items at a time with IntersectionObserver-based infinite scroll.
 */
export function SearchSheet({ onViewProfile, onClose }: SearchSheetProps) {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [page, setPage] = useState(0);

  // Current user id (for "hide follow button for self" guard).
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setMeId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMeId(session?.user?.id ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // DB-backed follow set: ids the current user follows. Loaded lazily as
  // search results arrive, and kept in sync via realtime + a global event so
  // toggling here mirrors the profile page (both hit public.follows).
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [pendingFollow, setPendingFollow] = useState<Set<string>>(new Set());

  // Hydrate follow status for any newly listed users.
  useEffect(() => {
    if (!meId || users.length === 0) return;
    const missing = users.map((u) => u.id).filter((id) => id !== meId && !followingSet.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", meId)
        .in("following_id", missing);
      if (cancelled || !data) return;
      setFollowingSet((prev) => {
        const next = new Set(prev);
        (data as { following_id: string }[]).forEach((r) => next.add(r.following_id));
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [meId, users]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for follow changes from anywhere in the app (e.g. profile page).
  useEffect(() => {
    if (typeof window === "undefined" || !meId) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ targetId: string; following: boolean }>).detail;
      if (!detail) return;
      setFollowingSet((prev) => {
        const next = new Set(prev);
        if (detail.following) next.add(detail.targetId);
        else next.delete(detail.targetId);
        return next;
      });
    };
    window.addEventListener("nfwb:follow-change", handler as EventListener);
    return () => window.removeEventListener("nfwb:follow-change", handler as EventListener);
  }, [meId]);

  // Debounce keyword.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => clearTimeout(t);
  }, [keyword]);

  // Reset when keyword changes.
  useEffect(() => {
    setUsers([]);
    setPage(0); setDone(false);
  }, [debounced]);

  const safe = useMemo(() => debounced.replace(/[%_]/g, "\\$&"), [debounced]);
  const safeNorm = useMemo(() => stripAccents(safe), [safe]);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    if (debounced.length < 2) return;
    setLoading(true);
    const from = page * PAGE;
    const to = from + PAGE - 1;
    try {
      {
        // Users: chỉ tìm theo UID (public_id) và Tên hiển thị (full_name).
        // KHÔNG tìm theo username — username là thông tin riêng tư, chỉ Admin thấy.
        const orParts = [
          `full_name.ilike.%${safe}%`,
          `public_id.ilike.%${safe}%`,
        ];
        if (safeNorm && safeNorm !== safe.toLowerCase()) {
          orParts.push(`full_name.ilike.%${safeNorm}%`);
        }
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, avatar, public_id, followers_count")
          .or(orParts.join(","))
          .order("followers_count", { ascending: false, nullsFirst: false })
          .range(from, to);
        let rows = (data || []) as UserRow[];
        // Client-side accent-insensitive guard + exact-match boost.
        const kNorm = safeNorm;
        rows = rows.filter((u) => {
          const hay = stripAccents(`${u.full_name || ""} ${u.public_id || ""}`);
          return hay.includes(kNorm);
        });
        rows.sort((a, b) => {
          const score = (u: UserRow) => {
            const name = stripAccents(u.full_name || "");
            if (name === kNorm) return 0;
            if (name.startsWith(kNorm)) return 1;
            return 2;
          };
          const s = score(a) - score(b);
          if (s !== 0) return s;
          return (b.followers_count || 0) - (a.followers_count || 0);
        });

        setUsers((prev) => [...prev, ...rows]);
        if ((data?.length || 0) < PAGE) setDone(true);
      }
      setPage((p) => p + 1);
    } catch (e) {
      console.error("search loadMore error", e);
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [loading, done, debounced, safe, safeNorm, page]);

  // First page load when keyword changes.
  useEffect(() => {
    if (debounced.length >= 2) void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Infinite scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) void loadMore();
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const handleFollow = useCallback(async (id: string) => {
    if (!meId) {
      toast.error("Bạn cần đăng nhập để yêu thích.");
      return;
    }
    if (id === meId) return; // self-follow guard
    if (pendingFollow.has(id)) return;

    const currentlyFollowing = followingSet.has(id);
    // Optimistic update.
    setPendingFollow((p) => { const n = new Set(p); n.add(id); return n; });
    setFollowingSet((p) => {
      const n = new Set(p);
      if (currentlyFollowing) n.delete(id); else n.add(id);
      return n;
    });

    try {
      if (currentlyFollowing) await unfollowUser(meId, id);
      else await followUser(meId, id);
      // followUser/unfollowUser broadcast nfwb:follow-change themselves.
    } catch (e: any) {
      // Revert optimistic state on failure.
      setFollowingSet((p) => {
        const n = new Set(p);
        if (currentlyFollowing) n.add(id); else n.delete(id);
        return n;
      });
      toast.error(e?.message || "Không thể cập nhật trạng thái yêu thích.");
    } finally {
      setPendingFollow((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  }, [meId, followingSet, pendingFollow]);

  const renderEmpty = () => {
    if (debounced.length < 2) return <div className="px-5 py-12 text-center text-sm text-muted-foreground">Gõ để tìm người dùng hoặc bài viết…</div>;
    if (loading) return null;
    return <div className="px-5 py-12 text-center text-sm text-muted-foreground">Không có kết quả phù hợp.</div>;
  };

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
      {/* Search input */}
      <div className="px-4 pt-2 pb-3">
        <div className="group flex items-center gap-2.5 rounded-2xl border border-border bg-card/80 px-3.5 py-2.5 shadow-sm focus-within:border-primary/70 focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Search size={17} className="text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Nhập từ khoá: người dùng, bài viết, #hashtag…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          {keyword && (
            <button
              onClick={() => setKeyword("")}
              aria-label="Xoá"
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* User list */}
      <div
        data-scroll-lock-ignore
        className="flex-1 px-3 pb-3"
        style={{
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          minHeight: 0,
        }}
      >
        <ul className="flex flex-col gap-2">
          {users.map((u) => {
            const name = u.full_name || "Người dùng";
            const following = followingSet.has(u.id);
            const isSelf = meId === u.id;
            const isPending = pendingFollow.has(u.id);
            return (
              <li
                key={u.id}
                className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 shadow-sm hover:border-primary/40 hover:bg-card/90 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <button
                  onClick={() => { onViewProfile(u.id); onClose(); }}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  {u.avatar ? (
                    <img loading="lazy" decoding="async"
                      src={getValidAvatarUrl(u.avatar)}
                      onError={handleAvatarError}
                      alt={name}
                      className="h-12 w-12 rounded-full object-cover flex-shrink-0 ring-2 ring-border group-hover:ring-primary/40 transition-all"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full grid place-items-center bg-muted flex-shrink-0 ring-2 ring-border group-hover:ring-primary/40 transition-all">
                      <UserRound size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <UserDisplayName
                      userId={u.id}
                      name={name}
                      nameClassName="truncate"
                      className="text-sm font-semibold max-w-full"
                      as="div"
                    />
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      ID {u.public_id || "—"}
                      {typeof u.followers_count === "number" && (
                        <span className="ml-2">· {u.followers_count} follow</span>
                      )}
                    </div>
                  </div>
                </button>
                {!isSelf && (
                  <button
                    onClick={() => void handleFollow(u.id)}
                    disabled={isPending}
                    className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-all flex-shrink-0 disabled:opacity-60 hover:scale-105 active:scale-95"
                    style={{
                      background: following ? "hsl(var(--muted))" : "hsl(var(--primary))",
                      color: following ? "hsl(var(--foreground))" : "hsl(var(--primary-foreground))",
                    }}
                  >
                    {following ? <><Heart size={12} fill="currentColor" /> Đã yêu thích</> : <><Heart size={12} /> Yêu thích</>}
                  </button>
                )}
              </li>
            );
          })}
          {users.length === 0 && renderEmpty()}
        </ul>

        {loading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {done && users.length > 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">— Hết kết quả —</div>
        )}
      </div>
    </div>
  );
}
