import { useEffect, useMemo, useState } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Sparkles } from "lucide-react";
import { List, type RowComponentProps } from "react-window";
import { supabase } from "@/lib/supabase";
import UniversalBadge from "@/components/candy/universal-badge";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { loadFakeFollowers } from "@/lib/buff-followers";
import type { FakeFollowerJoined } from "@/integrations/supabase/fake-types";

interface FollowerItem {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  vip_level: number | null;
  location: string | null;
  isFake: boolean;
}

interface FollowersSheetProps {
  userId: string;
  followersCount: number;
  initialTab?: "followers" | "following";
  onClose: () => void;
  onSelect: (id: string) => void;
}

const ROW_HEIGHT = 72;
type TabKey = "followers" | "following";

export function FollowersSheet({ userId, followersCount, initialTab = "followers", onClose, onSelect }: FollowersSheetProps) {
  useBodyScrollLock(true);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [followersItems, setFollowersItems] = useState<FollowerItem[]>([]);
  const [followingItems, setFollowingItems] = useState<FollowerItem[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(true);
  const [loadingFollowing, setLoadingFollowing] = useState(true);

  // Load followers (real + fake)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingFollowers(true);
      try {
        const { data: followRows } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", userId)
          .limit(1000);
        const followerIds = (followRows ?? []).map((row) => row.follower_id);

        let realProfiles: FollowerItem[] = [];
        if (followerIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, username, avatar, vip_level, location, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province")
            .in("id", followerIds);
          realProfiles = (profiles ?? []).map((p) => ({
            id: p.id,
            full_name: p.full_name ?? null,
            username: p.username ?? null,
            avatar: p.avatar ?? null,
            vip_level: p.vip_level ?? 0,
            location: p.location ?? null,
            isFake: false,
          }));
        }

        let fakeRows: FakeFollowerJoined[] = [];
        try {
          fakeRows = await loadFakeFollowers(userId, { from: 0, to: 999 });
        } catch {
          fakeRows = [];
        }
        const fakeItems: FollowerItem[] = fakeRows
          .filter((row) => row.fake_profile)
          .map((row) => ({
            id: `fake-${row.id}`,
            full_name: row.fake_profile.display_name || row.fake_profile.full_name || null,
            username: row.fake_profile.username,
            avatar: row.fake_profile.avatar_url || row.fake_profile.avatar || null,
            vip_level: row.fake_profile.vip_level ?? 0,
            location: localeLabel(row.fake_profile.locale),
            isFake: true,
          }));

        if (!cancelled) {
          setFollowersItems([...fakeItems, ...realProfiles]);
        }
      } finally {
        if (!cancelled) setLoadingFollowers(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  // Load "đã yêu thích" (following) — real only
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingFollowing(true);
      try {
        const { data: followRows } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", userId)
          .limit(1000);
        const ids = (followRows ?? []).map((r: any) => r.following_id);
        let real: FollowerItem[] = [];
        if (ids.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, username, avatar, vip_level, location, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province")
            .in("id", ids);
          real = (profiles ?? []).map((p) => ({
            id: p.id,
            full_name: p.full_name ?? null,
            username: p.username ?? null,
            avatar: p.avatar ?? null,
            vip_level: p.vip_level ?? 0,
            location: p.location ?? null,
            isFake: false,
          }));
        }
        if (!cancelled) setFollowingItems(real);
      } finally {
        if (!cancelled) setLoadingFollowing(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const items = tab === "followers" ? followersItems : followingItems;
  const loading = tab === "followers" ? loadingFollowers : loadingFollowing;
  const total = useMemo(
    () => (tab === "followers" ? (followersItems.length || followersCount) : followingItems.length),
    [tab, followersItems.length, followingItems.length, followersCount]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-in fade-in"
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
            {tab === "followers" ? "Ai yêu thích tôi" : "Tôi đã yêu thích"} ({total.toLocaleString()})
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
            active={tab === "followers"}
            label={`Ai yêu thích tôi${followersItems.length ? ` · ${followersItems.length}` : ""}`}
            onClick={() => setTab("followers")}
          />
          <FollowTab
            active={tab === "following"}
            label={`Tôi đã yêu thích${followingItems.length ? ` · ${followingItems.length}` : ""}`}
            onClick={() => setTab("following")}
          />
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
            <p className="muted-copy" style={{ padding: 16 }}>Đang tải danh sách…</p>
          ) : items.length === 0 ? (
            <p className="muted-copy" style={{ padding: 16 }}>
              {tab === "followers" ? "Chưa có người yêu thích." : "Chưa yêu thích ai."}
            </p>
          ) : (
            <div style={{ height: items.length * ROW_HEIGHT + 8, padding: "4px 0" }}>
              <List
                rowCount={items.length}
                rowHeight={ROW_HEIGHT}
                rowProps={{ items, onSelect, onClose }}
                rowComponent={FollowerRow}
                overscanCount={6}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
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
};

function FollowerRow({ index, style, items, onSelect, onClose, ariaAttributes }: RowComponentProps<RowProps>) {
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
        <AvatarGlow
          avatar={item.avatar || null}
          userId={item.isFake ? null : item.id}
          size={44}
          alt={item.full_name || "Tài khoản"}
          imgClassName="avatar-md"
          style={{ flexShrink: 0 }}
        />
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
              {item.full_name || "Người dùng"}
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
          <span className="row-meta">{item.location || "Việt Nam"}</span>
        </div>
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
