import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/profile-zalo.css";
import "@/styles/unlock-letter.css";
import {
  MessageCircle, ShieldAlert,
  MoreVertical, Camera, Venus, Mars, Transgender, Check, UserPlus,
} from "lucide-react";
import { UnlockLetter, ZaloLockedButton } from "@/components/candy/unlock-letter";
import { setProfileHeart, useIsFollowing } from "@/lib/follow-actions";


// (using useState imported above for ProfileBioBlock)
import { CoinIcon } from "@/components/candy/coin-icon";
import { toast } from "sonner";
import { TransferCandyDialog } from "@/components/candy/transfer-candy-dialog";
import { useAuth } from "@/components/candy/auth-provider";
import { PostCard } from "@/components/candy/post-card";
import { FollowersSheet } from "@/components/candy/followers-sheet";
import { IdentityBadges } from "@/components/candy/identity-badges";
import { ReportModal } from "@/components/candy/report-modal";
// GenderIcon removed from profile hero — gender now shown as a larger badge beside the name.
import { NotificationsPanel, useUnreadNotifications } from "@/components/candy/notifications-panel";
import { ProfileMenuSheet } from "@/components/candy/profile-menu-sheet";
import { ProfileMoreCoachmark } from "@/components/candy/profile-more-coachmark";
import { EditProfileSheet } from "@/components/candy/edit-profile-sheet";
import { adminPath } from "@/lib/admin-slug";
// Chức năng "Chặn" đã được gỡ hoàn toàn — không còn BlockedListSheet.
import { IntroCard } from "@/components/candy/intro-card";
import { IntentBubble } from "@/components/candy/intent-bubble";
import { ImageLightbox } from "@/components/candy/image-lightbox";
import { getMediaUrl as cdnUrl, getMediaThumb as cldThumb } from "@/lib/media";
import { ProfileStickersLayer } from "@/components/candy/profile-stickers-layer";
import { StoryRingAvatar, type StoryRecord, type StoryRingAvatarHandle } from "@/components/candy/story-ring-avatar";
import { ChainLockOverlay } from "@/components/candy/chain-lock-overlay";
import { useIdleLock } from "@/hooks/use-idle-lock";
import { openPopup } from "@/components/candy/popup-engine";
import { StoryViewer } from "@/components/candy/story-viewer";
import { HallOfFame } from "@/components/candy/hall-of-fame";
import { useAvatarChangeFlow } from "@/components/candy/change-avatar-flow";

import { PeopleYouMayKnow } from "@/components/candy/people-you-may-know";
// Task #5.1: bỏ khóa VIP bài viết — không còn dùng LockedPostsCard cho posts.
import { LazyMount } from "@/components/candy/lazy-mount";
import { FwbModeOnboarding } from "@/components/candy/fwb-mode-onboarding";
import { FwbModeBanner } from "@/components/candy/fwb-mode-banner";
import { supabase } from "@/lib/supabase";
import { VIRTUAL_TABLE } from "@/lib/virtual-profiles";

// POSTS_VIEW_REQUIRED_VIP removed — mọi thành viên đều xem được bài viết.
import { getTotalFollowerCount } from "@/lib/buff-followers";
import { useFollowerCount } from "@/lib/follow-count-store";
import { spawnPlusOne } from "@/lib/heart-fly";

