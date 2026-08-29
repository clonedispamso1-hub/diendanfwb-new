import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isCloneProfile, setCloneAccountFlag } from "@/lib/clone-account";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { buildSignupNames, normalizeUsername, USERNAME_MAX_LENGTH } from "@/lib/user-name";
import { useRealtime, pickNew, subscribeRealtime } from "@/lib/realtime-registry";
import { cachedQuery, invalidateCache, peekCache, setCache } from "@/lib/request-cache";
import { clearFeedSnapshots } from "@/lib/feed-snapshot";
import type { Profile } from "@/lib/app-types";
import { sheetsSync, profileToMember } from "@/lib/sheets-sync";
import { getFriendlyError } from "@/lib/friendly-error";
import { randomBadgeId } from "@/lib/member-badges";
import { isReservedDisplayName, RESERVED_DISPLAY_NAME_MESSAGE } from "@/lib/reserved-display-names";
import { checkDeviceAccess, collectDeviceSnapshot, reportDeviceSignal, logMemberActivity } from "@/lib/device-signal";
import { securityGate, registrationGate, isBlockedRoute } from "@/lib/access-guard";
import { timedStep } from "@/lib/with-timeout";
import { claimDeviceSignup, fetchMyApproval, type ApprovalStatus } from "@/lib/device-approval";
import {
  markFollowPopupSkipAfterRegister,
  clearFollowPopupRegisterSkip,
} from "@/lib/site/follow-popup-gate";

/**
 * Grace period sau khi đăng ký thành công: không áp dụng approval gate /
 * hard-lock để cho phép user vào Trang chủ 5 giây trước khi auto logout.
 */
