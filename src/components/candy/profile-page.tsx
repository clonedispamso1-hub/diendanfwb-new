import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/profile-zalo.css";
import "@/styles/unlock-letter.css";
import "@/styles/profile-id-fab.css";
import { MessageCircle, ShieldAlert, Camera, Check, UserPlus, Users } from "lucide-react";
import { UnlockLetter, ZaloLockedButton } from "@/components/candy/unlock-letter";
import { setProfileHeart, useIsFollowing } from "@/lib/follow-actions";

// (using useState imported above for ProfileBioBlock)
import { CoinIcon } from "@/components/candy/coin-icon";
import { toast } from "sonner";
import { TransferCandyDialog } from "@/components/candy/transfer-candy-dialog";
import { useAuth } from "@/components/candy/auth-provider";
import { PostCard } from "@/components/candy/post-card";
import { POST_COLS } from "@/lib/feed-data";
import { prefetchPostStats } from "@/lib/post-stats-batch";
import { resolveUserName, isLockedAccount } from "@/lib/user-name";
import { isLockedUserId, onLockChange, filterLockedPosts } from "@/lib/locked-accounts";
import { FollowersSheet } from "@/components/candy/followers-sheet";
import { IdentityBadges } from "@/components/candy/identity-badges";
// GenderIcon removed from profile hero — gender now shown as a larger badge beside the name.
import { NotificationsPanel, useUnreadNotifications } from "@/components/candy/notifications-panel";

import { adminPath } from "@/lib/admin-slug";
// Chức năng "Chặn" đã được gỡ hoàn toàn — không còn BlockedListSheet.
import { IntroCard } from "@/components/candy/intro-card";
import { IntentBubble } from "@/components/candy/intent-bubble";
import { ImageLightbox } from "@/components/candy/image-lightbox";
import { getMediaUrl as cdnUrl, getMediaThumb as cldThumb } from "@/lib/media";
import { ProfileStickersLayer } from "@/components/candy/profile-stickers-layer";
import {
  StoryRingAvatar,
  type StoryRecord,
  type StoryRingAvatarHandle,
} from "@/components/candy/story-ring-avatar";
import { ChainLockOverlay } from "@/components/candy/chain-lock-overlay";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { openPopup } from "@/components/candy/popup-engine";
import { StoryViewer } from "@/components/candy/story-viewer";
import { HallOfFame } from "@/components/candy/hall-of-fame";
import { useAvatarChangeFlow } from "@/components/candy/change-avatar-flow";
import { ProfileIdFab } from "@/components/candy/profile-id-fab";

// Task #5.1: bỏ khóa VIP bài viết — không còn dùng LockedPostsCard cho posts.
import { LazyMount } from "@/components/candy/lazy-mount";
import { FwbModeOnboarding } from "@/components/candy/fwb-mode-onboarding";
import { FwbModeBanner } from "@/components/candy/fwb-mode-banner";
import { supabase } from "@/lib/supabase";
import { VIRTUAL_TABLE } from "@/lib/virtual-profiles";

// POSTS_VIEW_REQUIRED_VIP removed — mọi thành viên đều xem được bài viết.
import { getTotalFollowerCount } from "@/lib/buff-followers";
import { bumpFollowerCount, useFollowerCount } from "@/lib/follow-count-store";
import { spawnPlusOne } from "@/lib/heart-fly";

import type { PostRecord, Profile } from "@/lib/app-types";

import { isMissingRelationError } from "@/lib/db-compat";
import { formatCompact } from "@/lib/format";
import { favTier, formatFavCount, favPublicSummary } from "@/lib/favorites";
import { recordProfileView } from "@/lib/profile-views";
import { fetchSeedGroupsOfAccount, type SeedGroupOption } from "@/lib/seed-account-groups";
import { requestBaitFocus } from "@/lib/bait-group-token";
import { applyLocation, shortCount } from "@/lib/supabase-v4";
import { GroupCard } from "@/components/candy/group-card";
import { VipMedia } from "@/components/vip/vip-media";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";
import { vipIconSize } from "@/lib/vip-sizes";
import { read3 } from "@/lib/content-db";
import { resolveAvailableCols } from "@/lib/db/column-guard";
import { HeartLoader, HeartLoadError } from "@/components/candy/heart-loader";
// PetsProfilePanel đã bị gỡ — thay tab bằng "Liên hệ" (Facebook / Zalo).

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROFILE_CACHE_KEY_PREFIX = "profile.cache.v2::";
const PROFILE_COLS =
  "id, display_name, full_name, username, public_id, avatar, avatar_url, cover_url, bio, location, province, region, candy, candy_balance, gem_balance, followers_count, vip_level, vip_exp, is_admin, is_online, last_seen, is_virtual, is_banned, banned_until, name_changes, last_name_change, status, ban_reason, trust_score, reputation_score, title_gif_url, created_at, role, height, weight, intent, intent_locked_until, location_last_changed_at, location_change_count, gender, phone, age, interests, is_fwb_active, is_seed_account, nickname, birthday, zodiac, relationship_status, personality_tags, communication_styles, goal, target_gender, preferred_language, location_visibility, gender_visibility, birthday_visibility, zodiac_visibility, relationship_visibility, goal_visibility, identity_crown, identity_pet, identity_flag";
const VIDEOS_SOCIAL_COLS = "id, user_id, video_url, caption, created_at";
const VIRTUAL_TABLE_COLS =
  "id, display_name, full_name, username, avatar, avatar_url, bio, location, province, is_virtual, is_clone, status, is_banned, banned_until, followers_count, vip_level, trust_score";
const SEED_ACCOUNTS_COLS =
  "id, display_name, username, avatar, bio, gender, age, distance_km, is_online, is_active, province, created_at, updated_at";
// ĐỒNG BỘ THỐNG KÊ: Profile phải đọc ĐÚNG bộ cột như Feed (POST_COLS),
// nếu thiếu bot_likes / views_count thì số Like/View ở Profile sẽ lệch Feed.
const POSTS_PROFILE_COLS = POST_COLS;

