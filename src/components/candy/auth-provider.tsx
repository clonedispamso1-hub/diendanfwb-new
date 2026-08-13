import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useRealtime, pickNew, subscribeRealtime } from "@/lib/realtime-registry";
import { cachedQuery, invalidateCache } from "@/lib/request-cache";
import type { Profile } from "@/lib/app-types";
import { sheetsSync, profileToMember } from "@/lib/sheets-sync";
import { getFriendlyError } from "@/lib/friendly-error";
import { randomBadgeId } from "@/lib/member-badges";
import { isReservedDisplayName, RESERVED_DISPLAY_NAME_MESSAGE } from "@/lib/reserved-display-names";
import { checkDeviceAccess, collectDeviceSnapshot, reportDeviceSignal, logMemberActivity } from "@/lib/device-signal";
import { securityGate, registrationGate } from "@/lib/access-guard";
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
  "id, email, full_name, username, public_id, avatar, bio, location, province, gem_balance, followers_count, role, is_admin, badge_id, is_virtual, is_online, last_seen, is_banned, banned_until, name_changes, last_name_change, last_ip, created_at, vip_level, vip_exp, trust_score, reputation_score, status, ban_reason, password, photos, title_gif_url, height, weight, intent, intent_locked_until, location_last_changed_at, location_change_count, gender, phone, age, interests, is_fwb_active, is_seed_account, location_ready, account_status, is_onboarding_completed, nickname, birthday, zodiac, relationship_status, personality_tags, communication_styles, goal, target_gender, preferred_language, facebook, zalo";