const POST_REGISTER_GRACE_KEY = "fwb_post_register_grace_until";
function inPostRegisterGrace(): boolean {
  try {
    const raw = localStorage.getItem(POST_REGISTER_GRACE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (Date.now() < until) return true;
    localStorage.removeItem(POST_REGISTER_GRACE_KEY);
    return false;
  } catch {
    return false;
  }
}

interface RegisterInput {
  /** Legacy: tên đăng nhập (giữ để tương thích). Với flow mới, bỏ trống. */
  username?: string;
  /** Mới: số điện thoại Zalo (10 số, bắt đầu bằng 0). */
  phone?: string;
  password: string;
  /** Tuỳ chọn: bỏ trống → onboarding sau khi đăng nhập sẽ thu thập */
  fullName?: string;
  province?: string;
  gender?: "male" | "female";
}

interface AuthContextValue {
  session: Session | null;
  me: Profile | null;
  ready: boolean;
  isAdmin: boolean;
  /** Trạng thái phê duyệt theo thiết bị: approved | pending | rejected. */
  approvalStatus: ApprovalStatus;
  /** Số thứ tự tài khoản trên thiết bị (1, 2, 3...). */
  deviceAccountIndex: number;
  /** Đọc lại trạng thái phê duyệt (nút "Kiểm tra lại"). */
  refreshApproval: () => Promise<ApprovalStatus>;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (input: RegisterInput) => Promise<{ success: boolean; error?: unknown; requiresEmailConfirmation?: boolean }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** Optimistic: cộng/trừ Gem ngay trên UI trước khi DB realtime kịp về. */
  applyGemDelta: (delta: number) => void;
  /** Set trực tiếp số dư Gem hiển thị từ RPC trả về (new_balance). */
  setGemBalance: (balance: number) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
export type { AuthContextValue };

/** Explicit column list for the `profiles` table, covering every field referenced across the app. */
export const PROFILE_COLUMNS =
  "id, email, display_name, full_name, username, public_id, avatar, bio, location, province, gem_balance, followers_count, role, is_admin, badge_id, is_virtual, is_online, last_seen, is_banned, banned_until, name_changes, last_name_change, last_ip, created_at, vip_level, vip_exp, trust_score, reputation_score, status, ban_reason, password, photos, title_gif_url, height, weight, intent, intent_locked_until, location_last_changed_at, location_change_count, gender, phone, age, interests, is_fwb_active, is_seed_account, location_ready, account_status, is_onboarding_completed, nickname, birthday, zodiac, relationship_status, personality_tags, communication_styles, goal, target_gender, preferred_language, facebook, zalo, account_source";

/**
 * Supabase #1 mới (gxfxqbhxoghdhokwjpex) chỉ có tập cột rút gọn của `profiles`
 * (không có email, badge_id, account_status...). Khi select danh sách cột đầy
 * đủ, PostgREST trả 400 / Postgres 42703 "column profiles.<x> does not exist"
 * → loadProfile trả null → app-shell tưởng chưa đăng nhập và render lại
 * AuthScreen ngay sau khi đăng ký. Fallback sang `*` (và nhớ lại) để hồ sơ
 * luôn đọc được trên cả schema cũ lẫn schema mới.
 */
let profileSelect: string = PROFILE_COLUMNS;

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

async function fetchProfileRow(userId: string) {
  const first = await supabase.from("profiles").select(profileSelect).eq("id", userId).maybeSingle();
  if (!first.error) return first.data;
  // KHÔNG bao giờ trả null chỉ vì select cột lỗi: luôn thử lại với `*`.
  console.warn("[loadProfile] select lỗi → fallback select(*)", {
    code: (first.error as any)?.code,
    message: first.error.message,
    details: (first.error as any)?.details,
  });
  if (isMissingColumnError(first.error as any)) profileSelect = "*";
  const retry = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (retry.error) {
    console.error("[loadProfile] select(*) cũng lỗi", retry.error);
    return null;
  }
  return retry.data;
}

/** TTL cache hồ sơ: đủ dài để chuyển trang KHÔNG gọi lại `.select()` (realtime vẫn đẩy update). */
const PROFILE_TTL_MS = 5 * 60_000;
const LAST_USER_KEY = "fwb_last_user_id";

/** Hồ sơ đã lưu (localStorage) để render tức thì khi mở lại web — 0 request. */
export function peekCachedProfile(userId?: string | null): Profile | null {
  try {
    const id = userId ?? localStorage.getItem(LAST_USER_KEY);
    if (!id) return null;
    return peekCache<Profile | null>(`profile:${id}`, PROFILE_TTL_MS) ?? null;
  } catch {
    return null;
  }
}

async function loadProfile(userId: string) {
  const data = await cachedQuery(
    `profile:${userId}`,
    () => fetchProfileRow(userId),
    PROFILE_TTL_MS,
    { persist: true },
  );
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch { /* ignore */ }
  const profile = (data as Profile | null) ?? null;
  // Đánh dấu thiết bị này thuộc admin → AuthScreen sẽ bypass giới hạn 2 tài khoản/thiết bị.
  try {
    if (profile?.is_admin) localStorage.setItem("fwb_is_admin_device", "1");
  } catch { /* ignore */ }
  return profile;
}

/**
 * Tự tạo hàng `profiles` khi trigger `handle_new_user` không chạy / lỗi.
 * Idempotent: upsert theo id, bỏ qua nếu đã tồn tại.
 */
async function ensureProfileRow(userId: string, meta: Record<string, any>) {
  const names = buildSignupNames({
    username: meta.username,
    phone: meta.phone,
    fullName: meta.display_name ?? meta.full_name,
    userId,
  });
  const base: Record<string, any> = {
    id: userId,
    username: names.username,
    display_name: names.display_name,
    full_name: names.full_name,
  };
  if (meta.phone) base.phone = meta.phone;
  if (meta.province) base.province = meta.province;
  if (meta.gender) base.gender = meta.gender;

  let attempt = { ...base };
  for (let i = 0; i < 6; i++) {
    const { error } = await (supabase as any)
      .from("profiles")
      .upsert(attempt, { onConflict: "id", ignoreDuplicates: false });
    if (!error) {
      console.warn("[register] profile được tạo bằng fallback client-side (trigger không chạy)");
      invalidateCache(`profile:${userId}`);
      return await loadProfile(userId);
    }
    // Bỏ cột không tồn tại rồi thử lại (schema DB rút gọn).
    const bad = String(error.message || "").match(
      /column "?([a-zA-Z0-9_]+)"? of relation|Could not find the '([a-zA-Z0-9_]+)' column/,
    );
    const key = bad?.[1] || bad?.[2];
    if (key && key in attempt && key !== "id") {
      const { [key]: _drop, ...rest } = attempt;
      attempt = rest;
      continue;
    }
    console.error("[register] không tạo được profile fallback", error);
    return null;
  }
  return null;
}

/**
 * Chờ hàng `profiles` được trigger `handle_new_user` tạo xong (hoặc RLS/mạng
 * chậm) trước khi tin rằng "user không có profile". Trả về null nếu quá hạn.
 */
async function waitForProfile(userId: string, attempts = 6, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    invalidateCache(`profile:${userId}`);
    const profile = await loadProfile(userId);
    if (profile) return profile;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}



function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

function sanitizeAuthDataForDebug(data: unknown): unknown {
  if (data == null || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  return {
    ...record,
    session: record.session
      ? {
          redacted: true,
          hasAccessToken: Boolean((record.session as Record<string, unknown>).access_token),
          hasRefreshToken: Boolean((record.session as Record<string, unknown>).refresh_token),
          expiresAt: (record.session as Record<string, unknown>).expires_at ?? null,
        }
      : record.session,
  };
}

/**
 * Chặn đăng nhập CHỈ dựa vào `account_status`. Admin luôn được bỏ qua.
 * - active   → cho phép
 * - pending  → cần Admin duyệt (chặn ở lớp approval_status riêng)
 * - suspended/banned/banned_15 → chặn
 * KHÔNG dùng trust_score hay is_banned (legacy trigger từ trust score) để chặn đăng nhập.
 */
function isHardLocked(profile: Profile | null): boolean {
  if (!profile) return false;
  if ((profile as any).is_admin) return false;
  const status = (profile as any).account_status ?? (profile as any).status;
  const banLevel = Number((profile as any).ban_level ?? 0);
  return banLevel > 0 || (profile as any).is_banned === true || status === "suspended" || status === "banned" || status === "banned_15";
}

/**
 * Mức khóa Anti Clone: 1/2 → chỉ đăng xuất; 3 → đưa tới Blocked Page.
 * Trả về true nếu đã xử lý (caller phải dừng lại).
 */
async function handleLockedProfile(profile: Profile | null): Promise<boolean> {
  if (!profile || !isHardLocked(profile) || inPostRegisterGrace()) return false;
  const level = Number((profile as any).ban_level ?? 0);
  if (level >= 3) {
    const { purgeSessionAndBlock } = await import("@/lib/ban-realtime");
    await purgeSessionAndBlock();
    return true;
  }
  const { purgeSessionAndLock } = await import("@/lib/ban-realtime");
  await purgeSessionAndLock();
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  /** Chống vòng lặp: user đã nạp hồ sơ rồi thì KHÔNG fetch lại khi Supabase bắn SIGNED_IN. */
  const loadedUserIdRef = useRef<string | null>(null);

  // Hydrate tức thì từ cache localStorage (sau hydration, tránh mismatch SSR)
  // → chuyển trang / mở lại web không phải chờ .select() từ Supabase.
  useEffect(() => {
    setMe((prev) => prev ?? peekCachedProfile());
  }, []);

  // Clone (tài khoản thứ hai) KHÔNG nhận Notification — cờ toàn cục cho tầng lib.
  useEffect(() => { setCloneAccountFlag(isCloneProfile(me)); }, [me]);

  // Đồng bộ tức thì khi tự sửa hồ sơ / avatar (không chờ realtime, không F5).
  useEffect(() => {
    const onProfile = (e: Event) => {
      const d = (e as CustomEvent).detail as { userId?: string; patch?: Record<string, any> } | undefined;
      if (!d?.userId || !d.patch) return;
      setMe((prev) => (prev && prev.id === d.userId ? ({ ...prev, ...d.patch } as Profile) : prev));
    };
    const onAvatar = (e: Event) => {
      const d = (e as CustomEvent).detail as { userId?: string; url?: string } | undefined;
      if (!d?.userId || !d.url) return;
      setMe((prev) => (prev && prev.id === d.userId ? ({ ...prev, avatar: d.url } as Profile) : prev));
    };
    window.addEventListener("app:profile-updated", onProfile);
    window.addEventListener("app:avatar-updated", onAvatar);
    return () => {
      window.removeEventListener("app:profile-updated", onProfile);
      window.removeEventListener("app:avatar-updated", onAvatar);
    };
  }, []);
  const [ready, setReady] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("approved");
  const [deviceAccountIndex, setDeviceAccountIndex] = useState(1);

  useEffect(() => {
    // /blocked: KHÔNG khởi tạo bất kỳ logic auth nào (không signOut, không alert,
    // không điều hướng) — tránh việc session = null kéo người dùng về đăng nhập.
    if (isBlockedRoute()) { setReady(true); return; }
    let mounted = true;

    // MỘT channel registry duy nhất/user (key ổn định) thay vì tạo channel mới với
    // Math.random() mỗi lần bind — tránh rò rỉ & trùng channel khi StrictMode remount.
    let unbindRealtime: (() => void) | null = null;
    const bindProfileRealtime = (userId: string) => {
      if (unbindRealtime) { unbindRealtime(); unbindRealtime = null; }
      unbindRealtime = subscribeRealtime({
        key: `auth-self-${userId}`,
        topics: [
          { table: "profiles", event: "UPDATE", filter: `id=eq.${userId}` },
          { table: "post_gifts", event: "INSERT", filter: `from_user_id=eq.${userId}` },
        ],
        onChange: (payload, topicIndex) => {
          if (!mounted) return;
          if (topicIndex === 0) {
            const next = pickNew(payload) as unknown as Profile;
            invalidateCache(`profile:${userId}`);
            // Khoá tức thì: nếu admin trừ uy tín < 70 (is_banned/suspended) → đăng xuất ngay.
            if (isHardLocked(next) && !inPostRegisterGrace()) {
              setMe(null);
              setSession(null);
              void handleLockedProfile(next);
              return;
            }
            setMe(next);
            setCache(`profile:${userId}`, next, { persist: true });
            // Sync profile / gem updates to Google Sheets.
            const member = profileToMember(next);
            if (member) sheetsSync.upsertMember(member);
          } else if (topicIndex === 1) {
            const g = pickNew(payload) ?? {};
            // Schema thật của public.post_gifts: { id, post_id, from_user_id, amount, created_at }
            // Không có sender_id, không có receiver_id. Người nhận = chủ bài viết (posts.user_id),
            // không có sẵn trong payload realtime.
            sheetsSync.appendGift({
              giftId: String((g as any).id ?? `${(g as any).from_user_id ?? ""}-${(g as any).created_at ?? Date.now()}`),
              senderUid: (g as any).from_user_id ?? "",
              senderUsername: null,
              receiverUid: (g as any).post_owner_id ?? "",
              receiverUsername: null,
              giftName: "gift",
              giftValue: Number((g as any).amount ?? 0),
              createdAt: (g as any).created_at ?? new Date().toISOString(),
            });
          }
        },
      });
    };
    const bindGiftRealtime = (_userId: string) => { /* gộp vào bindProfileRealtime ở trên */ };

    const init = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (currentSession?.user) {
        setSession(currentSession);
        const profile = await waitForProfile(currentSession.user.id, 3, 400);
        if (await handleLockedProfile(profile)) {
          if (mounted) { setMe(null); setSession(null); setReady(true); }
          return;
        }
        // Phê duyệt theo thiết bị: KHÔNG đăng xuất, chỉ hiển thị trang chờ duyệt.
        const approval = (profile as any)?.approval_status as string | null | undefined;
        if (profile && !profile.is_admin && (approval === "pending" || approval === "rejected")) {
          if (mounted) {
            setApprovalStatus(approval);
            setDeviceAccountIndex(Number((profile as any)?.device_account_index ?? 1) || 1);
          }
        } else if (mounted) {
          setApprovalStatus("approved");
        }
        if (mounted) setMe(profile);
        loadedUserIdRef.current = currentSession.user.id;
        bindProfileRealtime(currentSession.user.id);
        bindGiftRealtime(currentSession.user.id);
        // Make sure a member row exists (idempotent upsert).
        if (profile) sheetsSync.upsertMember(profileToMember(profile));
      } else {
        setSession(null);
      }
      if (mounted) setReady(true);
    };
    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, nextSession: Session | null) => {
        // Chỉ set state khi session THỰC SỰ đổi → tránh re-render dây chuyền
        // (Supabase bắn lại event mỗi lần tab được focus / token refresh).
        setSession((prev) =>
          prev?.access_token === nextSession?.access_token && prev?.user?.id === nextSession?.user?.id
            ? prev
            : nextSession,
        );
        if (!nextSession?.user) {
          loadedUserIdRef.current = null;
          setMe(null);
          setReady(true);
          if (unbindRealtime) { unbindRealtime(); unbindRealtime = null; }
          return;
        }
        // INITIAL_SESSION đã được init() xử lý; TOKEN_REFRESHED không cần fetch lại.
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        // Đã nạp hồ sơ cho đúng user này rồi → KHÔNG gọi lại (chặn vòng lặp/spam request).
        if (loadedUserIdRef.current === nextSession.user.id) {
          setReady(true);
          return;
        }
        loadedUserIdRef.current = nextSession.user.id;
        queueMicrotask(async () => {
          const profile = await waitForProfile(nextSession.user.id, 3, 400);
          if (await handleLockedProfile(profile)) {
            loadedUserIdRef.current = null;
            setMe(null); setSession(null); setReady(true);
            return;
          }
          setMe(profile);
          bindProfileRealtime(nextSession.user.id);
          bindGiftRealtime(nextSession.user.id);
          setReady(true);
          if (profile && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
            sheetsSync.upsertMember(profileToMember(profile));
          }
        });
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (unbindRealtime) unbindRealtime();
    };
  }, []);

  const refreshMe = async () => {
    // Lấy session trực tiếp từ supabase để tránh race khi state React chưa kịp cập nhật
    // (vd: ngay sau signUp auto sign-in).
    const { data: { session: live } } = await supabase.auth.getSession();
    const userId = live?.user?.id ?? session?.user?.id;
    if (!userId) return;
    if (live && live.access_token !== session?.access_token) setSession(live);
    invalidateCache(`profile:${userId}`);
    const profile = await loadProfile(userId);
    setMe(profile);
  };

  const login = async (identifier: string, password: string) => {
    const typed = identifier.trim();
    if (!typed || !password) {
      return { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác." };
    }
    // Chặn đăng nhập bằng Email — chỉ chấp nhận Username hoặc số điện thoại.
    if (/@/.test(typed)) {
      return { success: false, error: "Không được đăng nhập bằng Email. Vui lòng dùng Username hoặc số điện thoại." };
    }
    // Anti-Clone: việc chặn thiết bị/tài khoản Level 3 do AccessGate + gate sau đăng nhập
    // xử lý → không gọi RPC thừa trước khi đăng nhập (tăng tốc login).
    // Nếu người dùng gõ SĐT VN 10 số → tra `profiles.phone`; ngược lại tra
    // `profiles.username` (case-sensitive). Cả hai đường đều dẫn tới cùng
    // một fake email @fwb.local để gọi supabase.auth.signInWithPassword.
    const isPhone = /^0\d{9}$/.test(typed);
    let profileRow: { id: string; username: string | null } | null = null;

    console.time("[login] TOTAL");
    try {
      // Bước 1: tra hồ sơ để suy ra fake email.
      const lookup = await timedStep("1-lookup-profile", async () => {
        if (isPhone) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, username")
            .or(`phone.eq.${typed},username.eq.${typed}`)
            .limit(1);
          if (error) throw new Error(error.message);
          return (Array.isArray(data) ? data[0] : null) as any;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username")
          .eq("username", typed)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as any;
      }, 12_000);

      if (!lookup.ok) {
        return {
          success: false,
          error: `Không kết nối được máy chủ dữ liệu (bước tra hồ sơ). ${lookup.error.message}`,
        };
      }
      profileRow = lookup.value;

      if (!profileRow || !profileRow.username) {
        return { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác." };
      }
      const fakeEmail = `${profileRow.username.toLowerCase()}@fwb.local`;

      // Bước 2: đăng nhập thật.
      const signIn = await timedStep(
        "2-signInWithPassword",
        () => supabase.auth.signInWithPassword({ email: fakeEmail, password }),
        15_000,
      );
      if (!signIn.ok) {
        return {
          success: false,
          error: `Máy chủ đăng nhập không phản hồi. ${signIn.error.message}`,
        };
      }
      if (signIn.value.error) {
        return { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác." };
      }

      // Bước 3: lấy session (từ signIn hoặc getSession).
      let newSession: Session | null = signIn.value.data?.session ?? null;
      if (!newSession) {
        const s = await timedStep("3-getSession", () => supabase.auth.getSession(), 8_000);
        newSession = s.ok ? s.value.data.session : null;
      }
      if (!newSession?.user) {
        return { success: false, error: "Đăng nhập thành công nhưng không lấy được phiên. Vui lòng thử lại." };
      }

      // Bước 4: nạp hồ sơ đầy đủ (không chặn login nếu chậm).
      const profileStep = await timedStep("4-loadProfile", () => loadProfile(newSession!.user.id), 12_000);
      const profile = profileStep.ok ? profileStep.value : null;

      // Gate 1: permanent ban → block sign-in regardless of role.
      const banned = (profile as any)?.permanent_banned === true;
      if (profile && !profile.is_admin && banned) {
        const reason = (profile as any)?.ban_reason as string | null | undefined;
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
        setMe(null);
        return {
          success: false,
          error: "Tài khoản đã bị cấm vĩnh viễn." + (reason ? ` Lý do: ${reason}` : ""),
        };
      }
      // Gate 2: phê duyệt theo thiết bị — pending/rejected vẫn đăng nhập được
      // nhưng chỉ thấy trang "Đang chờ quản trị viên phê duyệt".
      const approval = (profile as any)?.approval_status as string | null | undefined;
      if (profile && !profile.is_admin && (approval === "pending" || approval === "rejected")) {
        setApprovalStatus(approval);
        setDeviceAccountIndex(Number((profile as any)?.device_account_index ?? 1) || 1);
        setSession(newSession);
        setMe(profile);
        return { success: true };
      }
      setApprovalStatus("approved");

      // Bước 5: security gate (fail-open, có timeout riêng).
      const gateStep = await timedStep("5-securityGate", () => securityGate(true), 8_000);
      const postGate = gateStep.ok ? gateStep.value : { blocked: false };
      if (postGate.blocked && !postGate.admin) {
        if (typeof window !== "undefined") window.location.replace("/blocked");
        return { success: true };
      }

      setSession(newSession);
      setMe(profile);
      // UI V4: popup "Theo dõi Fanpage" chỉ được phép hiện SAU khi đăng nhập.
      clearFollowPopupRegisterSkip(newSession.user.id);
      // Anti-Clone: ghi nhận thiết bị + nhật ký đăng nhập (không chặn UI).
      void Promise.resolve(reportDeviceSignal(true)).catch(() => {});
      void Promise.resolve(logMemberActivity("login", profile?.username ?? typed)).catch(() => {});
      try {
        sheetsSync.recordLogin(newSession.user.id, profile?.username ?? typed);
        if (profile) sheetsSync.upsertMember(profileToMember(profile));
      } catch { /* ignore */ }
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[login] lỗi không mong đợi:", msg);
      return { success: false, error: `Đăng nhập thất bại: ${msg}` };
    } finally {
      console.timeEnd("[login] TOTAL");
    }
  };


  // ✅ FIXED: gửi đầy đủ username/full_name/province vào options.data,
  // KHÔNG gửi password vào metadata (tránh lộ trong JWT),
  // KHÔNG dùng setTimeout + UPDATE username (race condition).
  // Trigger handle_new_user phía Supabase đã tự tạo profile đúng.
  const register = async ({ username, phone, password, fullName, province, gender }: RegisterInput) => {
    const normalizedPhone = (phone ?? "").trim();
    const isPhoneFlow = /^0\d{9}$/.test(normalizedPhone);

    // Với flow mới (số Zalo), username lưu trong DB = chính số điện thoại.
    // Với flow cũ (username thuần), giữ nguyên hành vi.
    const normalizedUsername = (isPhoneFlow ? normalizedPhone : normalizeUsername(username))
      .slice(0, USERNAME_MAX_LENGTH);
    const normalizedFullName = (fullName ?? "").trim();
    if (isReservedDisplayName(normalizedFullName)) {
      return { success: false, error: RESERVED_DISPLAY_NAME_MESSAGE };
    }
    const normalizedProvince = (province ?? "").trim();

    if (!normalizedUsername || !password) {
      return { success: false, error: "Vui lòng nhập số điện thoại và mật khẩu." };
    }
    if (normalizedUsername.length > USERNAME_MAX_LENGTH) {
      return { success: false, error: `Tên đăng nhập tối đa ${USERNAME_MAX_LENGTH} ký tự.` };
    }
    if (normalizedFullName.length > USERNAME_MAX_LENGTH) {
      return { success: false, error: `Tên hiển thị tối đa ${USERNAME_MAX_LENGTH} ký tự.` };
    }

    // Anti-Clone: thiết bị / IP / cookie bị khóa thì không cho tạo tài khoản mới
    // (kể cả tài khoản thứ hai trên cùng thiết bị) — kiểm tra ở backend.
    const deviceGate = await registrationGate(normalizedPhone || null);
    if (deviceGate.blocked) {
      return {
        success: false,
        error: deviceGate.message || "Thiết bị hoặc địa chỉ mạng của bạn đã bị khóa, không thể tạo tài khoản mới.",
      };
    }

    // Kiểm tra trùng số điện thoại (flow mới) hoặc trùng username (flow cũ).
    if (isPhoneFlow) {
      // Chặn số điện thoại nằm trong blacklist (kể cả khi profile cũ đã bị xoá).
      try {
        const { data: blocked } = await (supabase as any).rpc("is_phone_blocked", { p_phone: normalizedPhone });
        if (blocked === true) {
          return { success: false, error: "Số điện thoại này đã bị cấm vĩnh viễn." };
        }
      } catch { /* fail-open nếu RPC chưa deploy */ }

      const { data: existedPhone, error: existedPhoneError } = await supabase
        .from("profiles").select("id").eq("phone", normalizedPhone).maybeSingle();
      if (existedPhoneError) {
        return { success: false, error: getFriendlyError(existedPhoneError) };
      }
      if (existedPhone) {
        return { success: false, error: "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác." };
      }
      // Đồng thời kiểm tra username trùng (vì username = phone).
      const { data: existedUsername } = await supabase
        .from("profiles").select("id").ilike("username", normalizedUsername).maybeSingle();
      if (existedUsername) {
        return { success: false, error: "Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác." };
      }
    } else {
      const { data: existedUsername, error: existedUsernameError } = await supabase
        .from("profiles").select("id").ilike("username", normalizedUsername).maybeSingle();
      if (existedUsernameError) {
        return { success: false, error: getFriendlyError(existedUsernameError) };
      }
      if (existedUsername) return { success: false, error: "Tên đăng nhập đã tồn tại." };
    }

    const fakeEmail = `${normalizedUsername.toLowerCase()}@fwb.local`;

    const signupNames = buildSignupNames({
      username: normalizedUsername,
      phone: normalizedPhone,
      fullName: normalizedFullName,
    });
    const meta: Record<string, any> = {
      username: signupNames.username,
      display_name: signupNames.display_name,
      full_name: signupNames.full_name,
    };
    if (isPhoneFlow) meta.phone = normalizedPhone;
    if (normalizedProvince) meta.province = normalizedProvince;
    if (gender === "male" || gender === "female") meta.gender = gender;
    // normalizedFullName đã được gộp vào signupNames (display_name/full_name).

    const antiCloneSnapshot = await collectDeviceSnapshot();
    if (!antiCloneSnapshot.ip) {
      return { success: false, error: "Thiết bị hoặc mạng của bạn đã bị khóa." };
    }
    const { data, error } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          ...meta,
          anti_clone_checked: true,
          anti_clone_fingerprint: antiCloneSnapshot.fingerprint,
          anti_clone_ip: antiCloneSnapshot.ip,
          anti_clone_cookie: antiCloneSnapshot.cookieId,
        },
      },
    });

    const debugData = sanitizeAuthDataForDebug(data);
    console.log("[Register] supabase.auth.signUp data", debugData);
    console.log("[Register] supabase.auth.signUp error", error);
    console.log("[Register] supabase.auth.signUp error JSON", safeJson(error));

    if (error) return { success: false, error: getFriendlyError(error, "Đăng ký thất bại. Vui lòng thử lại sau.") };
    if (!data.user) return { success: false, error: "Đăng ký thất bại. Vui lòng thử lại sau." };

    // Nếu flow phone: đảm bảo profile có cột `phone` (trigger handle_new_user
    // có thể chưa map phone từ metadata). Best-effort update.
    try {
      await supabase
        .from("profiles")
        .update({
          ...(isPhoneFlow ? { phone: normalizedPhone } : {}),
          username: signupNames.username,
          display_name: signupNames.display_name,
          full_name: signupNames.full_name,
        } as any)
        .eq("id", data.user.id);
    } catch { /* ignore */ }

    // Random 1 badge DUY NHẤT ngay khi tạo tài khoản thành công.
    // Chỉ ghi khi profile chưa có badge_id → không bao giờ random lại.
    try {
      const { data: existingBadge } = await (supabase as any)
        .from("profiles").select("badge_id").eq("id", data.user.id).maybeSingle();
      if (!existingBadge?.badge_id) {
        await (supabase as any)
          .from("profiles").update({ badge_id: randomBadgeId() }).eq("id", data.user.id);
      }
    } catch { /* cột badge_id chưa deploy → frontend tự fallback theo user id */ }


    sheetsSync.upsertMember(profileToMember({
      id: data.user.id, username: normalizedUsername, full_name: normalizedFullName,
      province: normalizedProvince, gender, created_at: new Date().toISOString(),
      ...(isPhoneFlow ? { phone: normalizedPhone } : {}),
    } as any));

    if (data.session?.user) {
      try {
        localStorage.setItem(POST_REGISTER_GRACE_KEY, String(Date.now() + 10_000));
      } catch { /* ignore */ }
      // UI V4: KHÔNG hiện popup "Theo dõi Fanpage" ngay sau khi đăng ký.
      markFollowPopupSkipAfterRegister(data.session.user.id);
      // Trigger `handle_new_user` tạo profile BẤT ĐỒNG BỘ → ngay sau signUp hàng
      // profile có thể chưa tồn tại. Nếu để `me = null`, cổng onboarding bị bỏ qua
      // (needsPremiumOnboarding(null) === false) → user vào thẳng app, rồi lần
      // refresh sau mới bị bắt onboarding "như tài khoản mới". Chờ profile sẵn sàng.
      // Đăng ký thiết bị: tài khoản đầu tiên → approved, từ thứ 2 → pending.
      const claim = await claimDeviceSignup();
      setApprovalStatus(claim.status);
      setDeviceAccountIndex(claim.seq);
      invalidateCache(`profile:${data.session.user.id}`);
      // Chờ trigger tối đa ~3s (6 x 500ms). Nếu vẫn chưa có hồ sơ → TỰ TẠO
      // ngay, không phụ thuộc hoàn toàn vào trigger `handle_new_user`, và không
      // để user treo ở màn loading.
      let profile = await waitForProfile(data.session.user.id);
      if (!profile) {
        console.warn("[register] profiles chưa có sau khi chờ trigger → tự tạo");
        profile = await ensureProfileRow(data.session.user.id, meta);
        if (!profile) profile = await waitForProfile(data.session.user.id, 3, 400);
      }
      setSession(data.session);
      setMe(profile);


      void reportDeviceSignal(true);
      void logMemberActivity("register", normalizedUsername);
      return { success: true, requiresEmailConfirmation: false };
    }
    return { success: true, requiresEmailConfirmation: true };
  };

  const refreshApproval = async (): Promise<ApprovalStatus> => {
    const info = await fetchMyApproval();
    setApprovalStatus(info.status);
    setDeviceAccountIndex(info.seq);
    if (info.status === "approved") await refreshMe();
    return info.status;
  };

  const logout = async () => {
    // Đăng xuất → bỏ cache feed đã lưu (không hiển thị dữ liệu của phiên trước).
    clearFeedSnapshots();
    const uid = session?.user?.id;
    if (uid) void logMemberActivity("logout");
    if (uid) sheetsSync.recordLogout(uid);
    await supabase.auth.signOut();
    setMe(null);
    setSession(null);
    setApprovalStatus("approved");
  };

  const applyGemDelta = (delta: number) => {
    if (!delta) return;
    setMe((prev) =>
      prev
        ? ({ ...prev, gem_balance: Math.max(0, Number((prev as any).gem_balance ?? 0) + delta) } as Profile)
        : prev,
    );
  };

  const setGemBalance = (balance: number) => {
    if (!Number.isFinite(balance)) return;
    setMe((prev) =>
      prev
        ? ({ ...prev, gem_balance: Math.max(0, Math.floor(balance)) } as Profile)
        : prev,
    );
  };

  const value = useMemo<AuthContextValue>(
    () => ({ session, me, ready, isAdmin: me?.is_admin === true, approvalStatus, deviceAccountIndex, refreshApproval, login, register, logout, refreshMe, applyGemDelta, setGemBalance }),
    [session, me, ready, approvalStatus, deviceAccountIndex],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const FALLBACK_AUTH: AuthContextValue = {
  session: null,
  me: null,
  ready: true,
  isAdmin: false,
  approvalStatus: "approved",
  deviceAccountIndex: 1,
  refreshApproval: async () => "approved" as ApprovalStatus,
  login: async () => ({ success: false, error: "Auth chưa sẵn sàng" }),
  register: async () => ({ success: false, error: "Auth chưa sẵn sàng" }),
  logout: async () => {},
  refreshMe: async () => {},
  applyGemDelta: () => {},
  setGemBalance: () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    if (typeof window !== "undefined") {
      console.warn("[useAuth] called outside AuthProvider — returning fallback. Check that <AuthProvider> wraps the tree.");
    }
    return FALLBACK_AUTH;
  }
  return context;
}
