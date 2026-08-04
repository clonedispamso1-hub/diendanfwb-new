import { memo, useEffect, useMemo, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { MessageCircle, MapPin, X, Heart, Crown, Sparkles, RefreshCw, Star, Search, Venus, Mars } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { loadFwbFakeProfiles, type FakeProfileRecord } from "@/lib/fake-profiles";
import { FakeMiniProfile } from "@/components/candy/fake-mini-profile";
import { getDisplayLocation, getDistanceLabel } from "@/lib/seed-display";
import { getFollowSet, getFollowSetServer, subscribeFollow, toggleFollow, isFollowed } from "@/lib/follow-store";
import { awardXp, claimDailyLoginXp } from "@/lib/fwb-xp";
import { XpProgressBar } from "@/components/candy/xp-progress-bar";
import { LikedSheet } from "@/components/candy/liked-sheet";

interface NearbyFwbPageProps {
  onViewProfile: (userId: string) => void;
  onOpenChat: (userId: string) => void;
}

interface NearbyUser {
  id: string;
  name: string;
  avatar: string;
  province: string | null;
  vip_level: number;
  gender: string | null;
  age?: number | null;
  is_online: boolean;
  is_seed: boolean;
  intent?: string | null;
  bio?: string | null;
  tag?: string | null;
}

const STACK_SIZE = 12;
const VISIBLE_BEHIND = 3;
const SWIPE_THRESHOLD = 110;
const VELOCITY_THRESHOLD = 600;
const REFRESH_COST = 100;
const SEARCH_MESSAGES = [
  "🔄 Đang tìm người online…",
  "✨ Đang ghép cặp phù hợp…",
  "💗 Đang tải hồ sơ mới…",
  "🌙 Đang mở rộng phạm vi…",
];

const VIBE_PRESETS = [
  ["🔥 Tìm FWB", "🌙 Cú đêm"],
  ["💖 Độc thân", "✨ Thích nói chuyện"],
  ["☕ Cafe đêm", "🌙 Cú đêm"],
  ["✨ Thích nói chuyện", "💕 Lãng mạn"],
  ["🌶️ Mặn mà", "🍷 Wine night"],
  ["💍 Tìm chồng tương lai", "🏠 Hướng về gia đình"],
  ["💕 Nghiêm túc", "☕ Cafe sáng"],
  ["🌸 Hợp gu là chốt", "💖 Bình yên"],
  ["💫 Gen Z chính hiệu", "🌙 Hướng nội"],
  ["🚩 Né red flag", "💗 Cần người hiểu"],
  ["愛してる ✨", "💕 Tình yêu sâu đậm"],
  ["命中注定 💫", "💖 Định mệnh"],
  ["一见钟情 💞", "💘 Sét đánh"],
];

const FLIRT_BIOS = [
  // Nghiêm túc / Gia đình / Đòi cưới
  "Tìm kiếm một mối quan hệ bình yên, hướng về gia đình.",
  "Hợp gu là chốt cưới luôn, ngại yêu đương lâu dòng.",
  "Nghiêm túc tìm tình cảm chân thành, không chơi bời.",
  "Muốn cùng ai đó nấu cơm mỗi ngày.",
  "Tìm chồng tương lai, nói không với mập mờ.",
  // Gen Z / Trend
  "Gặp đúng người thì không cần lớn.",
  "Không thích cạnh tranh, chỉ thích cạnh cậu.",
  "Red flag thì né, còn em thì anh phải ghé.",
  "Sống hướng nội nhưng muốn hướng về cậu.",
  "Lướt qua đời nhau thì phí, va vào nhau đi.",
  // Đa ngôn ngữ
  "愛してる — Muốn tìm một tình yêu sâu đậm.",
  "一生懸命 — Luôn chân thành trong tình cảm.",
  "命中注定 — Định mệnh sắp đặt ta gặp nhau.",
  "只想和你在一起 — Chỉ muốn ở bên cạnh cậu.",
  "一见钟情 — Tin vào tình yêu sét đánh.",
  // Vibe nhẹ
  "Thích nói chuyện khuya 😳",
  "Tìm người cùng cú đêm 🌙",
  "Độc thân vui tính, hay cười 💕",
  "Cuối tuần đi cafe không? ☕",
  "Vibe đêm, nhạc nhẹ, trò chuyện 🎧",
];


const PEEK_STICKERS: string[] = [];

const ACTIVE_STATUS = { text: "Đang hoạt động", cls: "live" } as const;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pickVibes = (id: string) => VIBE_PRESETS[hashId(id) % VIBE_PRESETS.length];
const pickBio = (id: string) => FLIRT_BIOS[hashId(id + "b") % FLIRT_BIOS.length];
const pickPeek = (_id: string) => null;
const pickStatus = (_id: string, _tick: number) => ACTIVE_STATUS;
const showPeek = (_id: string) => false;

function mapSeedToUser(p: FakeProfileRecord): NearbyUser {
  return {
    id: p.id,
    name: p.display_name || p.full_name || "Người dùng",
    avatar: p.avatar_url || p.avatar || "/placeholder.svg",
    province: p.province,
    vip_level: p.vip_level || 1,
    gender: (p as any).gender || "female",
    age: (p as any).age || null,
    is_online: true,
    is_seed: true,
    bio: p.bio,
    tag: (p as any).tag || null,
  };
}

function mapProfileToUser(p: any): NearbyUser {
  return {
    id: p.id,
    name: p.full_name || "Người dùng",
    avatar: p.avatar || "/placeholder.svg",
    province: p.province || p.location || null,
    vip_level: p.vip_level || 1,
    gender: p.gender || null,
    age: p.age || null,
    is_online: !!p.is_online,
    is_seed: !!p.is_seed_account,
    intent: p.intent,
    bio: p.bio,
  };
}

function useFollowSet(): Set<string> {
  return useSyncExternalStore(subscribeFollow, getFollowSet, getFollowSetServer);
}

// ----- Swipe persistence: pass/chatted/daily quota -----
const PASS_KEY = "nfwb:passed:v1";
const CHAT_KEY = "nfwb:chatted:v1";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
}
function writeSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}
function addPass(id: string) { const s = readSet(PASS_KEY); s.add(id); writeSet(PASS_KEY, s); }
function getChattedSet(): Set<string> { return readSet(CHAT_KEY); }
function markChatted(id: string) { const s = getChattedSet(); s.add(id); writeSet(CHAT_KEY, s); }