async function loadProfile(userId: string) {
  const data = await cachedQuery(`profile:${userId}`, async () => {
    const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
    return data;
  }, 30_000);
  const profile = (data as Profile | null) ?? null;
  // Đánh dấu thiết bị này thuộc admin → AuthScreen sẽ bypass giới hạn 2 tài khoản/thiết bị.
  try {
    if (profile?.is_admin) localStorage.setItem("fwb_is_admin_device", "1");
  } catch { /* ignore */ }
  return profile;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
              void supabase.auth.signOut();
              setMe(null);
              setSession(null);
              alert("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin để được hỗ trợ.");
              return;
            }
            setMe(next);
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
        const profile = await loadProfile(currentSession.user.id);
        if (profile && isHardLocked(profile) && !inPostRegisterGrace()) {
          await supabase.auth.signOut();
          if (mounted) { setMe(null); setSession(null); setReady(true); }
          alert("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin để được hỗ trợ.");
          return;
        }
        const approval = (profile as any)?.approval_status as string | null | undefined;
        if (profile && !profile.is_admin && approval && approval !== "approved" && !inPostRegisterGrace()) {
          await supabase.auth.signOut();
          if (mounted) { setMe(null); setSession(null); setReady(true); }
          alert(approval === "rejected"
            ? "Tài khoản đã bị từ chối. Vui lòng liên hệ Admin."
            : "Tài khoản đang chờ Admin phê duyệt.");
          return;
        }
        if (mounted) setMe(profile);
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
        setSession(nextSession);
        if (!nextSession?.user) {
          setMe(null);
          setReady(true);
          if (unbindRealtime) { unbindRealtime(); unbindRealtime = null; }
          return;
        }
        // INITIAL_SESSION đã được init() xử lý; TOKEN_REFRESHED không cần fetch lại.
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        queueMicrotask(async () => {
          const profile = await loadProfile(nextSession.user.id);
          if (profile && isHardLocked(profile) && !inPostRegisterGrace()) {
            await supabase.auth.signOut();
            setMe(null); setSession(null); setReady(true);
            alert("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin để được hỗ trợ.");
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
    if (live && live !== session) setSession(live);
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
    if (isPhone) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("phone", typed)
        .maybeSingle();
      profileRow = data as any;
    } else {
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", typed)
        .maybeSingle();
      profileRow = data as any;
    }
    if (!profileRow || !profileRow.username) {
      return { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác." };
    }
    const fakeEmail = `${profileRow.username.toLowerCase()}@fwb.local`;
    const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });
    if (error) return { success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác." };
    const { data: { session: newSession } } = await supabase.auth.getSession();
    if (newSession?.user) {
      const profile = await loadProfile(newSession.user.id);
      // Gate 1: permanent ban → block sign-in regardless of role.
      const banned = (profile as any)?.permanent_banned === true;
      if (profile && !profile.is_admin && banned) {
        const reason = (profile as any)?.ban_reason as string | null | undefined;
        await supabase.auth.signOut();
        setSession(null);
        setMe(null);
        return {
          success: false,
          error: "Tài khoản đã bị cấm vĩnh viễn." + (reason ? ` Lý do: ${reason}` : ""),
        };
      }
      // Gate 2: approval_status must be 'approved' (admins always allowed).
      const approval = (profile as any)?.approval_status as string | null | undefined;
      if (profile && !profile.is_admin && approval && approval !== "approved") {
        await supabase.auth.signOut();
        setSession(null);
        setMe(null);
        if (approval === "rejected") {
          return { success: false, error: "Tài khoản đã bị từ chối. Vui lòng liên hệ Admin." };
        }
        return { success: false, error: "Tài khoản đang chờ Admin phê duyệt." };
      }
      // Gate 3 (backend): tài khoản / thiết bị / IP bị khóa → đăng xuất ngay.
      const postGate = await securityGate(true);
      if (postGate.blocked) {
        await supabase.auth.signOut();
        setSession(null);
        setMe(null);
        return { success: false, error: postGate.message || "Tài khoản của bạn đã bị khóa." };
      }
      setSession(newSession);
      setMe(profile);
      // UI V4: popup "Theo dõi Fanpage" chỉ được phép hiện SAU khi đăng nhập.
      clearFollowPopupRegisterSkip(newSession.user.id);
      // Anti-Clone: ghi nhận thiết bị + nhật ký đăng nhập (không chặn UI).
      void reportDeviceSignal(true);
      void logMemberActivity("login", profile?.username ?? typed);
      sheetsSync.recordLogin(newSession.user.id, profile?.username ?? typed);
      if (profile) sheetsSync.upsertMember(profileToMember(profile));
    }
    return { success: true };
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
    const normalizedUsername = isPhoneFlow
      ? normalizedPhone
      : (username ?? "").trim();
    const normalizedFullName = (fullName ?? "").trim();
    if (isReservedDisplayName(normalizedFullName)) {
      return { success: false, error: RESERVED_DISPLAY_NAME_MESSAGE };
    }
    const normalizedProvince = (province ?? "").trim();

    if (!normalizedUsername || !password) {
      return { success: false, error: "Vui lòng nhập số điện thoại và mật khẩu." };
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

    const meta: Record<string, any> = { username: normalizedUsername };
    if (isPhoneFlow) meta.phone = normalizedPhone;
    if (normalizedProvince) meta.province = normalizedProvince;
    if (gender === "male" || gender === "female") meta.gender = gender;
    void normalizedFullName;

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
    if (isPhoneFlow) {
      try {
        await supabase.from("profiles").update({ phone: normalizedPhone }).eq("id", data.user.id);
      } catch { /* ignore */ }
    }

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
      const profile = await loadProfile(data.session.user.id);
      setSession(data.session);
      setMe(profile);
      void reportDeviceSignal(true);
      void logMemberActivity("register", normalizedUsername);
      return { success: true, requiresEmailConfirmation: false };
    }
    return { success: true, requiresEmailConfirmation: true };
  };

  const logout = async () => {
    const uid = session?.user?.id;
    if (uid) void logMemberActivity("logout");
    if (uid) sheetsSync.recordLogout(uid);
    await supabase.auth.signOut();
    setMe(null);
    setSession(null);
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
    () => ({ session, me, ready, isAdmin: me?.is_admin === true, login, register, logout, refreshMe, applyGemDelta, setGemBalance }),
    [session, me, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const FALLBACK_AUTH: AuthContextValue = {
  session: null,
  me: null,
  ready: true,
  isAdmin: false,
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
