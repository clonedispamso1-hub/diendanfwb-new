import { supabase } from "@/lib/db/router";
import { db3 } from "@/lib/db/router";

/** admin_logs + notifications đã chuyển sang Supabase #3 (logs). */
const logs = () => db3() as any;
import { isCloneUserId } from "@/lib/clone-account";

/**
 * Reports V2 — adapted to the REAL database schema (inspected via PostgREST).
 *
 * public.reports        : id, reporter_id (→profiles.id), reported_user_id (→profiles.id),
 *                         target_id (uuid), report_type (text), reason (text),
 *                         status (text), created_at
 * public.notifications  : id, user_id, type, title, message, data, is_read, link,
 *                         related_id, created_at, updated_at
 * public.admin_logs     : id, actor_id, action, created_at
 * public.profiles       : moderation columns are is_banned, banned_until, ban_reason
 *
 * There are NO reports_posts / reports_profiles / reports_messages /
 * user_notifications tables, and no per-feature lock columns on profiles.
 * The three report "kinds" are one table discriminated by `report_type`.
 */

export type ReportStatus = "pending" | "reviewing" | "resolved" | "rejected";
export type ReportKind = "posts" | "profiles" | "messages";

/** kind → real `reports.report_type` value */
export const REPORT_TYPE: Record<ReportKind, string> = {
  posts: "post",
  profiles: "profile",
  messages: "message",
};

export interface ReportRow {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  target_id: string | null;
  report_type: string | null;
  reason: string | null;
  status: ReportStatus;
  created_at: string;
}

const sb = supabase as any;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Penalty options backed by real profiles columns (is_banned / banned_until / ban_reason). */
export type PenaltyDuration = 3 | 7 | 30 | "permanent";
export const PENALTY_DURATIONS: PenaltyDuration[] = [3, 7, 30, "permanent"];
export const DURATION_LABEL: Record<string, string> = {
  "3": "3 ngày",
  "7": "7 ngày",
  "30": "30 ngày",
  permanent: "Vĩnh viễn",
};

export function computeBanUntil(duration: PenaltyDuration): string {
  if (duration === "permanent") return "2999-12-31T23:59:59Z";
  const d = new Date();
  d.setDate(d.getDate() + duration);
  return d.toISOString();
}

/** Create a report. One table, discriminated by report_type. */
export async function submitReport(input: {
  kind: ReportKind;
  reporterId: string;
  /** user being reported (post owner / profile owner / message sender) */
  reportedUserId: string;
  /** post id, profile id or conversation/message id — must be a uuid */
  targetId?: string | null;
  reason: string;
  detail?: string | null;
}) {
  const reason = input.detail ? `${input.reason} — ${input.detail}` : input.reason;
  const target = isUuid(input.targetId) ? input.targetId : input.reportedUserId;
  const { error } = await sb.from("reports").insert({
    reporter_id: input.reporterId,
    reported_user_id: input.reportedUserId,
    target_id: target,
    report_type: REPORT_TYPE[input.kind],
    reason,
    status: "pending",
  });
  if (error) throw error;
}

/** Load a report list for one kind. */
export async function fetchReports(kind: ReportKind, status?: ReportStatus | "all") {
  let q = sb
    .from("reports")
    .select("id, reporter_id, reported_user_id, target_id, report_type, reason, status, created_at")
    .eq("report_type", REPORT_TYPE[kind])
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data as ReportRow[]) || [];
}

/** Pending counts per kind, from the single reports table. */
export async function fetchPendingCounts() {
  const count = async (kind: ReportKind) => {
    const { count: c } = await sb
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("report_type", REPORT_TYPE[kind])
      .eq("status", "pending");
    return c ?? 0;
  };
  const [posts, profiles, messages] = await Promise.all([
    count("posts"),
    count("profiles"),
    count("messages"),
  ]);
  return { posts, profiles, messages, total: posts + profiles + messages };
}

/** Pending reports for one target user (any kind). */
export async function fetchPendingCountForUser(userId: string) {
  const { count } = await sb
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .or(`reported_user_id.eq.${userId},target_id.eq.${userId}`);
  return count ?? 0;
}

/** reports has no handled_by/handled_at column — status is the only writable state. */
export async function updateReportStatus(id: string, status: ReportStatus) {
  const { error } = await sb.from("reports").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteReport(id: string) {
  const { error } = await sb.from("reports").delete().eq("id", id);
  if (error) throw error;
}

/** Ban/unban a user using the real profiles moderation columns. */
export async function applyAccountBan(
  targetUserId: string,
  duration: PenaltyDuration | null,
  reason?: string | null,
) {
  const patch =
    duration === null
      ? { is_banned: false, banned_until: null, ban_reason: null }
      : { is_banned: true, banned_until: computeBanUntil(duration), ban_reason: reason ?? null };
  const { error } = await sb.from("profiles").update(patch).eq("id", targetUserId);
  if (error) throw error;
}

/** admin_logs only has actor_id + action; context is folded into the action text. */
export async function logAdmin(
  actorId: string,
  action: string,
  context: Record<string, unknown> = {},
) {
  try {
    const suffix = Object.entries(context)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    await logs().from("admin_logs").insert({
      actor_id: actorId,
      action: suffix ? `${action} (${suffix})` : action,
    });
  } catch (e) {
    console.warn("[admin_logs] insert failed", e);
  }
}

/** Send a notification using the real public.notifications shape. */
export async function sendUserNotification(
  userId: string,
  input: {
    type?: string;
    title: string;
    message?: string;
    link?: string | null;
    relatedId?: string | null;
    data?: Record<string, unknown>;
  },
) {
  // Clone (tài khoản thứ hai) không nhận bất kỳ Notification nào.
  if (await isCloneUserId(userId)) return;
  const { error } = await logs().from("notifications").insert({
    user_id: userId,
    type: input.type ?? "warning",
    title: input.title,
    message: input.message ?? "",
    link: input.link ?? null,
    related_id: isUuid(input.relatedId) ? input.relatedId : null,
    data: input.data ?? {},
    is_read: false,
  });
  if (error) throw error;
}

/** Bulk profile lookup (id → {username, full_name, avatar}). */
export async function fetchProfilesByIds(ids: string[]) {
  const clean = Array.from(new Set(ids.filter(isUuid)));
  if (clean.length === 0) return {} as Record<string, any>;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar")
    .in("id", clean);
  return Object.fromEntries(((data as any[]) || []).map((p: any) => [p.id, p]));
}