import type { PostRecord, Profile } from "@/lib/app-types";
import { ContactPanel } from "@/components/candy/contact-panel";
import { isMissingRelationError } from "@/lib/db-compat";
import { formatCompact } from "@/lib/format";
import { favTier, formatFavCount, favPublicSummary } from "@/lib/favorites";
import { recordProfileView } from "@/lib/profile-views";
import { VipMedia } from "@/components/vip/vip-media";
import { vipIconSize } from "@/lib/vip-sizes";
// PetsProfilePanel đã bị gỡ — thay tab bằng "Liên hệ" (Facebook / Zalo).

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROFILE_CACHE_KEY_PREFIX = "profile.cache.v2::";
const PROFILE_COLS = "id, full_name, username, public_id, avatar, bio, location, province, region, candy, followers_count, vip_level, vip_exp, is_admin, is_online, last_seen, is_virtual, is_banned, banned_until, name_changes, last_name_change, status, ban_reason, trust_score, reputation_score, title_gif_url, created_at, role, height, weight, intent, intent_locked_until, location_last_changed_at, location_change_count, gender, phone, age, interests, is_fwb_active, is_seed_account, nickname, birthday, zodiac, relationship_status, personality_tags, communication_styles, goal, target_gender, preferred_language, location_visibility, gender_visibility, birthday_visibility, zodiac_visibility, relationship_visibility, goal_visibility, identity_crown, identity_pet, identity_flag";
const VIDEOS_SOCIAL_COLS = "id, user_id, video_url, caption, created_at";
const VIRTUAL_TABLE_COLS = "id, display_name, full_name, username, avatar, avatar_url, bio, location, province, is_virtual, is_clone, status, is_banned, banned_until, followers_count, vip_level, trust_score";
const SEED_ACCOUNTS_COLS = "id, display_name, username, avatar, bio, gender, age, distance_km, is_online, is_active, province, created_at, updated_at";
const POSTS_PROFILE_COLS = "id, user_id, content, image_url, likes_count, comments_count, created_at, image_urls, visibility, status, has_images, virtual_view_base, category, display_view_offset, is_anonymous, is_admin_post, admin_priority, is_pinned, is_popup, facebook_url, zalo_url, gif_url";

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
  } catch { return null; }
}
function writeProfileCache(id: string, data: Profile) {
  try { sessionStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${id}`, JSON.stringify({ data, ts: Date.now() })); } catch { /* */ }
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
  if (Date.now() - b.ts > PROFILE_CACHE_TTL_MS) { PROFILE_BUNDLE.delete(id); return null; }
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

type TabKey = "posts" | "photos" | "contact";
const TAB_ORDER: TabKey[] = ["posts", "photos", "contact"];

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

export function ProfilePage({ userId, onViewProfile, onOpenChat, onOpenPost, onOpenVideo, onBack, onProfileName }: ProfilePageProps) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const { count: unreadNotif } = useUnreadNotifications();
  const avatarFlow = useAvatarChangeFlow({ userId: me?.id ?? null });

  const [profile, setProfile] = useState<Profile | null>(null);
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
  const [followersInitialTab, setFollowersInitialTab] = useState<"followers" | "following">("followers");
  const [showHiddenListNotice, setShowHiddenListNotice] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // showBlocked state removed — chức năng Chặn đã gỡ.
  const [confirmCandy, setConfirmCandy] = useState<{ senderId: string; senderName: string; amount: number } | null>(null);
  const [tab, setTab] = useState<TabKey>("posts");
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(() => new Set<TabKey>(["posts"]));
  const selectTab = useCallback((next: TabKey) => {
    setTab((prev) => {
      if (prev === next) return prev;
      const a = TAB_ORDER.indexOf(prev);
      const b = TAB_ORDER.indexOf(next);
      setSlideDir(b > a ? "right" : "left");
      return next;
    });
    setVisitedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }, []);
  const [blockedRel, setBlockedRel] = useState<{ iBlocked: boolean; theyBlocked: boolean }>({ iBlocked: false, theyBlocked: false });
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
        if ((prev as any)[k] !== (me as any)[k]) { changed = true; break; }
      }
      return changed ? { ...prev, ...me } : prev;
    });
  }, [isOwn, me]);

  useEffect(() => {
    if (!isOwn || !me?.id) return;
    const flag = typeof window !== "undefined"
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
      } catch (e) { console.warn("[fwb-mode] load fwb_profiles failed", e); }
    })();
  }, [isOwn, me?.id]);

  const handleToggleFwbMode = useCallback(() => {
    if (!isOwn || !me?.id) return;
    if (fwbModeActive) {
      setFwbModeActive(false);
      try { window.localStorage.removeItem(`fwb_mode_active::${me.id}`); } catch { /* */ }
      return;
    }
    const ready =
      fwbData &&
      typeof fwbData.phone === "string" && fwbData.phone.length >= 9 &&
      typeof fwbData.age === "number" && fwbData.age >= 18 &&
      Array.isArray(fwbData.interests) && fwbData.interests.length > 0;
    if (ready) {
      setFwbModeActive(true);
      try { window.localStorage.setItem(`fwb_mode_active::${me.id}`, "1"); } catch { /* */ }
    } else {
      setFwbOnboardOpen(true);
    }
  }, [isOwn, me?.id, fwbModeActive, fwbData]);

  const loadProfile = useCallback(async () => {
    if (!targetId) return;
    // Gọi loadProfile là hành vi làm mới có chủ đích → bỏ cache cũ.
    PROFILE_BUNDLE.delete(targetId);
    const videoQuery = supabase.from("videos_social" as any).select(VIDEOS_SOCIAL_COLS).eq("user_id", targetId).order("created_at", { ascending: false });
    const fetchProfile = async () => {
      let cols = PROFILE_COLS;
      for (let i = 0; i < 6; i++) {
        const res = await supabase.from("profiles").select(cols).eq("id", targetId).maybeSingle();
        if (!res.error) return res;
        const msg = res.error.message || "";
        const m = msg.match(/column "?([a-zA-Z_]+)"? does not exist/i)
          || msg.match(/(public_id|reputation_score|interests|is_fwb_active|is_seed_account|age|region|nickname|birthday|zodiac|relationship_status|personality_tags|communication_styles|goal|target_gender|preferred_language)/i);
        if (!m) return res;
        const missing = m[1];
        const stripped = cols.split(",").map((c) => c.trim()).filter((c) => c !== missing).join(", ");
        if (stripped === cols) return res;
        cols = stripped;
      }
      return supabase.from("profiles").select("id, full_name, username, avatar, bio").eq("id", targetId).maybeSingle();
    };
    const fetchVirtualFallback = async () => {
      const res = await supabase.from(VIRTUAL_TABLE as any).select(VIRTUAL_TABLE_COLS).eq("id", targetId).maybeSingle();
      if (res.error || !res.data) return null;
      const row: any = res.data;
      // Mark as virtual + clear any field that would flip the suspended overlay.
      row.full_name = row.display_name || row.full_name || row.username || null;
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
      const res = await supabase.from("seed_accounts" as any).select(SEED_ACCOUNTS_COLS).eq("id", targetId).maybeSingle();
      if (res.error || !res.data) return null;
      const s: any = res.data;
      return {
        id: s.id,
        full_name: s.display_name || s.username || null,
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
              location: (virtualRow as any).location || nextProfile!.location || virtualRow.province || null,
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
        } catch { /* silent */ }
      })();
    } else {
      setProfile(null);
    }

    // 2) Lazy secondary data — each state updates independently, non-blocking.
    const profileForPosts = nextProfile;
    if (!postsLocked) {
      // Perf: tải 24 bài đầu để hiển thị ngay, phần còn lại nạp nền rồi nối vào.
      const mapPost = (p: any): PostRecord => ({
        ...p,
        profiles: profileForPosts
          ? {
              id: profileForPosts.id,
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
          const base = () => supabase.from("posts")
            .select(POSTS_PROFILE_COLS).eq("user_id", targetId)
            .neq("visibility", "feedback").neq("is_admin_post", true)
            .neq("category", "important")
            .order("created_at", { ascending: false });

          const { data: firstData } = await base().range(0, FIRST_PAGE - 1);
          const firstRows = ((firstData as any[]) || []).map(mapPost);
          setPosts(firstRows);
          patchProfileBundle(targetId, { posts: firstRows });

          if (firstRows.length === FIRST_PAGE) {
            const { data: restData } = await base().range(FIRST_PAGE, 999);
            const restRows = ((restData as any[]) || []).map(mapPost);
            if (restRows.length) {
              setPosts((prev) => {
                const merged = [...prev, ...restRows];
                patchProfileBundle(targetId, { posts: merged });
                return merged;
              });
            }
          }
        } catch { /* silent */ }
      })();
    } else {

      setPosts([]);
      patchProfileBundle(targetId, { posts: [] });
    }

    void (async () => {
      try {
        const videoResult = await videoQuery;
        const safeVideoRows = videoResult.error && isMissingRelationError(videoResult.error) ? [] : ((videoResult.data as any[]) || []);
        setVideos(safeVideoRows);
        patchProfileBundle(targetId, { videos: safeVideoRows });
      } catch { /* silent */ }
    })();

    void (async () => {
      try {
        const n = (await getTotalFollowerCount(targetId)) || 0;
        setFollowersBase(n);
        patchProfileBundle(targetId, { followersBase: n });
      } catch { /* silent */ }
    })();

    void (async () => {
      try {
        const { count } = await supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", targetId);
        setFollowingCount(count || 0);
        patchProfileBundle(targetId, { followingCount: count || 0 });
      } catch { /* silent */ }
    })();
  }, [targetId, postsLocked, me?.id]);

  useEffect(() => {
    if (!targetId) return;
    const bundle = readProfileBundle(targetId);
    if (bundle?.profile) {
      // Cache còn hạn (5 phút) → dựng lại toàn bộ hồ sơ từ bộ nhớ, không query.
      setProfile(bundle.profile);
      setPosts(bundle.posts);
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
        .or(`and(blocker_id.eq.${me.id},target_id.eq.${targetId}),and(blocker_id.eq.${targetId},target_id.eq.${me.id})`);
      if (cancelled) return;
      const arr = (rows as any[]) || [];
      setBlockedRel({
        iBlocked: arr.some((r) => r.blocker_id === me.id),
        theyBlocked: arr.some((r) => r.blocker_id === targetId),
      });
    })();
    return () => { cancelled = true; };
  }, [me?.id, targetId, isOwn]);

  useEffect(() => {
    if (!targetId) return;
    const channel = supabase
      .channel(`profile-view-${targetId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${targetId}` },
        (payload) => setProfile((prev) => {
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
        }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [targetId]);

  // Log profile view (aggregated server-side, daily reset, 1 lần / 1 viewer / 1 ngày)
  useEffect(() => {
    if (!me?.id || !targetId || isOwn) return;
    const t = window.setTimeout(() => {
      void supabase.rpc("log_profile_view" as any, { p_target: targetId } as any);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [me?.id, targetId, isOwn]);

  useEffect(() => {
    if (!targetId) return;
    const refreshFollowers = async () => setFollowersBase(await getTotalFollowerCount(targetId));
    const ch = supabase
      .channel(`follows-${targetId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${targetId}` }, () => void refreshFollowers())
      .on("postgres_changes", { event: "*", schema: "public", table: "fake_follows", filter: `following_id=eq.${targetId}` }, () => void refreshFollowers())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [targetId]);

  useEffect(() => {
    if (!targetId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void loadProfile(); }, 600);
    };
    const ch = supabase
      .channel(`profile-posts-${targetId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: `user_id=eq.${targetId}` }, scheduleReload)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const displayName = useMemo(() => profile?.full_name || "Người dùng", [profile]);

  useEffect(() => {
    if (profile?.full_name) onProfileName?.(profile.full_name);
  }, [profile?.full_name, onProfileName]);

  // Swipe gesture on tab panels — isolated from carousels and header.
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    // Gesture isolation: ignore swipes that start inside a horizontal carousel
    // (Tin nổi bật) or anywhere within the profile header identity block.
    if (target && target.closest('.featured-moments, .tg-id, .pm-card--carousel, .embla, .embla__viewport, [data-embla-container], [data-no-tab-swipe="true"]')) {
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
    } catch { /* */ }
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
    const key: keyof typeof counts | null =
      tab === "posts" ? "posts" : null;
    if (!key) return;
    const next = { ...lastSeen, [key]: counts[key] };
    if (next[key] === lastSeen[key]) return;
    setLastSeen(next);
    try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* */ }
  }, [tab, counts, seenKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) {
    return (
      <section className="space-y-4 animate-pulse">
        <div className="h-44 rounded-2xl bg-muted" />
        <div className="h-24 rounded-2xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </section>
    );
  }

  const profileLocation = formatProfileLocation((profile as any).region || profile.province || profile.location);
  const displayId = profile.public_id || profile.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  const activeIdx = TAB_ORDER.indexOf(tab);

  // handleBlock removed — chức năng Chặn đã gỡ hoàn toàn.

  return (
    <section className={`tg-profile animate-in fade-in duration-300 ${isOwn && fwbModeActive ? "fwb-mode-scope" : ""}`}>
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
      >
        <button
          type="button"
          aria-label="Tuỳ chọn"
          onClick={() => setShowMenu(true)}
          className="ph3-more"
        >
          <MoreVertical size={18} />
        </button>
        <ProfileMoreCoachmark targetUserId={profile.id} disabled={isOwn} />
      </div>
      <ChainLockOverlay
        locked={isOwn && chainLocked}
        onUnlockRequest={handleChainUnlockRequest}
      >
      <div
        className="tg-id profile-hero-v2"
        style={{ alignItems: "center", textAlign: "center" }}
      >
        {/* Avatar hero — viền theo bậc lượt yêu thích + badge đếm góc trên phải */}
        <div className="profile-hero-avatar">
          <ProfileStickersLayer userId={profile.id} />
          <span className="pf-avatar-row">
            <span className="tg-avatar-wrap pf-avatar-tier" data-tier={favTier(followersCount)} style={{ margin: 0 }}>
              <IntentBubble userId={profile.id} initialIntent={(profile as any).intent} size="md" />
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
            {/* HỆ THỐNG 2: Media VIP dán ngay sát tên trong hồ sơ. */}
            
          </span>
          <span className="profile-hero-badges">
            <IdentityBadges profile={profile as any} size={26} gap={6} />
          </span>

        </h1>

        {/* Meta chips (UID · Khu vực) đã chuyển sang trang "Lịch sử tài khoản". */}





        {/* === Dòng UID: #CODE 📋 👥126 (cùng 1 hàng) === */}
        <MemberCodeBlock
          code={displayId}
          gender={(profile as any).gender}
          followers={followersCount}
          canFollow={!isOwn && !!me?.id && !!targetId}
          following={isFav}
          onToggleFollow={async () => {
            if (!me?.id || !targetId) return;
            const next = !isFav;
            setIsFav(next);
            try {
              const real = await setProfileHeart(me.id, targetId, next);
              setIsFav(real);
            } catch (e: any) {
              setIsFav(!next);
              toast.error(e?.message || "Không thể cập nhật theo dõi");
            }
          }}
          onFollowersClick={() => {
            if (!isOwn) { setShowHiddenListNotice(true); return; }
            setFollowersInitialTab("following");
            setShowFollowers(true);
          }}
        />

        {/* === Tiểu sử (Bio) — ngay dưới UID === */}
        <ProfileBioBlock bio={(profile as any).bio} />



        {/* === Action bar — [Kết bạn Zalo] [Nhắn tin] === */}
        {!isOwn ? (
          <div className="social-action-bar social-action-bar--duo" role="group" aria-label="Hành động">
            <ZaloLockedButton onClick={() => setShowCommunityVip(true)} />
            {((profile as any).is_virtual || (profile as any).is_clone || profile.status !== "suspended") && !(blockedRel.iBlocked || blockedRel.theyBlocked) ? (
              <button
                type="button"
                onClick={() => { if (targetId) onOpenChat(targetId); }}
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







        {profile.status === "suspended" && !isOwn && !(profile as any).is_virtual && !(profile as any).is_clone ? (
          <div className="mt-3 inline-flex items-center gap-1 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive px-3 py-1.5 text-xs">
            <ShieldAlert size={14} /> Tài khoản đã bị đình chỉ
          </div>
        ) : null}
      </div>
      </ChainLockOverlay>

      {/* === Tabs (pill gradient — đồng bộ style Yêu thích/Trang chủ) === */}
      <div className="tg-tabs tg-tabs--pill">
        <div className="tg-tabs-inner tg-tabs-inner--pill" role="tablist" style={{ gridTemplateColumns: `repeat(${TAB_ORDER.length}, 1fr)` }}>
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
            active={tab === "contact"}
            onClick={() => selectTab("contact")}
            label={`Liên hệ`}
            badge={0}
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
          <div hidden={tab !== "posts"} aria-hidden={tab !== "posts"}
            className={tab === "posts" ? `tg-panel tg-feed ${slideDir === "right" ? "from-right" : slideDir === "left" ? "from-left" : ""}` : "tg-feed"}>
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
                <LazyMount key={p.id} minHeight={420} rootMargin={idx < 3 ? "1200px 0px" : "600px 0px"}>
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
          <div hidden={tab !== "photos"} aria-hidden={tab !== "photos"}
            className={tab === "photos" ? `tg-panel ${slideDir === "right" ? "from-right" : slideDir === "left" ? "from-left" : ""}` : ""}>
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
                      <img decoding="async" src={(cldThumb(src, 400) as string) || src} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : null}

        {visitedTabs.has("contact") ? (
          <div hidden={tab !== "contact"} aria-hidden={tab !== "contact"}
            className={tab === "contact" ? `tg-panel ${slideDir === "right" ? "from-right" : slideDir === "left" ? "from-left" : ""}` : ""}>
            <ContactPanel profile={profile} isOwn={!!isOwn} />
          </div>
        ) : null}
      </div>

      {lightbox ? (
        <ImageLightbox src={(cdnUrl(lightbox) as string) || lightbox} alt="Ảnh" onClose={() => setLightbox(null)} />
      ) : null}

      {storyView ? (
        <StoryViewer
          stories={storyView}
          isOwn={isOwn}
          meId={me?.id ?? null}
          onClose={() => setStoryView(null)}
          onChanged={() => { /* */ }}
          creatorName={profile?.full_name ?? profile?.username ?? null}
          creatorAvatar={profile?.avatar ?? null}
          onCreateNew={isOwn ? () => { setStoryView(null); setTimeout(() => storyRingRef.current?.openUpload(), 50); } : undefined}
        />
      ) : null}

      {!isOwn && targetId ? (
        <PeopleYouMayKnow
          province={profile.province || profile.location || me?.province || me?.location || null}
          onOpenProfile={onViewProfile}
        />
      ) : null}

      {/* === Sheets / Dialogs === */}

      <ProfileMenuSheet
        open={showMenu}
        onClose={() => setShowMenu(false)}
        isOwn={isOwn}
        onEdit={() => setShowEdit(true)}
        onLogout={() => void logout()}
        onReport={!isOwn && targetId ? () => setShowReport(true) : undefined}
        isAdmin={me?.is_admin === true}
        onOpenAdmin={me?.is_admin === true ? () => { const p = adminPath("/login"); if (p) navigate(p); } : undefined}
        onOpenAccountHistory={() => {
          if (targetId) navigate(`/account/${targetId}`);
        }}
        fwbModeActive={fwbModeActive}
        onToggleFwbMode={isOwn ? handleToggleFwbMode : undefined}
      />

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
            try { if (me?.id) window.localStorage.setItem(`fwb_mode_active::${me.id}`, "1"); } catch { /* */ }
          }}
        />
      ) : null}

      {/* Chức năng "Đã chặn" đã được gỡ hoàn toàn theo yêu cầu launch. */}

      {!isOwn && targetId ? (
        <ReportModal open={showReport} targetId={targetId} onClose={() => setShowReport(false)} />
      ) : null}

      <UnlockLetter open={showCommunityVip} onClose={() => setShowCommunityVip(false)} />




      {isOwn ? (
        <EditProfileSheet
          open={showEdit}
          onClose={() => setShowEdit(false)}
          profile={profile}
          onSaved={() => void loadProfile()}
        />
      ) : null}

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
            <button type="button" onClick={() => setShowHiddenListNotice(false)}>Đã hiểu</button>
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
          onOpenChat={(id) => { setShowNotif(false); onOpenChat(id); }}
          onOpenPost={(postId, opts) => { setShowNotif(false); onOpenPost?.(postId, opts); }}
          onOpenVideo={(videoId) => { setShowNotif(false); onOpenVideo?.(videoId); }}
          onOpenFollowers={() => { setShowNotif(false); setShowFollowers(true); }}
          onConfirmCandy={async ({ senderId, amount }) => {
            const { data: sender } = await supabase
              .from("profiles").select("full_name, username").eq("id", senderId).maybeSingle();
            setShowNotif(false);
            setConfirmCandy({
              senderId,
              senderName: sender?.full_name || sender?.username || "Ai đó",
              amount,
            });
          }}
        />
      ) : null}

      {confirmCandy ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 animate-in fade-in" onClick={() => setConfirmCandy(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
              <CoinIcon size={18} /> Xác nhận nhận Coin
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Bạn đã nhận được <strong className="text-foreground">{confirmCandy.amount.toLocaleString()} Coin</strong> từ{" "}
              <strong className="text-foreground">{confirmCandy.senderName}</strong>.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted"
                onClick={() => { onOpenChat(confirmCandy.senderId); setConfirmCandy(null); }}
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
    </section>
  );
}

