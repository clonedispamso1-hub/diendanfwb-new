/**
 * Member Intelligence API — Anti Clone / Anti Spam / Risk Score V2.
 * Toàn bộ dữ liệu lấy qua RPC (SECURITY DEFINER, chỉ admin).
 */
import { supabase } from "@/lib/db/router";

export interface MemberIntelRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  phone: string | null;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string | null;
  last_seen: string | null;
  fingerprint: string | null;
  ip: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  country: string | null;
  isp: string | null;
  cookie_id: string | null;
  device_seen_at: string | null;
  ip_account_count: number;
  device_account_count: number;
  cookie_account_count: number;
  ip_change_count: number;
  spam_posts: number;
  spam_messages: number;
  spam_comments: number;
  name_twin_count: number;
  avatar_twin_count: number;
  risk_score: number;
  risk_reasons: string[] | null;
  total_count: number;
}

export type IntelFlag =
  | "dup_ip" | "dup_device" | "dup_cookie"
  | "risk60" | "risk80"
  | "acc3" | "acc5" | "acc10"
  | "clone" | "spam";

export const FLAG_LABELS: Record<IntelFlag, string> = {
  dup_ip: "Có IP trùng",
  dup_device: "Có Device trùng",
  dup_cookie: "Có Cookie trùng",
  risk60: "Risk > 60",
  risk80: "Risk > 80",
  acc3: "Hơn 3 tài khoản",
  acc5: "Hơn 5 tài khoản",
  acc10: "Hơn 10 tài khoản",
  clone: "Chỉ Clone",
  spam: "Chỉ Spam",
};

export interface ClusterAccount {
  id: string; username: string | null; full_name: string | null; avatar: string | null;
  phone: string | null; is_banned: boolean; created_at: string | null; last_seen: string | null;
}

export interface ClusterDetail {
  scope: "ip" | "device";
  key: string;
  info: {
    country?: string | null; isp?: string | null; browser?: string | null; os?: string | null;
    device_type?: string | null; user_agent?: string | null;
    first_seen?: string | null; last_seen?: string | null;
  };
  accounts: ClusterAccount[];
  ips: string[];
  devices: string[];
  blocked: boolean;
  account_count: number;
}

export interface IdentityCluster {
  cluster_key: string;
  account_count: number;
  ip_count: number;
  banned_count: number;
  last_seen: string | null;
  usernames: string[] | null;
  risk_score: number;
  total_count: number;
}

export interface ActivityRow {
  id: string; action: string; detail: string | null;
  ip: string | null; fingerprint: string | null; created_at: string;
}

export type ClusterAction = "ban_all" | "unban_all" | "logout_all" | "mark_spam" | "block" | "unblock";

export const riskTone = (score: number): { tone: "ok" | "warn" | "high" | "danger"; label: string } => {
  if (score >= 81) return { tone: "danger", label: "Khả năng Clone / Spam rất cao" };
  if (score >= 61) return { tone: "high", label: "Nghi ngờ Clone" };
  if (score >= 31) return { tone: "warn", label: "Cần theo dõi" };
  return { tone: "ok", label: "Bình thường" };
};

export const memberIntel = {
  async list(params: {
    q?: string; flags?: IntelFlag[]; minRisk?: number;
    sort?: "risk" | "newest" | "online"; limit?: number; offset?: number;
  }): Promise<MemberIntelRow[]> {
    const { data, error } = await (supabase as any).rpc("admin_member_intel", {
      p_q: params.q?.trim() || null,
      p_flags: params.flags?.length ? params.flags : null,
      p_min_risk: params.minRisk ?? 0,
      p_sort: params.sort ?? "risk",
      p_limit: params.limit ?? 50,
      p_offset: params.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as MemberIntelRow[];
  },

  async cluster(scope: "ip" | "device", key: string): Promise<ClusterDetail> {
    const { data, error } = await (supabase as any).rpc("admin_cluster_detail", {
      p_scope: scope, p_key: key,
    });
    if (error) throw error;
    return data as ClusterDetail;
  },

  async clusters(params: {
    scope?: "ip" | "device"; minAccounts?: number; limit?: number; offset?: number;
  } = {}): Promise<IdentityCluster[]> {
    const { data, error } = await (supabase as any).rpc("admin_identity_clusters", {
      p_scope: params.scope ?? "device",
      p_min_accounts: params.minAccounts ?? 2,
      p_limit: params.limit ?? 50,
      p_offset: params.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as IdentityCluster[];
  },

  async clusterAction(scope: "ip" | "device", key: string, action: ClusterAction, reason?: string) {
    const { data, error } = await (supabase as any).rpc("admin_cluster_action", {
      p_scope: scope, p_key: key, p_action: action, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as { ok: boolean; affected: number; users: number };
  },

  async banLevel(userId: string, level: 1 | 2 | 3, reason?: string, days = 0) {
    const { data, error } = await (supabase as any).rpc("admin_ban_member_level", {
      p_user: userId, p_level: level, p_reason: reason ?? null, p_days: days,
    });
    if (error) throw error;
    return data;
  },

  async unban(userId: string) {
    const { error } = await (supabase as any).rpc("admin_unban_member_full", { p_user: userId });
    if (error) throw error;
  },

  async activity(userId: string, limit = 50): Promise<ActivityRow[]> {
    const { data, error } = await (supabase as any).rpc("admin_member_activity", {
      p_user: userId, p_limit: limit, p_offset: 0,
    });
    if (error) throw error;
    return (data ?? []) as ActivityRow[];
  },
};

export const ACTIVITY_LABELS: Record<string, string> = {
  login: "Đăng nhập", logout: "Đăng xuất", register: "Đăng ký",
  ip_change: "Đổi IP", device_change: "Đổi thiết bị",
  ban: "Khóa", unban: "Mở khóa", spam: "Đánh dấu Spam",
  password_change: "Đổi mật khẩu", phone_change: "Đổi SĐT", username_change: "Đổi Username",
};