function readProfileCache(id: string): Profile | null {
  try {
    const raw = sessionStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > PROFILE_CACHE_TTL_MS) return null;
    const data = parsed.data as Profile;
    if ((data as any).is_virtual || (data as any).is_clone) {
      (data as any).status = "active";
      (data as any).is_banned = false;
      (data as any).banned_until = null;
      (data as any).avatar = (data as any).avatar ?? (data as any).avatar_url ?? null;
    }
    return data;
  } catch {
    return null;
  }
}
function writeProfileCache(id: string, data: Profile) {
  try {
    sessionStorage.setItem(
      `${PROFILE_CACHE_KEY_PREFIX}${id}`,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    /* */
  }
}

/* ------------------------------------------------------------------
 * Profile bundle cache (in-memory, TTL 5 phút)
 * Gộp profile + posts + videos + follower/following count vào 1 gói.
 * Mở lại hồ sơ trong 5 phút → dùng lại y nguyên, KHÔNG query lại.
 * ------------------------------------------------------------------ */
type ProfileBundle = {
  ts: number;
  profile: Profile | null;
  posts: PostRecord[];
  videos: any[];
  followersBase: number;
  followingCount: number;
};
const PROFILE_BUNDLE = new Map<string, ProfileBundle>();

function readProfileBundle(id: string): ProfileBundle | null {
  const b = PROFILE_BUNDLE.get(id);
  if (!b) return null;
  if (Date.now() - b.ts > PROFILE_CACHE_TTL_MS) {
    PROFILE_BUNDLE.delete(id);
    return null;
  }
  return b;
}
function patchProfileBundle(id: string, patch: Partial<Omit<ProfileBundle, "ts">>) {
  const prev = PROFILE_BUNDLE.get(id);
  PROFILE_BUNDLE.set(id, {
    ts: prev && Date.now() - prev.ts <= PROFILE_CACHE_TTL_MS ? prev.ts : Date.now(),
    profile: prev?.profile ?? null,
    posts: prev?.posts ?? [],
    videos: prev?.videos ?? [],
    followersBase: prev?.followersBase ?? 0,
    followingCount: prev?.followingCount ?? 0,
    ...patch,
  });
}
/** Xoá cache 1 hồ sơ — dùng khi ép làm mới (pull refresh / nút Làm mới). */
export function invalidateProfileBundle(id?: string) {
  if (id) PROFILE_BUNDLE.delete(id);
  else PROFILE_BUNDLE.clear();
}

function formatProfileLocation(location?: string | null): string {
  if (!location) return "Chưa cập nhật";
  return location
    .replace(/^(Thành phố|TP\.?)\s*Hồ Chí Minh$/i, "TP.HCM")
    .replace(/^(Thành phố|TP\.?)\s*Hà Nội$/i, "Hà Nội")
    .replace(/^Thành phố\s+/i, "TP. ")
    .replace(/^Tỉnh\s+/i, "");
}

function maskPhone(p?: string | null): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  const tail = digits.slice(-3);
  const head = p.startsWith("+") ? `+${digits.slice(0, digits.length > 10 ? 2 : 0)}` : "";
  return `${head ? head + " " : ""}*** *** ${tail}`.trim();
}

interface ProfilePageProps {
  userId?: string | null;
  onViewProfile: (userId: string) => void;
  onOpenChat: (userId: string) => void;
  onOpenPost?: (postId: string, opts?: { focusComments?: boolean; commentId?: string }) => void;
  onOpenVideo?: (videoId: string) => void;
  onBack?: () => void;
  /** Overlay dùng để hiện tên trên header khi scroll (không refetch). */
  onProfileName?: (name: string) => void;
}

type TabKey = "posts" | "photos" | "groups";
const TAB_ORDER: TabKey[] = ["posts", "photos", "groups"];

function coverGradientFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const h1 = h % 360;
  const h2 = (h1 + 40 + ((h >> 8) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 68% 58%) 0%, hsl(${h2} 72% 48%) 100%)`;
}

function extractPhotoUrls(posts: PostRecord[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of posts) {
    const arr: (string | null | undefined)[] = [
      ...(Array.isArray(p.image_urls) ? p.image_urls : []),
      p.image_url,
      p.image,
    ];
    for (const u of arr) {
      if (typeof u === "string" && u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}

export function ProfilePage({
  userId,
  onViewProfile,
  onOpenChat,
  onOpenPost,
  onOpenVideo,
  onBack,
  onProfileName,
}: ProfilePageProps) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const { count: unreadNotif } = useUnreadNotifications();
  const avatarFlow = useAvatarChangeFlow({ userId: me?.id ?? null });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [, setVideos] = useState<any[]>([]);
  const [followersBase, setFollowersBase] = useState(0);

  const [followingCount, setFollowingCount] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  // UI-only state cho popup Cộng đồng VIP Zalo + hiệu ứng thả tim (CSS thuần).
  const [showCommunityVip, setShowCommunityVip] = useState(false);

  const [showNotif, setShowNotif] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [followersInitialTab, setFollowersInitialTab] = useState<"followers" | "following">(
    "followers",
  );
  const [showHiddenListNotice, setShowHiddenListNotice] = useState(false);

  const [showTransfer, setShowTransfer] = useState(false);
  // showBlocked state removed — chức năng Chặn đã gỡ.
  const [confirmCandy, setConfirmCandy] = useState<{
    senderId: string;
    senderName: string;
    amount: number;
  } | null>(null);
  const [tab, setTab] = useState<TabKey>("posts");
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(() => new Set<TabKey>(["posts"]));
  const [groups, setGroups] = useState<SeedGroupOption[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsBadgeHidden, setGroupsBadgeHidden] = useState(false);
  const selectTab = useCallback((next: TabKey) => {
    setTab((prev) => {
      if (prev === next) return prev;
      const a = TAB_ORDER.indexOf(prev);
      const b = TAB_ORDER.indexOf(next);
      setSlideDir(b > a ? "right" : "left");
      return next;
    });
    setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    if (next === "groups") setGroupsBadgeHidden(true);
  }, []);
  const [blockedRel, setBlockedRel] = useState<{ iBlocked: boolean; theyBlocked: boolean }>({
    iBlocked: false,
    theyBlocked: false,
  });
  const [storyView, setStoryView] = useState<StoryRecord[] | null>(null);
  const storyRingRef = useRef<StoryRingAvatarHandle | null>(null);

  const [fwbModeActive, setFwbModeActive] = useState<boolean>(false);
  const [fwbOnboardOpen, setFwbOnboardOpen] = useState(false);
  const [fwbData, setFwbData] = useState<{
    phone: string | null;
    age: number | null;
    interests: string[];
    city: string | null;
  } | null>(null);

  const targetId = userId || me?.id || null;
  const isOwn = Boolean(me?.id && targetId === me.id);
  const { locked: chainLocked, unlock: unlockChain } = useIdleLock();
  const handleChainUnlockRequest = useCallback(() => {
    openPopup("vip_zalo", {
      onConfirm: () => unlockChain(),
      onClose: () => unlockChain(),
    });
  }, [unlockChain]);
  // Số Follow hiển thị = số DB + delta optimistic (đồng bộ toàn website, 0 truy vấn thêm).
  const followersCount = useFollowerCount(targetId, followersBase);
  // Hiệu ứng "+1 ❤️" bay lên avatar khi chủ tài khoản đang mở hồ sơ của mình.
  const prevFollowersRef = useRef(followersCount);
  useEffect(() => {
    const prev = prevFollowersRef.current;
    prevFollowersRef.current = followersCount;
    if (!isOwn || followersCount <= prev) return;
    const avatar = document.querySelector(".profile-hero-avatar");
    const times = Math.min(followersCount - prev, 5);
    for (let i = 0; i < times; i++) {
      window.setTimeout(() => spawnPlusOne(avatar), i * 180);
    }
  }, [followersCount, isOwn]);

  // Ghi 1 lượt "xem hồ sơ" trong ngày (bỏ qua hồ sơ của chính mình).
  useEffect(() => {
    if (!me?.id || !targetId || isOwn) return;
    void recordProfileView(me.id, targetId);
  }, [me?.id, targetId, isOwn]);
  const [isFav, setIsFav] = useIsFollowing(me?.id ?? null, targetId ?? null);

  /**
   * Thả tim / Hủy tim cho Profile.
   * Nguồn sự thật là DB: ghi idempotent rồi đọc lại COUNT thật.
   * Không cộng/trừ số ở frontend → không thể buff tim.
   */

  const canSeeAdmin = isOwn && (me?.is_admin === true || profile?.is_admin === true);
  // Task #5.1: bỏ hoàn toàn khóa bài viết VIP — mọi thành viên đều xem được bài viết của nhau.
  const postsLocked = false;

  useEffect(() => {
    if (!isOwn || !me) return;
    setProfile((prev) => {
      if (!prev) return me;
      let changed = false;
      for (const k of Object.keys(me) as Array<keyof typeof me>) {
        if ((prev as any)[k] !== (me as any)[k]) {
          changed = true;
          break;
        }
      }
      return changed ? { ...prev, ...me } : prev;
    });
  }, [isOwn, me]);

  useEffect(() => {
    if (!isOwn || !me?.id) return;
    const flag =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`fwb_mode_active::${me.id}`)
        : null;
    if (flag === "1") setFwbModeActive(true);
    void (async () => {
      try {
        const { data } = await (supabase as any)
          .from("fwb_profiles")
          .select("phone, age, interests, city")
          .eq("user_id", me.id)
          .maybeSingle();
        if (data) {
          setFwbData({
            phone: data.phone ?? null,
            age: data.age ?? null,
            interests: Array.isArray(data.interests) ? data.interests : [],
            city: data.city ?? null,
          });
        }
      } catch (e) {
        console.warn("[fwb-mode] load fwb_profiles failed", e);
      }
    })();
  }, [isOwn, me?.id]);

  const handleToggleFwbMode = useCallback(() => {
    if (!isOwn || !me?.id) return;
    if (fwbModeActive) {
      setFwbModeActive(false);
      try {
        window.localStorage.removeItem(`fwb_mode_active::${me.id}`);
      } catch {
        /* */
      }
      return;
    }
    const ready =
      fwbData &&
      typeof fwbData.phone === "string" &&
      fwbData.phone.length >= 9 &&
      typeof fwbData.age === "number" &&
      fwbData.age >= 18 &&
      Array.isArray(fwbData.interests) &&
      fwbData.interests.length > 0;
    if (ready) {
      setFwbModeActive(true);
      try {
        window.localStorage.setItem(`fwb_mode_active::${me.id}`, "1");
      } catch {
        /* */
      }
    } else {
      setFwbOnboardOpen(true);
    }
  }, [isOwn, me?.id, fwbModeActive, fwbData]);

  // Load assigned seed groups for the profile being viewed ( reused Admin random assignment ).
  useEffect(() => {
    if (!targetId) {
      setGroups([]);
      return;
    }
    let alive = true;
    setGroupsLoading(true);
    fetchSeedGroupsOfAccount(targetId)
      .then((data) => {
        if (alive) setGroups(data);
      })
      .catch((err) => {
        console.warn("[profile-groups] fetch failed", err);
      })
      .finally(() => {
        if (alive) setGroupsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [targetId]);

  const loadProfile = useCallback(async () => {
    if (!targetId) return;
    setProfileError(false);
    // Gọi loadProfile là hành vi làm mới có chủ đích → bỏ cache cũ.
    PROFILE_BUNDLE.delete(targetId);
    const videoQuery = supabase
      .from("videos_social" as any)
      .select(VIDEOS_SOCIAL_COLS)
      .eq("user_id", targetId)
      .order("created_at", { ascending: false })
      .limit(20);
    const fetchProfile = async () => {
      // Chỉ select các cột THỰC SỰ tồn tại trên DB (cache 1 lần / phiên) —
      // nếu DB thiếu cột (candy, identity_*) thì query cũ 400 → trang trắng.
      let cols = PROFILE_COLS;
      try {
        cols = await resolveAvailableCols(supabase, "profiles", PROFILE_COLS);
      } catch {
        /* dùng nguyên bộ cột */
      }
      const res = await supabase.from("profiles").select(cols).eq("id", targetId).maybeSingle();
      if (!res.error) return res;
      return supabase
        .from("profiles")
        .select("id, display_name, full_name, username, avatar, bio")
        .eq("id", targetId)
        .maybeSingle();
    };
    const fetchVirtualFallback = async () => {
      const res = await supabase
        .from(VIRTUAL_TABLE as any)
        .select(VIRTUAL_TABLE_COLS)
        .eq("id", targetId)
        .maybeSingle();
      if (res.error || !res.data) return null;
      const row: any = res.data;
      // Mark as virtual + clear any field that would flip the suspended overlay.
      row.full_name = row.display_name || row.full_name || null;
      row.avatar = row.avatar || row.avatar_url || null;
      row.location = row.location || row.province || null;
      row.is_virtual = true;
      row.is_clone = true;
      row.status = "active";
      row.is_banned = false;
      row.banned_until = null;
      return row as Profile;
    };
    // Database-only Seed Accounts live in `public.seed_accounts` — no
    // auth.users, no profiles row. Map them into the Profile shape so the
    // profile page renders them as if they were regular users. Posting is
    // restricted downstream by checking `is_seed_account`.
    const fetchSeedFallback = async () => {
      const res = await supabase
        .from("seed_accounts" as any)
        .select(SEED_ACCOUNTS_COLS)
        .eq("id", targetId)
        .maybeSingle();
      if (res.error || !res.data) return null;
      const s: any = res.data;
      return {
        id: s.id,
        full_name: s.display_name || null,
        username: s.username || null,
        avatar: s.avatar || null,
        bio: s.bio || null,
        location: s.province || null,
        province: s.province || null,
        gender: s.gender || null,
        age: s.age ?? null,
        is_online: !!s.is_online,
        is_seed_account: true,
        is_virtual: true,
        status: "active",
        is_banned: false,
        banned_until: null,
      } as unknown as Profile;
    };
    // 1) Profile FIRST — render as soon as possible.
    const { data: profileData } = await fetchProfile();
    let nextProfile = (profileData as unknown as Profile | null) ?? null;
    if (!nextProfile) nextProfile = await fetchVirtualFallback();
    if (!nextProfile) nextProfile = await fetchSeedFallback();
    if (nextProfile) {
      setProfile(nextProfile);
      patchProfileBundle(targetId, { profile: nextProfile });
      writeProfileCache(targetId, nextProfile);
      // Probe virtual mirror in background — do NOT block UI.
      void (async () => {
        try {
          const virtualRow = await fetchVirtualFallback();
          if (virtualRow) {
            const merged = {
              ...nextProfile!,
              ...virtualRow,
              id: targetId,
              full_name: virtualRow.full_name || nextProfile!.full_name,
              username: virtualRow.username || nextProfile!.username,
              avatar: (virtualRow as any).avatar || (nextProfile as any).avatar || null,
              province: virtualRow.province || nextProfile!.province,
              location:
                (virtualRow as any).location ||
                nextProfile!.location ||
                virtualRow.province ||
                null,
              bio: virtualRow.bio || nextProfile!.bio,
              followers_count: virtualRow.followers_count ?? nextProfile!.followers_count,
              vip_level: virtualRow.vip_level ?? nextProfile!.vip_level,
              trust_score: virtualRow.trust_score ?? nextProfile!.trust_score,
              is_virtual: true,
              is_clone: true,
              status: "active",
              is_banned: false,
              banned_until: null,
            } as Profile;
            setProfile(merged);
            writeProfileCache(targetId, merged);
          } else if ((nextProfile as any).is_virtual || (nextProfile as any).is_clone) {
            const patched = { ...nextProfile! } as any;
            patched.status = "active";
            patched.is_banned = false;
            patched.banned_until = null;
            patched.avatar = patched.avatar ?? patched.avatar_url ?? null;
            setProfile(patched);
          }
        } catch {
          /* silent */
        }
      })();
    } else {
      setProfile(null);
      setProfileError(true);
    }

    // 2) Lazy secondary data — each state updates independently, non-blocking.
    const profileForPosts = nextProfile;
    // Anti Clone: tài khoản bị khóa → ẩn toàn bộ bài viết khỏi hồ sơ.
    const authorLocked = isLockedAccount(nextProfile as any) || isLockedUserId(targetId);
    if (!postsLocked && !authorLocked) {
      // Perf: tải 24 bài đầu để hiển thị ngay, phần còn lại nạp nền rồi nối vào.
      const mapPost = (p: any): PostRecord => ({
        ...p,
        profiles: profileForPosts
          ? {
              id: profileForPosts.id,
              display_name: (profileForPosts as any).display_name,
              full_name: profileForPosts.full_name,
              username: profileForPosts.username,
              avatar: profileForPosts.avatar,
              vip_level: profileForPosts.vip_level,
              location: profileForPosts.location,
              province: profileForPosts.province,
              is_admin: (profileForPosts as any).is_admin,
              role: (profileForPosts as any).role,
              gender: (profileForPosts as any).gender,
              title_gif_url: (profileForPosts as any).title_gif_url,
              identity_crown: (profileForPosts as any).identity_crown,
              identity_pet: (profileForPosts as any).identity_pet,
              identity_flag: (profileForPosts as any).identity_flag,
              created_at: (profileForPosts as any).created_at,
              vip_permanent: (profileForPosts as any).vip_permanent,
            }
          : null,
      });
      const FIRST_PAGE = 24;
      void (async () => {
        try {
          const base = () =>
            read3()
              .from("posts")
              .select(POSTS_PROFILE_COLS)
              .eq("user_id", targetId)
              .is("deleted_at", null)
              .neq("visibility", "feedback")
              .neq("is_admin_post", true)
              .neq("category", "important")
              .order("created_at", { ascending: false })
              .limit(20);

          const { data: firstData } = await base().range(0, FIRST_PAGE - 1);
          const firstRows = ((firstData as any[]) || []).map(mapPost);
          // Dùng chung batch-loader với Feed → Like/Comment/View/Gift giống hệt Feed.
          await prefetchPostStats(
            firstRows.map((p) => String(p.id)),
            me?.id ?? null,
          );
          setPosts(firstRows);
          patchProfileBundle(targetId, { posts: firstRows });

          if (firstRows.length === FIRST_PAGE) {
            // Perf: KHÔNG kéo tới 1000 bài. Chỉ nạp thêm 1 trang nữa khi trình
            // duyệt rảnh → mở hồ sơ nhanh hơn, giảm egress đáng kể.
            const runRest = async () => {
              const { data: restData } = await base().range(FIRST_PAGE, FIRST_PAGE + 47);
              const restRows = ((restData as any[]) || []).map(mapPost);
              if (restRows.length) {
                await prefetchPostStats(
                  restRows.map((p) => String(p.id)),
                  me?.id ?? null,
                );
                setPosts((prev) => {
                  const merged = [...prev, ...restRows];
                  patchProfileBundle(targetId, { posts: merged });
                  return merged;
                });
              }
            };
            const idle = (window as any).requestIdleCallback as
              ((cb: () => void, o?: { timeout: number }) => number) | undefined;
            if (idle) idle(() => void runRest(), { timeout: 1500 });
            else window.setTimeout(() => void runRest(), 300);
          }
        } catch {
          /* silent */
        }
      })();
    } else {
      setPosts([]);
      patchProfileBundle(targetId, { posts: [] });
    }

    void (async () => {
      try {
        const videoResult = await videoQuery;
        const safeVideoRows =
          videoResult.error && isMissingRelationError(videoResult.error)
            ? []
            : (videoResult.data as any[]) || [];
        setVideos(safeVideoRows);
        patchProfileBundle(targetId, { videos: safeVideoRows });
      } catch {
        /* silent */
      }
    })();

    void (async () => {
      try {
        const n = (await getTotalFollowerCount(targetId)) || 0;
        setFollowersBase(n);
        patchProfileBundle(targetId, { followersBase: n });
      } catch {
        /* silent */
      }
    })();

    void (async () => {
      try {
        const { count } = await read3()
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", targetId);
        setFollowingCount(count || 0);
        patchProfileBundle(targetId, { followingCount: count || 0 });
      } catch {
        /* silent */
      }
    })();
  }, [targetId, postsLocked, me?.id]);

  useEffect(() => {
    if (!targetId) return;
    const bundle = readProfileBundle(targetId);
    if (bundle?.profile && !isLockedUserId(targetId)) {
      // Cache còn hạn (5 phút) → dựng lại toàn bộ hồ sơ từ bộ nhớ, không query.
      setProfile(bundle.profile);
      setPosts(filterLockedPosts(bundle.posts) as PostRecord[]);
      setVideos(bundle.videos);
      setFollowersBase(bundle.followersBase);
      setFollowingCount(bundle.followingCount);
      return;
    }
    const cached = readProfileCache(targetId);
    if (cached) setProfile(cached);
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, me?.id]);

  // Anti Clone: khóa/mở khóa tài khoản → hồ sơ cập nhật NGAY (ẩn/hiện bài viết),
  // bỏ qua bundle cache 5 phút.
  useEffect(() => {
    return onLockChange(({ userId, locked }) => {
      if (userId !== targetId) {
        setPosts((prev) => filterLockedPosts(prev) as PostRecord[]);
        return;
      }
      invalidateProfileBundle(targetId);
      if (locked) {
        setPosts([]);
        patchProfileBundle(targetId, { posts: [] });
        setProfile((prev) => (prev ? ({ ...prev, is_banned: true } as Profile) : prev));
      } else {
        void loadProfile();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  useEffect(() => {
    if (!me?.id || !targetId || isOwn) {
      setBlockedRel({ iBlocked: false, theyBlocked: false });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from("user_blocks" as any)
        .select("blocker_id, target_id")
        .or(
          `and(blocker_id.eq.${me.id},target_id.eq.${targetId}),and(blocker_id.eq.${targetId},target_id.eq.${me.id})`,
        );
      if (cancelled) return;
      const arr = (rows as any[]) || [];
      setBlockedRel({
        iBlocked: arr.some((r) => r.blocker_id === me.id),
        theyBlocked: arr.some((r) => r.blocker_id === targetId),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, targetId, isOwn]);

  useEffect(() => {
    if (!targetId) return;
    const channel = supabase
      .channel(`profile-view-${targetId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${targetId}` },
        (payload) =>
          setProfile((prev) => {
            const next = payload.new as Profile;
            if ((prev as any)?.is_virtual || (prev as any)?.is_clone) {
              return {
                ...prev,
                ...next,
                is_virtual: true,
                is_clone: true,
                status: "active",
                is_banned: false,
                banned_until: null,
                avatar: (next as any).avatar ?? (next as any).avatar_url ?? prev?.avatar ?? null,
              } as Profile;
            }
            return next;
          }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [targetId]);

  useEffect(() => {
    if (!targetId) return;
    const refreshFollowers = async () => setFollowersBase(await getTotalFollowerCount(targetId));
    const rt = supabase;
    const ch = rt
      .channel(`follows-${targetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${targetId}` },
        () => void refreshFollowers(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fake_follows",
          filter: `following_id=eq.${targetId}`,
        },
        () => void refreshFollowers(),
      )
      .subscribe();
    return () => {
      void rt.removeChannel(ch);
    };
  }, [targetId]);

  useEffect(() => {
    if (!targetId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadProfile();
      }, 600);
    };
    const rt = supabase;
    const ch = rt
      .channel(`profile-posts-${targetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `user_id=eq.${targetId}` },
        scheduleReload,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void rt.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const displayName = useMemo(() => resolveUserName(profile as any, "Người dùng"), [profile]);

  useEffect(() => {
    if (profile?.full_name) onProfileName?.(profile.full_name);
  }, [profile?.full_name, onProfileName]);

  // Swipe gesture on tab panels — isolated from carousels and header.
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    // Gesture isolation: ignore swipes that start inside a horizontal carousel
    // (Tin nổi bật) or anywhere within the profile header identity block.
    if (
      target &&
      target.closest(
        '.featured-moments, .tg-id, .pm-card--carousel, .embla, .embla__viewport, [data-embla-container], [data-no-tab-swipe="true"]',
      )
    ) {
      touchRef.current = null;
      return;
    }
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    const dt = Date.now() - touchRef.current.t;
    touchRef.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4 || dt > 600) return;
    const idx = TAB_ORDER.indexOf(tab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) selectTab(TAB_ORDER[idx + 1]);
    else if (dx > 0 && idx > 0) selectTab(TAB_ORDER[idx - 1]);
  };

  // === New-content notification badges (Story / Vinh danh / Bài đăng) ===
  const [storyCount, setStoryCount] = useState(0);
  const seenKey = targetId ? `profile.seen.v1::${targetId}` : null;
  const [lastSeen, setLastSeen] = useState<{ story: number; honors: number; posts: number }>(
    () => ({ story: 0, honors: 0, posts: 0 }),
  );
  useEffect(() => {
    if (!seenKey) return;
    try {
      const raw = localStorage.getItem(seenKey);
      if (raw) setLastSeen({ story: 0, honors: 0, posts: 0, ...JSON.parse(raw) });
      else setLastSeen({ story: 0, honors: 0, posts: 0 });
    } catch {
      /* */
    }
  }, [seenKey]);
  const honorsSignal = followersCount + (((profile as any)?.candy as number) ?? 0);
  const counts = useMemo(
    () => ({ story: storyCount, honors: honorsSignal, posts: posts.length }),
    [storyCount, honorsSignal, posts.length],
  );
  const badges = useMemo(
    () => ({
      story: Math.max(0, counts.story - (lastSeen.story ?? 0)),
      honors: Math.max(0, counts.honors - (lastSeen.honors ?? 0)),
      posts: Math.max(0, counts.posts - (lastSeen.posts ?? 0)),
    }),
    [counts, lastSeen],
  );
  // Mark current tab as seen when it (or its count) changes.
  useEffect(() => {
    if (!seenKey) return;
    const key: keyof typeof counts | null = tab === "posts" ? "posts" : null;
    if (!key) return;
    const next = { ...lastSeen, [key]: counts[key] };
    if (next[key] === lastSeen[key]) return;
    setLastSeen(next);
    try {
      localStorage.setItem(seenKey, JSON.stringify(next));
    } catch {
      /* */
    }
  }, [tab, counts, seenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) {
    if (profileError) {
      return (
        <HeartLoadError
          inline
          onRetry={() => {
            setProfileError(false);
            void loadProfile();
          }}
        />
      );
    }
    return <HeartLoader inline />;
  }

  const profileLocation = formatProfileLocation(
    (profile as any).region || profile.province || profile.location,
  );
  const activeIdx = TAB_ORDER.indexOf(tab);

  // handleBlock removed — chức năng Chặn đã gỡ hoàn toàn.

  return (
    <section
      className={`tg-profile profile-centered animate-in fade-in duration-300 ${isOwn ? "profile-centered--own" : "profile-centered--visitor"} ${isOwn && fwbModeActive ? "fwb-mode-scope" : ""}`}
    >
      {isOwn && fwbModeActive && fwbData ? (
        <FwbModeBanner
          displayName={displayName}
          interests={fwbData.interests}
          age={fwbData.age}
          city={fwbData.city || profile.province || profile.location}
        />
      ) : null}

      {/* === Modern profile header — vertical hero, name-under-avatar === */}
      <div
        className="ph3-cover"
        style={{ "--ph3-cover-bg": coverGradientFromId(profile.id) } as React.CSSProperties}
        aria-hidden="true"
      ></div>
      <ChainLockOverlay locked={isOwn && chainLocked} onUnlockRequest={handleChainUnlockRequest}>
        <div className="tg-id profile-hero-v2">
          {/* Avatar hero — viền theo bậc lượt yêu thích + badge đếm góc trên phải */}
          <div className="profile-hero-avatar">
            <ProfileStickersLayer userId={profile.id} />
            <span className="pf-avatar-row">
              <span
                className="tg-avatar-wrap pf-avatar-tier"
                data-tier={favTier(followersCount)}
                style={{ margin: 0 }}
              >
                <IntentBubble
                  userId={profile.id}
                  initialIntent={(profile as any).intent}
                  size="md"
                />
                <StoryRingAvatar
                  ref={storyRingRef}
                  userId={profile.id}
                  avatarUrl={profile.avatar}
                  isOwn={isOwn}
                  size={148}
                  onOpenViewer={(s) => setStoryView(s)}
                  onOwnAvatarTap={isOwn ? () => avatarFlow.openPicker() : undefined}
                />
              </span>
            </span>
            {isOwn ? (
              <button
                type="button"
                onClick={() => avatarFlow.openPicker()}
                className="profile-hero-avatar-edit"
                aria-label="Đổi ảnh đại diện"
                title="Đổi ảnh đại diện"
              >
                <Camera size={14} />
              </button>
            ) : null}
            {/* Badge trái tim ở góc avatar đã bỏ — số liệu nằm trong popup Theo dõi. */}
          </div>

          {/* Name + inline badges — auto-shrinks when name is long */}
          <h1 className="profile-hero-name">
            <span className="profile-hero-name-text" title={displayName}>
              {displayName}
            </span>
            {/* HỆ THỐNG 2: Media VIP (tối đa 2) dán NGAY SÁT tên, cùng một hàng. */}
            <CloneVipNameMedia userId={(profile as any)?.id ?? targetId} />
            <span className="profile-hero-badges">
              <IdentityBadges profile={profile as any} size={26} gap={6} hideVipMedia />
            </span>
          </h1>

          {/* Meta chips (UID · Khu vực) đã chuyển sang trang "Lịch sử tài khoản". */}

          {/* Số người đang theo dõi profile + nút theo dõi hiện tại. */}
          <MemberCodeBlock
            followers={followersCount}
            canFollow={!isOwn && !!me?.id && !!targetId}
            following={isFav}
            onToggleFollow={async () => {
              if (!me?.id || !targetId) return;
              const next = !isFav;
              setIsFav(next);
              bumpFollowerCount(targetId, next ? 1 : -1);
              try {
                const real = await setProfileHeart(me.id, targetId, next);
                setIsFav(real);
                if (real !== next) bumpFollowerCount(targetId, next ? -1 : 1);
              } catch (e: any) {
                setIsFav(!next);
                bumpFollowerCount(targetId, next ? -1 : 1);
                toast.error(e?.message || "Không thể cập nhật theo dõi");
              }
            }}
            onFollowersClick={() => {
              if (!isOwn) {
                setShowHiddenListNotice(true);
                return;
              }
              setFollowersInitialTab("following");
              setShowFollowers(true);
            }}
          />

          {/* === Tiểu sử (Bio) — ngay dưới UID === */}
          <ProfileBioBlock bio={(profile as any).bio} />

          {/* === Action bar — [Kết bạn Zalo] [Nhắn tin] === */}
          {!isOwn ? (
            <div
              className="social-action-bar social-action-bar--duo"
              role="group"
              aria-label="Hành động"
            >
              <ZaloLockedButton onClick={() => setShowCommunityVip(true)} />
              {((profile as any).is_virtual ||
                (profile as any).is_clone ||
                profile.status !== "suspended") &&
              !(blockedRel.iBlocked || blockedRel.theyBlocked) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (targetId) onOpenChat(targetId);
                  }}
                  className="social-btn social-btn-message"
                  aria-label="Nhắn tin"
                >
                  <MessageCircle size={16} />
                  <span>Nhắn tin</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="social-btn social-btn-message"
                  disabled
                  aria-label="Không thể nhắn tin"
                  title="Không thể nhắn tin với người dùng này"
                >
                  <MessageCircle size={16} />
                  <span>Nhắn tin</span>
                </button>
              )}
            </div>
          ) : null}

          {profile.status === "suspended" &&
          !isOwn &&
          !(profile as any).is_virtual &&
          !(profile as any).is_clone ? (
            <div className="mt-3 inline-flex items-center gap-1 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive px-3 py-1.5 text-xs">
              <ShieldAlert size={14} /> Tài khoản đã bị đình chỉ
            </div>
          ) : null}
        </div>
      </ChainLockOverlay>

      {/* === Tabs (pill gradient — đồng bộ style Yêu thích/Trang chủ) === */}
      <div className="tg-tabs tg-tabs--pill">
        <div
          className="tg-tabs-inner tg-tabs-inner--pill"
          role="tablist"
          style={{ gridTemplateColumns: `repeat(${TAB_ORDER.length}, 1fr)` }}
        >
          <TabButton
            active={tab === "posts"}
            onClick={() => selectTab("posts")}
            label={`Bài viết ${posts.length}${postsLocked ? " 🔒" : ""}`}
            badge={postsLocked ? 0 : badges.posts}
          />
          <TabButton
            active={tab === "photos"}
            onClick={() => selectTab("photos")}
            label={`Ảnh ${extractPhotoUrls(posts).length}`}
            badge={0}
          />
          <TabButton
            active={tab === "groups"}
            onClick={() => selectTab("groups")}
            label={`Nhóm`}
            badge={groupsBadgeHidden ? 0 : groups.length}
            badgePlain
          />
          <span
            className="tg-tab-bar tg-tab-bar--pill"
            style={{
              width: `calc(${100 / TAB_ORDER.length}% - 8px)`,
              transform: `translateX(calc(${activeIdx * 100}% + 4px))`,
            }}
          />
        </div>
      </div>

      {/* === Tab panels (swipeable) === */}
      <div className="tg-panels" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {visitedTabs.has("posts") ? (
          <div
            hidden={tab !== "posts"}
            aria-hidden={tab !== "posts"}
            className={
              tab === "posts"
                ? `tg-panel tg-feed ${slideDir === "right" ? "from-right" : slideDir === "left" ? "from-left" : ""}`
                : "tg-feed"
            }
          >
            {(profile as any)?.is_seed_account ? (
              <div className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
                Bài đăng của tài khoản này hiện đang bị hạn chế.
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {isOwn ? "Bạn chưa có bài đăng nào." : "Người này chưa có bài đăng nào."}
              </div>
            ) : (
              posts.map((p, idx) => (
                <LazyMount
                  key={p.id}
                  minHeight={420}
                  rootMargin={idx < 3 ? "1200px 0px" : "600px 0px"}
                >
                  <PostCard
                    meId={me?.id}
                    post={p}
                    canDelete={isOwn}
                    onRefresh={loadProfile}
                    onRemoved={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
                    onViewProfile={onViewProfile}
                    variant="profile"
                  />
                </LazyMount>
              ))
            )}
          </div>
        ) : null}

        {visitedTabs.has("photos") ? (
          <div
            hidden={tab !== "photos"}
            aria-hidden={tab !== "photos"}
            className={
              tab === "photos"
                ? `tg-panel ${slideDir === "right" ? "from-right" : slideDir === "left" ? "from-left" : ""}`
                : ""
            }
          >
            {(() => {
              const photos = extractPhotoUrls(posts);
              if (photos.length === 0) {
                return (
                  <div className="ph3-photos-empty">
                    {isOwn ? "Bạn chưa đăng ảnh nào." : "Chưa có ảnh nào."}
                  </div>
                );
              }
              return (
                <div className="ph3-photos">
                  {photos.map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      className="ph3-photo"
                      onClick={() => setLightbox(src)}
                      aria-label={`Ảnh ${i + 1}`}
                    >
                      <img
                        decoding="async"
                        src={(cldThumb(src, 400) as string) || src}
                        alt=""
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : null}

        {visitedTabs.has("groups") ? (
          <div
            hidden={tab !== "groups"}
            aria-hidden={tab !== "groups"}
            className={
              tab === "groups"
                ? `tg-panel ${slideDir === "right" ? "from-right" : slideDir === "left" ? "from-left" : ""}`
                : ""
            }
          >
            {groupsLoading ? (
              <div className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
                Đang tải nhóm…
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-3xl border bg-card p-8 text-center text-sm text-muted-foreground">
                {displayName} chưa tham gia nhóm nào
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="px-1 text-[13px] font-semibold leading-tight text-muted-foreground">
                  Các nhóm {displayName} đã tham gia
                </p>
                {groups.map((g) => (
                  <GroupCard
                    key={`${g.kind}:${g.id}`}
                    dataGroupId={g.id}
                    name={applyLocation(
                      g.name,
                      (profile as any)?.province || (profile as any)?.location || null,
                    )}
                    avatarUrl={g.avatar_url}
                    memberCount={shortCount(g.member_count)}
                    messageCount={shortCount(g.message_count)}
                    previewText={g.info ?? "Nhóm kín — tham gia ngay để xem nội dung…"}
                    onOpen={() => {
                      requestBaitFocus(g.id);
                      navigate(`/chat?bait=${g.id}`);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {lightbox ? (
        <ImageLightbox
          src={(cdnUrl(lightbox) as string) || lightbox}
          alt="Ảnh"
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {storyView ? (
        <StoryViewer
          stories={storyView}
          isOwn={isOwn}
          meId={me?.id ?? null}
          onClose={() => setStoryView(null)}
          onChanged={() => {
            /* */
          }}
          creatorName={resolveUserName(profile as any, "Thành viên")}
          creatorAvatar={profile?.avatar ?? null}
          onCreateNew={
            isOwn
              ? () => {
                  setStoryView(null);
                  setTimeout(() => storyRingRef.current?.openUpload(), 50);
                }
              : undefined
          }
        />
      ) : null}

      {/* === Sheets / Dialogs === */}

      {fwbOnboardOpen ? (
        <FwbModeOnboarding
          initial={fwbData}
          onCancel={() => setFwbOnboardOpen(false)}
          onDone={(d) => {
            const next = {
              phone: d.phone,
              age: d.age,
              interests: d.interests,
              city: fwbData?.city ?? (profile.province || profile.location || null),
            };
            setFwbData(next);
            setFwbOnboardOpen(false);
            setFwbModeActive(true);
            try {
              if (me?.id) window.localStorage.setItem(`fwb_mode_active::${me.id}`, "1");
            } catch {
              /* */
            }
          }}
        />
      ) : null}

      {/* Chức năng "Đã chặn" đã được gỡ hoàn toàn theo yêu cầu launch. */}

      <UnlockLetter open={showCommunityVip} onClose={() => setShowCommunityVip(false)} />

      {showHiddenListNotice ? (
        <div
          className="pf-hidden-list-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowHiddenListNotice(false)}
        >
          <style>{`
            .pf-hidden-list-backdrop {
              position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center;
              background: rgba(0,0,0,.45); backdrop-filter: blur(6px); padding: 16px;
            }
            .pf-hidden-list-card {
              width: min(88vw, 340px); border-radius: 22px; padding: 22px 20px 16px;
              background: hsl(var(--card)); border: 1px solid hsl(var(--border));
              text-align: center; box-shadow: 0 24px 60px rgba(0,0,0,.4);
            }
            .pf-hidden-list-card button {
              margin-top: 14px; width: 100%; padding: 11px 16px; border: 0; border-radius: 14px;
              background: linear-gradient(135deg,#a855f7,#ec4899); color: #fff; font-weight: 800; cursor: pointer;
            }
          `}</style>
          <div className="pf-hidden-list-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>
              Người dùng này đã ẩn danh sách người theo dõi.
            </div>
            <button type="button" onClick={() => setShowHiddenListNotice(false)}>
              Đã hiểu
            </button>
          </div>
        </div>
      ) : null}

      {showFollowers && targetId && isOwn ? (
        <FollowersSheet
          userId={targetId}
          followersCount={followersCount}
          initialTab={followersInitialTab}
          onClose={() => setShowFollowers(false)}
          onSelect={onViewProfile}
        />
      ) : null}

      {showTransfer && targetId ? (
        <TransferCandyDialog
          receiverId={targetId}
          receiverName={displayName}
          onClose={() => setShowTransfer(false)}
        />
      ) : null}

      {isOwn ? (
        <NotificationsPanel
          open={showNotif}
          onClose={() => setShowNotif(false)}
          onOpenChat={(id) => {
            setShowNotif(false);
            onOpenChat(id);
          }}
          onOpenPost={(postId, opts) => {
            setShowNotif(false);
            onOpenPost?.(postId, opts);
          }}
          onOpenVideo={(videoId) => {
            setShowNotif(false);
            onOpenVideo?.(videoId);
          }}
          onOpenFollowers={() => {
            setShowNotif(false);
            setShowFollowers(true);
          }}
          onConfirmCandy={async ({ senderId, amount }) => {
            const { data: sender } = await supabase
              .from("profiles")
              .select("full_name, username")
              .eq("id", senderId)
              .maybeSingle();
            setShowNotif(false);
            setConfirmCandy({
              senderId,
              senderName: resolveUserName(sender as any, "Ai đó"),
              amount,
            });
          }}
        />
      ) : null}

      {confirmCandy ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 animate-in fade-in"
          onClick={() => setConfirmCandy(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
              <CoinIcon size={18} /> Xác nhận nhận Coin
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Bạn đã nhận được{" "}
              <strong className="text-foreground">
                {confirmCandy.amount.toLocaleString()} Coin
              </strong>{" "}
              từ <strong className="text-foreground">{confirmCandy.senderName}</strong>.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted"
                onClick={() => {
                  onOpenChat(confirmCandy.senderId);
                  setConfirmCandy(null);
                }}
              >
                <MessageCircle size={14} /> Cảm ơn qua chat
              </button>
              <button
                className="inline-flex items-center rounded-lg bg-foreground text-background px-3 py-2 text-sm font-semibold"
                onClick={() => setConfirmCandy(null)}
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Avatar change flow (portal cropper) — always mounted for own profile */}
      {isOwn ? avatarFlow.flowNode : null}

      {/* Card nổi mở "Thẻ hồ sơ thành viên" — dùng avatar của profile đang xem */}
      {targetId ? (
        <ProfileIdFab userId={targetId} avatar={profile.avatar} alt={displayName} />
      ) : null}
    </section>
  );
}

const TabButton = memo(function TabButton({
  active,
  onClick,
  label,
  badge,
  badgePlain,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  badgePlain?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`tg-tab ${active ? "is-active" : ""}`}
    >
      {label}
      {badge && badge > 0 ? (
        <span className="tg-tab-badge" aria-label={`${badge} mới`}>
          {badgePlain ? "" : "+"}
          {badge > 99 ? "99" : badge}
        </span>
      ) : null}
    </button>
  );
});

function ProfileBioBlock({ bio }: { bio: string | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const [isClamped, setIsClamped] = useState(false);
  const text = (bio ?? "").trim();

  useEffect(() => {
    if (!ref.current || !text) return;
    const el = ref.current;
    // If content overflows 2-line clamp we know we need "Xem thêm".
    setIsClamped(el.scrollHeight - el.clientHeight > 1);
  }, [text]);

  if (!text) {
    return (
      <div className="profile-bio-block is-empty" aria-label="Chưa có tiểu sử">
        Chưa có tiểu sử.
      </div>
    );
  }
  return (
    <div className="profile-bio-block">
      <div ref={ref} className={`profile-bio-text${expanded ? " is-expanded" : ""}`}>
        {text}
      </div>
      {isClamped && !expanded ? (
        <button type="button" className="profile-bio-more" onClick={() => setExpanded(true)}>
          … Xem thêm
        </button>
      ) : null}
    </div>
  );
}

/** Số người đang theo dõi profile và nút theo dõi hiện tại. */
function followerTier(n: number): number {
  if (n >= 10000) return 5;
  if (n >= 5000) return 4;
  if (n >= 1000) return 3;
  if (n >= 500) return 2;
  if (n >= 100) return 1;
  return 0;
}

function MemberCodeBlock({
  followers = 0,
  onFollowersClick,
  canFollow = false,
  following = false,
  onToggleFollow,
}: {
  followers?: number;
  onFollowersClick?: () => void;
  canFollow?: boolean;
  following?: boolean;
  onToggleFollow?: () => void | Promise<void>;
}) {
  return (
    <div className="member-code-block">
      <style>{`
        .member-code-block {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          margin: 2px 0 8px; flex-wrap: nowrap; white-space: nowrap;
        }
        .member-follow-badge {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          min-width: 62px; height: 30px; padding: 0 11px; border-radius: 9px; cursor: pointer;
          font-size: 14px; font-weight: 700; line-height: 1; letter-spacing: .3px;
          color: #a07c2c;
          background: linear-gradient(180deg, #fffdf6 0%, #f8f1df 100%);
          border: 1px solid rgba(212, 175, 55, .34);
          box-shadow:
            0 1px 3px rgba(160, 124, 44, .10),
            inset 0 1px 0 rgba(255, 255, 255, .85);
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 140ms ease;
        }
        .member-follow-badge:hover {
          border-color: rgba(212, 175, 55, .55);
          box-shadow:
            0 2px 6px rgba(160, 124, 44, .14),
            inset 0 1px 0 rgba(255, 255, 255, .9);
        }
        .member-follow-badge:active { transform: scale(.96); }
        .member-follow-badge svg { color: #c3a04c; opacity: .95; }
        .member-follow-badge span { font-variant-numeric: tabular-nums; }
        .member-follow-badge[data-tier="4"], .member-follow-badge[data-tier="5"] {
          border-color: rgba(212, 175, 55, .5);
        }
        .member-follow-cta {
          display: inline-flex; align-items: center; gap: 6px;
          height: 30px; padding: 0 14px; border-radius: 999px; cursor: pointer;
          font-size: 13px; font-weight: 700; line-height: 1; letter-spacing: .3px;
          color: #6d541a;
          background: linear-gradient(180deg, #fffdf6 0%, #f9efdb 45%, #f0dfb4 100%);
          border: 1px solid rgba(255, 255, 255, .9);
          box-shadow:
            0 2px 8px rgba(180, 141, 42, .16),
            0 1px 2px rgba(160, 124, 44, .08),
            inset 0 1px 0 rgba(255, 255, 255, .95);
          transition: transform 140ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .member-follow-cta:hover { filter: brightness(1.02); border-color: rgba(212, 175, 55, .4); }
        .member-follow-cta:active { transform: scale(.95); }
        .member-follow-cta svg { color: currentColor; }
        .member-follow-cta[data-following="1"] {
          color: #a07c2c;
          background: linear-gradient(180deg, #fffdf6 0%, #f8f1df 100%);
          border-color: rgba(212, 175, 55, .42);
          box-shadow:
            0 1px 3px rgba(160, 124, 44, .10),
            inset 0 1px 0 rgba(255, 255, 255, .85);
          animation: mc-follow-pop 320ms cubic-bezier(.22, 1.4, .36, 1);
        }
        @keyframes mc-follow-pop {
          0% { transform: scale(.9); }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .member-follow-cta, .member-follow-cta[data-following="1"] { transition: none; animation: none; }
        }
      `}</style>
      <button
        type="button"
        className="member-follow-badge"
        data-tier={followerTier(followers)}
        onClick={onFollowersClick}
        aria-label={`${followers.toLocaleString("vi-VN")} người đang theo dõi`}
        title={`${followers.toLocaleString("vi-VN")} người đang theo dõi`}
      >
        <Users size={15} strokeWidth={2.2} aria-hidden="true" />
        <span>{followers.toLocaleString("vi-VN")}</span>
      </button>
      {canFollow ? (
        <button
          type="button"
          className="member-follow-cta"
          data-following={following ? "1" : "0"}
          onClick={() => void onToggleFollow?.()}
          aria-pressed={following}
          aria-label={following ? "Đang theo dõi — bấm để bỏ theo dõi" : "Theo dõi"}
          title={following ? "Bấm để bỏ theo dõi" : "Theo dõi"}
        >
          {following ? (
            <Check size={15} strokeWidth={3} aria-hidden="true" />
          ) : (
            <UserPlus size={15} strokeWidth={2.6} aria-hidden="true" />
          )}
          <span>{following ? "Đang theo dõi" : "Theo dõi"}</span>
        </button>
      ) : null}
    </div>
  );
}
