/**
 * Engagement Booster — admin-only campaign engine.
 *
 * Backend: docs/sql/RUN_NOW_engagement_booster.sql
 *   • engagement_campaigns / engagement_events
 *   • RPC engagement_create_campaign / engagement_tick / engagement_set_status
 *
 * Chỉ implement kind='like' theo yêu cầu, nhưng service + schema đã
 * sẵn sàng mở rộng cho comment / view / share / follow.
 *
 * Phân phối tự nhiên = client tính targets per-post (weighted random),
 * server tick định kỳ chia dần theo elapsed_frac + jitter.
 */
import { supabaseAdminSession } from "@/integrations/supabase/admin-client";

export type EngagementKind = "like" | "comment" | "view" | "share" | "follow";
export type CampaignStatus = "running" | "paused" | "completed" | "cancelled";

export interface EngagementCampaign {
  id: string;
  admin_id: string | null;
  kind: EngagementKind;
  status: CampaignStatus;
  target_user_id: string | null;
  target_post_ids: string[];
  totals: Record<string, number>;
  completed: Record<string, number>;
  total_amount: number;
  completed_amount: number;
  duration_seconds: number;
  started_at: string;
  ends_at: string;
  last_tick_at: string | null;
  finished_at: string | null;
  note: string | null;
  created_at: string;
}

export interface EngagementEvent {
  id: number;
  campaign_id: string;
  post_id: string;
  kind: EngagementKind;
  delta: number;
  created_at: string;
}

export interface PostSearchRow {
  uuid: string;
  post_code: string | null;
  user_id: string;
  username: string;
  avatar: string | null;
  content: string;
  image_urls: string[];
  video_url: string | null;
  created_at: string;
  likes: number;
  comments: number;
  views: number;
}

/* ------------------------------------------------------------------ */
/*  Weight distribution (client-side)                                  */
/* ------------------------------------------------------------------ */

/**
 * Chia `total` like cho N post theo trọng số random để tổng == total.
 * Random uniform 0.5–1.5 rồi normalize + phân bổ dư nguyên.
 */
export function distributeTargets(
  postIds: string[],
  total: number,
): Record<string, number> {
  const n = postIds.length;
  if (n === 0 || total <= 0) return {};
  if (n === 1) return { [postIds[0]]: total };

  const weights = postIds.map(() => 0.5 + Math.random());
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const floors = raw.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);
  const remainders = raw
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r);
  let idx = 0;
  while (assigned < total) {
    floors[remainders[idx % n].i]++;
    assigned++;
    idx++;
  }
  const out: Record<string, number> = {};
  postIds.forEach((id, i) => {
    if (floors[i] > 0) out[id] = floors[i];
  });
  return out;
}

/* ------------------------------------------------------------------ */
/*  UID extraction                                                     */
/* ------------------------------------------------------------------ */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Bóc UUID từ input mà admin dán vào: raw uuid, /post/<uuid>,
 * full URL, share URL, preview URL, hoặc chuỗi có UUID lẫn text.
 * Trả về { uuid, isUrl, raw } — uuid=null nếu không tìm thấy.
 */
export function extractPostUid(input: string): {
  uuid: string | null;
  isUrl: boolean;
  raw: string;
} {
  const raw = input.trim();
  const isUrl = /^https?:\/\//i.test(raw) || raw.includes("/post/");
  const m = raw.match(UUID_RE);
  return { uuid: m ? m[0].toLowerCase() : null, isUrl, raw };
}

/* ------------------------------------------------------------------ */
/*  Search                                                             */
/* ------------------------------------------------------------------ */

async function mapProfiles(userIds: string[]) {
  const map = new Map<string, { username: string; avatar: string | null }>();
  if (!userIds.length) return map;
  const { data } = await (supabaseAdminSession.from("profiles") as any)
    .select("id, username, full_name, avatar, avatar_url")
    .in("id", Array.from(new Set(userIds)));
  (data || []).forEach((p: any) =>
    map.set(p.id, {
      username: p.username || p.full_name || "Người dùng",
      avatar: p.avatar_url || p.avatar || null,
    }),
  );
  return map;
}

function rowFromPost(p: any, prof: { username: string; avatar: string | null } | undefined): PostSearchRow {
  const images: string[] = Array.isArray(p.image_urls)
    ? p.image_urls
    : p.image_url
      ? [p.image_url]
      : [];
  return {
    uuid: p.id,
    post_code: p.post_code ?? null,
    user_id: p.user_id || "",
    username: prof?.username ?? "Người dùng",
    avatar: prof?.avatar ?? null,
    content: p.content || "",
    image_urls: images,
    video_url: p.video_url || null,
    created_at: p.created_at,
    likes: Number(p.likes_count ?? 0) || 0,
    comments: Number(p.comments_count ?? 0) || 0,
    views: Number(p.views_count ?? 0) || 0,
  };
}