const TabButton = memo(function TabButton({
  active, onClick, label, badge,
}: { active: boolean; onClick: () => void; label: string; badge?: number }) {
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
          +{badge > 99 ? "99" : badge}
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
      <div
        ref={ref}
        className={`profile-bio-text${expanded ? " is-expanded" : ""}`}
      >
        {text}
      </div>
      {isClamped && !expanded ? (
        <button
          type="button"
          className="profile-bio-more"
          onClick={() => setExpanded(true)}
        >
          … Xem thêm
        </button>
      ) : null}
    </div>
  );
}


/** V6 — Dòng UID: #MÃ · copy · badge 👥 số người theo dõi (cùng một hàng). */
function followerTier(n: number): number {
  if (n >= 10000) return 5;
  if (n >= 5000) return 4;
  if (n >= 1000) return 3;
  if (n >= 500) return 2;
  if (n >= 100) return 1;
  return 0;
}

function normalizeGender(g?: string | null): "female" | "male" | "other" | null {
  if (!g) return null;
  const v = String(g).trim().toLowerCase();
  if (["female", "nu", "nữ", "f", "girl", "woman"].includes(v)) return "female";
  if (["male", "nam", "m", "boy", "man"].includes(v)) return "male";
  return "other";
}

function MemberCodeBlock({
  code, gender, followers = 0, onFollowersClick, canFollow = false, following = false, onToggleFollow,
}: {
  code: string;
  gender?: string | null;
  followers?: number;
  onFollowersClick?: () => void;
  canFollow?: boolean;
  following?: boolean;
  onToggleFollow?: () => void | Promise<void>;
}) {
  const g = normalizeGender(gender);
  const GenderIcon = g === "female" ? Venus : g === "male" ? Mars : Transgender;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Đã sao chép mã thành viên");
    } catch {
      toast.error("Không thể sao chép");
    }
  };
  return (
    <div className="member-code-block">
      <style>{`
        @keyframes mc-led { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes mc-rainbow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
        .member-code-block {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin: 2px 0 8px; flex-wrap: nowrap; white-space: nowrap;
        }
        .member-code-text {
          font-size: 16px; font-weight: 900; letter-spacing: 2px;
          background: linear-gradient(90deg,#ec4899,#a855f7,#38bdf8,#ec4899);
          background-size: 200% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: mc-led 4s linear infinite;
          filter: drop-shadow(0 0 6px rgba(168,85,247,.35));
        }
        .member-code-copy {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; padding: 0; border: 0; background: transparent;
          color: #9ca3af; cursor: pointer; transition: color 140ms ease, transform 140ms ease;
        }
        .member-code-copy:hover { color: #a855f7; }
        .member-code-copy:active { transform: scale(.9); }
        .member-gender-badge {
          display: inline-flex; align-items: center; justify-content: center;
          height: 28px; padding: 0 10px; border-radius: 999px;
          border: 1px solid rgba(236,72,153,.28);
          color: #ec4899;
          background:
            linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.12)),
            linear-gradient(135deg, rgba(236,72,153,.14), rgba(236,72,153,.06));
          box-shadow: 0 4px 12px rgba(236,72,153,.18), inset 0 1px 0 rgba(255,255,255,.6);
          backdrop-filter: blur(10px);
          transition: transform 150ms ease;
          will-change: transform;
        }
        .member-gender-badge:hover { transform: scale(1.05); }
        .member-gender-badge:active { transform: scale(.97); }
        .member-gender-badge[data-gender="male"] {
          color: #3b82f6;
          border-color: rgba(59,130,246,.28);
          background:
            linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.12)),
            linear-gradient(135deg, rgba(59,130,246,.14), rgba(59,130,246,.06));
          box-shadow: 0 4px 12px rgba(59,130,246,.18), inset 0 1px 0 rgba(255,255,255,.6);
        }
        .member-gender-badge[data-gender="other"] {
          color: #a855f7;
          border-color: rgba(168,85,247,.28);
          background:
            linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.12)),
            linear-gradient(135deg, rgba(168,85,247,.14), rgba(168,85,247,.06));
          box-shadow: 0 4px 12px rgba(168,85,247,.18), inset 0 1px 0 rgba(255,255,255,.6);
        }
        .member-follow-badge {
          display: inline-flex; align-items: center; gap: 6px;
          height: 28px; padding: 0 10px; border-radius: 999px; cursor: pointer;
          font-size: 13px; font-weight: 800; line-height: 1; letter-spacing: .2px;
          color: #fff;
          backdrop-filter: blur(16px);
          background:
            linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.08)),
            linear-gradient(135deg, #9ca3af, #6b7280);
          border: 1px solid rgba(255,255,255,.25);
          box-shadow: 0 6px 20px rgba(0,0,0,.12);
          transition: transform 140ms ease, box-shadow 140ms ease;
        }
        .member-follow-badge:hover { box-shadow: 0 8px 24px rgba(0,0,0,.18); }
        .member-follow-badge:active { transform: scale(.96); }
        .member-follow-badge svg { color: #fff; }
        .member-follow-badge[data-tier="1"] {
          background:
            linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.08)),
            linear-gradient(135deg, #38bdf8, #2563eb);
        }
        .member-follow-badge[data-tier="2"] {
          background:
            linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.08)),
            linear-gradient(135deg, #a855f7, #7c3aed);
        }
        .member-follow-badge[data-tier="3"] {
          background:
            linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.08)),
            linear-gradient(135deg, #fbbf24, #d97706);
        }
        .member-follow-badge[data-tier="4"] {
          background:
            linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.06)),
            linear-gradient(100deg, #fde68a, #f59e0b, #fbbf24, #b45309);
          box-shadow: 0 6px 20px rgba(217,119,6,.28);
        }
        .member-follow-badge[data-tier="5"] {
          background:
            linear-gradient(135deg, rgba(255,255,255,.20), rgba(255,255,255,.06)),
            linear-gradient(100deg, #f87171, #fbbf24, #34d399, #60a5fa, #c084fc);
          box-shadow: 0 6px 22px rgba(96,165,250,.26);
        }
        .member-follow-cta {
          display: inline-flex; align-items: center; gap: 6px;
          height: 30px; padding: 0 13px; border-radius: 999px; cursor: pointer;
          font-size: 13px; font-weight: 800; line-height: 1; letter-spacing: .2px;
          color: #fff; border: 1px solid rgba(255,255,255,.28);
          background: linear-gradient(135deg,#ff5f8f,#ec4899 45%,#a855f7);
          box-shadow: 0 6px 18px rgba(236,72,153,.32), inset 0 1px 0 rgba(255,255,255,.45);
          transition: transform 160ms cubic-bezier(.2,1.4,.4,1), box-shadow 160ms ease, background 200ms ease;
          will-change: transform;
        }
        .member-follow-cta:hover { transform: translateY(-1px) scale(1.04); }
        .member-follow-cta:active { transform: scale(.94); }
        .member-follow-cta svg { color: currentColor; }
        .member-follow-cta[data-following="1"] {
          color: #16a34a;
          border-color: rgba(22,163,74,.32);
          background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(240,253,244,.95));
          box-shadow: 0 4px 14px rgba(22,163,74,.18), inset 0 1px 0 rgba(255,255,255,.7);
          animation: mc-follow-pop 320ms cubic-bezier(.22,1.4,.36,1);
        }
        @keyframes mc-follow-pop {
          0% { transform: scale(.86); }
          60% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .member-follow-cta, .member-follow-cta[data-following="1"] { transition: none; animation: none; }
        }
      `}</style>
      <span className="member-code-text">#{code}</span>
      <button
        type="button"
        className="member-code-copy"
        onClick={() => void copy()}
        aria-label="Sao chép mã thành viên"
        title="Sao chép mã thành viên"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      {g ? (
        <span
          className="member-gender-badge"
          data-gender={g}
          aria-label={g === "female" ? "Nữ" : g === "male" ? "Nam" : "Khác"}
          title={g === "female" ? "Nữ" : g === "male" ? "Nam" : "Khác"}
        >
          <GenderIcon size={18} strokeWidth={2.4} aria-hidden="true" />
        </span>
      ) : null}
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
      {/* Icon "Người theo dõi" đã bỏ khỏi hồ sơ — chỉ hiển thị trong popup Theo dõi. */}
    </div>
  );
}