export function NearbyFwbPage({ onViewProfile, onOpenChat }: NearbyFwbPageProps) {
  const { me } = useAuth();
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [miniProfile, setMiniProfile] = useState<FakeProfileRecord | null>(null);
  const [shuffleSalt, setShuffleSalt] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [matchUser, setMatchUser] = useState<NearbyUser | null>(null);
  const [likedUser, setLikedUser] = useState<NearbyUser | null>(null);
  const [feedback, setFeedback] = useState<{ dir: "left" | "right"; id: string } | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [showLiked, setShowLiked] = useState(false);
  const [xpFloat, setXpFloat] = useState<{ id: number; amount: number; reason: string } | null>(null);
  const followSet = useFollowSet();

  const viewerProvince = me?.province || (me as any)?.location || null;
  const viewerId = me?.id || null;
  const isVip = (me?.vip_level || 0) >= 3;

  // Daily login XP (silent if already claimed today)
  useEffect(() => {
    const got = claimDailyLoginXp();
    if (got > 0) {
      setXpFloat({ id: Date.now(), amount: got, reason: "Đăng nhập hằng ngày" });
      window.setTimeout(() => setXpFloat(null), 2200);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setRotation(r => r + 1), 6000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const seeds = await loadFwbFakeProfiles({ province: viewerProvince, limit: 60 });
      const seedUsers = seeds.map(mapSeedToUser);
      let realRows: any[] = [];
      try {
        const sb = supabase as any;
        const sel = "id, full_name, username, avatar, vip_level, location, province, gender, age, is_online, intent, bio, is_seed_account";
        const { data: seedReal } = await sb.from("profiles").select(sel).eq("is_seed_account", true).limit(30);
        realRows = realRows.concat(seedReal || []);
        if (viewerProvince) {
          const { data: sameProv } = await sb.from("profiles").select(sel)
            .or(`province.eq.${viewerProvince},location.eq.${viewerProvince}`)
            .neq("id", viewerId || "00000000-0000-0000-0000-000000000000").limit(40);
          realRows = realRows.concat(sameProv || []);
        }
      } catch (e) { console.warn("[nearby-fwb] profiles fetch warn:", e); }
      const realUsers = realRows.map(mapProfileToUser);
      const seen = new Set<string>();
      const merged: NearbyUser[] = [];
      for (const u of [...seedUsers, ...realUsers]) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        merged.push(u);
      }
      setUsers(merged);
    } finally { setLoading(false); }
  }, [viewerProvince, viewerId]);

  useEffect(() => { void load(); }, [load]);

  // Build prioritized, filtered swipe stack
  const stack = useMemo(() => {
    const passed = readSet(PASS_KEY);
    const chatted = getChattedSet();
    const pool = users.filter(u =>
      !swipedIds.has(u.id) && !passed.has(u.id) && !chatted.has(u.id)
    );
    // Score: VIP boost + online boost + hash jitter (re-rolled by salt)
    const scored = pool.map(u => {
      const hash = hashId(u.id + ":" + shuffleSalt);
      const score =
        (u.vip_level >= 3 ? 1000 : 0) +
        (u.is_online ? 500 : 0) +
        (followSet.has(u.id) ? -200 : 0) + // followed shown later
        (hash % 400);
      return { u, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, STACK_SIZE).map(x => x.u);
  }, [users, swipedIds, shuffleSalt, followSet]);

  const topCard = stack[0];
  const canSwipe = true;

  const flashXp = useCallback((amount: number, reason: string) => {
    setXpFloat({ id: Date.now(), amount, reason });
    window.setTimeout(() => setXpFloat(null), 1600);
  }, []);

  const handleSwipe = useCallback((dir: "left" | "right", user: NearbyUser) => {
    setFeedback({ dir, id: user.id });
    setTimeout(() => setFeedback(f => (f && f.id === user.id ? null : f)), 600);

    if (dir === "right") {
      if (!isFollowed(user.id)) toggleFollow(user.id);
      const { gained } = awardXp("like");
      flashXp(gained, "Đã thích");
      setLikedUser(user);
    } else {
      addPass(user.id);
    }
    setSwipedIds(prev => {
      const next = new Set(prev);
      next.add(user.id);
      return next;
    });
    // Searching screen for the next card (1–3s randomized)
    const msg = SEARCH_MESSAGES[Math.floor(Math.random() * SEARCH_MESSAGES.length)];
    setSearching(msg);
    const wait = 800 + Math.floor(Math.random() * 1400);
    window.setTimeout(() => setSearching(null), wait);
  }, [flashXp]);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setShuffleSalt(s => s + 1);
    setSwipedIds(new Set());
    setSearching(SEARCH_MESSAGES[1]);
    setTimeout(() => { setRefreshing(false); setSearching(null); }, 1200);
  }, [refreshing]);

  const handleCardTap = (u: NearbyUser) => {
    awardXp("view_profile");
    if (u.is_seed) {
      setMiniProfile({
        id: u.id, username: u.name, display_name: u.name, full_name: u.name,
        avatar_url: u.avatar, avatar: u.avatar, locale: null,
        vip_level: u.vip_level,
        province: getDisplayLocation({ id: u.id, is_seed_account: true, province: u.province }, viewerProvince),
        bio: u.bio || pickBio(u.id), gem_balance: 0, is_active: true,
        created_at: new Date().toISOString(),
      });
      return;
    }
    onViewProfile(u.id);
  };

  const handleStartChat = (u: NearbyUser) => {
    markChatted(u.id);
    awardXp("match");
    setMatchUser(null);
    setLikedUser(null);
    setSwipedIds(prev => { const n = new Set(prev); n.add(u.id); return n; });
    onOpenChat(u.id);
  };

  return (
    <section className="nfwb-swipe-page">
      <div className="nfwb-swipe-top">
        <div>
          <h2 className="nfwb-swipe-title">Tìm FWB quanh đây</h2>
          <p className="nfwb-swipe-sub">
            <span className="nfwb-pulse-dot" /> Vuốt để khám phá · {stack.length} người sẵn sàng
          </p>
        </div>
        <button className="nfwb-refresh-pill" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCw size={13} className={refreshing ? "nfwb-spin" : ""} />
          <span>Làm mới</span>
          <small>-{REFRESH_COST}💎</small>
        </button>
      </div>

      <XpProgressBar onOpenLiked={() => setShowLiked(true)} likedBadge={followSet.size} />

      <div className="nfwb-deck">
        {loading ? (
          <SearchingCard message="✨ Đang tải hồ sơ…" />
        ) : searching ? (
          <SearchingCard message={searching} />
        ) : stack.length === 0 ? (
          <EmptyDeck onRefresh={handleRefresh} />
        ) : (
          <AnimatePresence>
            {stack.slice(0, VISIBLE_BEHIND + 1).reverse().map((u, idx, arr) => {
              const depth = arr.length - 1 - idx; // 0 = top
              const isTop = depth === 0;
              return (
                <SwipeCard
                  key={u.id}
                  user={u}
                  depth={depth}
                  isTop={isTop}
                  rotation={rotation}
                  viewerId={viewerId}
                  viewerProvince={viewerProvince}
                  feedback={feedback && feedback.id === u.id ? feedback.dir : null}
                  canSwipe={canSwipe}
                  onSwipe={(dir) => handleSwipe(dir, u)}
                  onView={() => handleCardTap(u)}
                  onTap={() => handleCardTap(u)}
                />
              );
            })}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {xpFloat ? (
            <motion.div
              key={xpFloat.id}
              className="nfwb-xp-float"
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: -10, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              <Star size={14} fill="#fff" /> +{xpFloat.amount} XP
              <small>{xpFloat.reason}</small>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>


      {/* LIKED (one-way) OVERLAY — Tinder-style "Bạn đã thích X" */}
      <AnimatePresence>
        {likedUser ? (
          <motion.div
            className="nfwb-match-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLikedUser(null)}
          >
            <motion.div
              className="nfwb-match-card"
              initial={{ scale: 0.6, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="nfwb-match-sparkles">💗</div>
              <h3>Bạn đã thích {likedUser.name}</h3>
              <p>Hãy chủ động gửi tin nhắn để bắt chuyện trước nhé 💌</p>
              <div className="nfwb-match-avatars">
                <img loading="lazy" decoding="async" src={likedUser.avatar} alt="" />
              </div>
              <div className="nfwb-match-actions">
                <button className="nfwb-match-skip" onClick={() => setLikedUser(null)}>Để sau</button>
                <button className="nfwb-match-chat" onClick={() => handleStartChat(likedUser)}>
                  <MessageCircle size={16} /> Nhắn tin ngay
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {miniProfile ? (
        <FakeMiniProfile
          profile={miniProfile}
          fallbackProvince={viewerProvince}
          onClose={() => setMiniProfile(null)}
          onAction={() => {
            const id = miniProfile.id;
            setMiniProfile(null);
            onOpenChat(id);
          }}
        />
      ) : null}

      {showLiked ? (
        <LikedSheet
          onClose={() => setShowLiked(false)}
          onOpenChat={(id) => { setShowLiked(false); onOpenChat(id); }}
          viewerProvince={viewerProvince}
          isVip={isVip}
        />
      ) : null}
    </section>
  );
}

// ============= SEARCHING / EMPTY =============
function SearchingCard({ message }: { message: string }) {
  return (
    <div className="nfwb-card nfwb-card-searching" aria-live="polite">
      <div className="nfwb-searching__ring">
        <span /><span /><span />
      </div>
      <p className="nfwb-searching__msg">{message}</p>
      <p className="nfwb-searching__hint">Đang chuẩn bị hồ sơ kế tiếp…</p>
    </div>
  );
}

function EmptyDeck({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="nfwb-card nfwb-empty-card">
      <div className="nfwb-empty-card__icon"><Search size={36} /></div>
      <h3>Không còn hồ sơ phù hợp gần bạn</h3>
      <p>Thử mở rộng phạm vi hoặc làm mới danh sách để khám phá thêm người mới.</p>
      <div className="nfwb-empty-card__actions">
        <button className="nfwb-empty-cta primary">
          <Sparkles size={14} /> Mở rộng phạm vi
        </button>
        <button className="nfwb-empty-cta" onClick={onRefresh}>
          <RefreshCw size={14} /> Làm mới (-{REFRESH_COST}💎)
        </button>
        <button className="nfwb-empty-cta ghost">
          Thử lại sau vài phút
        </button>
      </div>
      <div className="nfwb-empty-card__vip">
        <Crown size={14} /> Nâng cấp VIP để boost hồ sơ và xuất hiện ưu tiên
      </div>
    </div>
  );
}

// ============= SWIPE CARD =============
interface SwipeCardProps {
  user: NearbyUser;
  depth: number;
  isTop: boolean;
  rotation: number;
  viewerId: string | null;
  viewerProvince: string | null;
  feedback: "left" | "right" | null;
  canSwipe: boolean;
  onSwipe: (dir: "left" | "right") => void;
  onView: () => void;
  onTap: () => void;
}

const SwipeCard = memo(function SwipeCard({ user, depth, isTop, rotation, viewerId, viewerProvince, feedback, canSwipe, onSwipe, onView, onTap }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-18, 0, 18]);
  const likeOpacity = useTransform(x, [20, 130], [0, 1]);
  const nopeOpacity = useTransform(x, [-130, -20], [1, 0]);
  const dragStart = useRef(0);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    const dx = info.offset.x;
    const vx = info.velocity.x;
    if (dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) {
      onSwipe("right");
    } else if (dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) {
      onSwipe("left");
    } else {
      x.set(0);
    }
  }, [onSwipe, x]);

  const displayLoc = useMemo(() => getDisplayLocation(
    { id: user.id, location: user.province, province: user.province, is_seed_account: user.is_seed },
    viewerProvince,
  ), [user.id, user.province, user.is_seed, viewerProvince]);
  const distance = useMemo(() => getDistanceLabel(user.id, viewerId), [user.id, viewerId]);
  const vibes = useMemo(() => pickVibes(user.id), [user.id]);
  const bio = useMemo(() => {
    if (user.bio) return user.bio;
    if (user.is_seed) {
      const fallbacks = ["Cần Kết Nối", "Nhắn Tin Ngay"];
      return fallbacks[hashId(user.id) % fallbacks.length];
    }
    return pickBio(user.id);
  }, [user.bio, user.is_seed, user.id]);
  const peek = useMemo(() => (showPeek(user.id) ? pickPeek(user.id) : null), [user.id]);
  const status = pickStatus(user.id, rotation);
  const isMale = user.gender === "male" || user.gender === "M" || user.gender === "nam";

  const scale = 1 - depth * 0.05;
  const ty = depth * 14;
  const opacity = 1 - depth * 0.15;

  const exitX = feedback === "right" ? 600 : feedback === "left" ? -600 : 0;

  const stopProp = useCallback((e: React.MouseEvent | React.PointerEvent) => e.stopPropagation(), []);

  return (
    <motion.div
      className={`nfwb-card depth-${depth}`}
      style={{ x: isTop ? x : 0, rotate: isTop ? rotate : 0, zIndex: 10 - depth }}
      initial={{ scale, y: ty, opacity }}
      animate={{ scale, y: ty, opacity }}
      exit={{ x: exitX, opacity: 0, rotate: feedback === "right" ? 24 : -24, transition: { duration: 0.35 } }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragStart={() => { dragStart.current = Date.now(); }}
      onDragEnd={handleDragEnd}
      onClick={() => {
        if (Date.now() - dragStart.current < 220 && Math.abs(x.get()) < 8) onTap();
      }}
    >
      <div className="nfwb-card-photo">
        <img src={user.avatar} alt={user.name} loading="lazy" decoding="async" draggable={false} />
        <div className="nfwb-card-gradient" />

        {peek ? <span className="nfwb-card-peek">{peek}</span> : null}

        {isTop ? (
          <>
            <motion.div className="nfwb-stamp nfwb-stamp-like" style={{ opacity: likeOpacity }}>
              💖 ĐÃ THÍCH
            </motion.div>
            <motion.div className="nfwb-stamp nfwb-stamp-nope" style={{ opacity: nopeOpacity }}>
              ❌ BỎ QUA
            </motion.div>
          </>
        ) : null}

        <div className="nfwb-card-info">
          <div className="nfwb-card-row1">
            <h3 className="nfwb-card-name">
              {user.name}
              {user.age ? <span className="nfwb-card-age">, {user.age}</span> : null}
              <span className={`nfwb-card-gender ${isMale ? "m" : "f"}`}>
                {isMale ? <Mars size={14} /> : <Venus size={14} />}
                {isMale ? " (Nam)" : " (Nữ)"}
              </span>
            </h3>
            {user.vip_level >= 2 ? (
              <span className="nfwb-card-vip"><Crown size={10} /> VIP{user.vip_level}</span>
            ) : null}
          </div>

          <div className="nfwb-card-meta">
            <span><MapPin size={11} /> {displayLoc}</span>
            <span className="nfwb-dot-sep">·</span>
            <span>{distance.replace("Cách bạn ~", "~")}</span>
            <span className="nfwb-dot-sep">·</span>
            <span className={`nfwb-card-status ${status.cls}`}>
              <span className="nfwb-card-dot" /> {status.text}
            </span>
          </div>

          <p className="nfwb-card-bio">{bio}</p>

          <div className="nfwb-card-vibes">
            {vibes.map(v => <span key={v} className="nfwb-card-vibe">{v}</span>)}
          </div>
        </div>

        {isTop && canSwipe ? (
          <div className="nfwb-actions" onPointerDown={stopProp} onClick={stopProp}>
            <button
              className="nfwb-act nfwb-act-pass"
              onClick={(e) => { e.stopPropagation(); onSwipe("left"); }}
              aria-label="Bỏ qua"
              type="button"
            >
              <X size={26} strokeWidth={2.5} />
            </button>
            <button
              className="nfwb-act nfwb-act-view"
              onClick={(e) => { e.stopPropagation(); onView(); }}
              aria-label="Xem hồ sơ"
              type="button"
            >
              <Star size={20} strokeWidth={2.5} />
            </button>
            <button
              className="nfwb-act nfwb-act-like"
              onClick={(e) => { e.stopPropagation(); onSwipe("right"); }}
              aria-label="Thích"
              type="button"
            >
              <Heart size={28} strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
});