/** Tìm 1 post theo UID (post_code) hoặc uuid. */
export async function searchPostByUid(uid: string): Promise<PostSearchRow[]> {
  const raw = uid.trim();
  if (!raw) return [];
  const parsed = extractPostUid(raw);
  const q = (supabaseAdminSession.from("posts") as any).select("*");
  // Ưu tiên UUID nếu tách được (URL hoặc raw UUID). Nếu không, thử post_code.
  const { data, error } = parsed.uuid
    ? await q.eq("id", parsed.uuid)
    : await q.eq("post_code", raw);
  if (error) throw error;
  const list: any[] = data || [];
  if (!list.length) return [];
  const profiles = await mapProfiles(list.map((p) => p.user_id).filter(Boolean));
  return list.map((p) => rowFromPost(p, profiles.get(p.user_id)));
}

/** Trả về TẤT CẢ post của 1 user (theo user uuid hoặc username). */
export async function searchPostsByUserUid(userUid: string): Promise<PostSearchRow[]> {
  const key = userUid.trim();
  if (!key) return [];
  let userId: string | null = null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  if (isUuid) {
    userId = key;
  } else {
    const { data } = await (supabaseAdminSession.from("profiles") as any)
      .select("id")
      .or(`username.eq.${key},public_id.eq.${key}`)
      .limit(1);
    userId = (data || [])[0]?.id ?? null;
  }
  if (!userId) return [];
  const { data, error } = await (supabaseAdminSession.from("posts") as any)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list: any[] = data || [];
  const profiles = await mapProfiles([userId]);
  return list.map((p) => rowFromPost(p, profiles.get(userId!)));
}

/* ------------------------------------------------------------------ */
/*  Campaign CRUD                                                      */
/* ------------------------------------------------------------------ */

async function assertAdminSession(): Promise<void> {
  const { data, error } = await supabaseAdminSession.auth.getUser();
  if (error || !data.user) {
    throw new Error("Phiên Admin không hợp lệ. Vui lòng đăng nhập Admin lại rồi thử lại.");
  }
}

export async function createLikeCampaign(input: {
  postIds: string[];
  totalAmount: number;
  durationSeconds: number;
  targetUserId?: string | null;
  note?: string | null;
}): Promise<string> {
  await assertAdminSession();
  const totals = distributeTargets(input.postIds, input.totalAmount);
  const { data, error } = await (supabaseAdminSession as any).rpc("engagement_create_campaign", {
    _kind: "like",
    _post_ids: input.postIds,
    _totals: totals,
    _total_amount: input.totalAmount,
    _duration_seconds: input.durationSeconds,
    _target_user_id: input.targetUserId ?? null,
    _note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function tickEngagement(): Promise<{ ticked: number; added: number }> {
  const { data, error } = await (supabaseAdminSession as any).rpc("engagement_tick");
  if (error) throw error;
  return {
    ticked: Number(data?.ticked ?? 0),
    added: Number(data?.added ?? 0),
  };
}

export async function setCampaignStatus(id: string, status: "running" | "paused" | "cancelled") {
  await assertAdminSession();
  const { error } = await (supabaseAdminSession as any).rpc("engagement_set_status", {
    _id: id,
    _status: status,
  });
  if (error) throw error;
}

export async function listCampaigns(filter?: {
  status?: CampaignStatus | "all";
  limit?: number;
}): Promise<EngagementCampaign[]> {
  let q = (supabaseAdminSession.from("engagement_campaigns") as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter?.limit ?? 100);
  if (filter?.status && filter.status !== "all") q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as EngagementCampaign[];
}

export async function listCampaignEvents(campaignId: string, limit = 100): Promise<EngagementEvent[]> {
  const { data, error } = await (supabaseAdminSession.from("engagement_events") as any)
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as EngagementEvent[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function estimateFinish(c: EngagementCampaign): Date {
  // Nếu tiến độ nhanh hơn thời gian thì ends_at có thể bị vượt qua.
  // Ước tính thực tế = min(ends_at, now + duration_left_proportional).
  const now = Date.now();
  const ends = new Date(c.ends_at).getTime();
  if (c.completed_amount >= c.total_amount) return new Date(c.finished_at ?? now);
  const rate = c.completed_amount > 0
    ? (Date.now() - new Date(c.started_at).getTime()) / c.completed_amount
    : 0;
  const remaining = c.total_amount - c.completed_amount;
  const eta = rate > 0 ? now + rate * remaining : ends;
  return new Date(Math.min(ends, eta));
}

export function progressPercent(c: EngagementCampaign): number {
  if (c.total_amount <= 0) return 0;
  return Math.min(100, Math.round((c.completed_amount / c.total_amount) * 100));
}

export const engagementService = {
  distributeTargets,
  searchPostByUid,
  searchPostsByUserUid,
  createLikeCampaign,
  tickEngagement,
  setCampaignStatus,
  listCampaigns,
  listCampaignEvents,
  estimateFinish,
  progressPercent,
};