// src/lib/bot-system.ts
// Data access layer for the internal bot system.
// All queries go through the existing Supabase client (RLS enforces admin access).
import { supabase } from "@/integrations/supabase/client";

export type BotType =
  | "engagement_bot"
  | "moderation_bot"
  | "spam_guard"
  | "comment_guard"
  | "register_guard"
  | "risk_detection_bot";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type QueueStatus = "pending" | "processing" | "done" | "failed" | "cancelled";
export type ModStatus = "pending" | "approved" | "rejected" | "auto_hidden" | "escalated";

export interface BotAccount {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  bot_type: BotType;
  active: boolean;
  permissions: Record<string, unknown>;
  automation_level: number;
  risk_level: RiskLevel;
  created_at: string;
  last_active: string | null;
}

export interface BotLog {
  id: number;
  bot_id: string | null;
  bot_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_user: string | null;
  reason: string | null;
  risk_score: number | null;
  result: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ModerationItem {
  id: number;
  target_type: string;
  target_id: string;
  target_user: string | null;
  detected_by: string | null;
  risk_score: number;
  reasons: string[];
  snapshot: Record<string, unknown> | null;
  status: ModStatus;
  created_at: string;
}

export interface QueueRow {
  id: number;
  bot_id: string | null;
  job_type: string;
  status: QueueStatus;
  priority: number;
  attempts: number;
  scheduled_for: string;
  created_at: string;
}

export interface RiskScoreRow {
  user_id: string;
  score: number;
  level: RiskLevel;
  last_event_at: string | null;
  updated_at: string;
}

const sb: any = supabase;

export async function listBots(): Promise<BotAccount[]> {
  const { data, error } = await sb
    .from("bot_accounts")
    .select("*")
    .order("bot_type", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BotAccount[];
}

export async function setBotActive(id: string, active: boolean) {
  const { error } = await sb
    .from("bot_accounts")
    .update({ active, last_active: active ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function setBotIntensity(id: string, level: number) {
  const lvl = Math.max(0, Math.min(10, Math.round(level)));
  const { error } = await sb.from("bot_accounts").update({ automation_level: lvl }).eq("id", id);
  if (error) throw error;
}

export async function listLogs(limit = 100): Promise<BotLog[]> {
  const { data, error } = await sb
    .from("bot_actions_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BotLog[];
}

export async function listModerationQueue(status: ModStatus | "all" = "pending", limit = 100) {
  let q = sb.from("moderation_queue").select("*").order("created_at", { ascending: false }).limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ModerationItem[];
}

export async function reviewModeration(id: number, status: ModStatus, note?: string) {
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb
    .from("moderation_queue")
    .update({
      status,
      review_note: note ?? null,
      reviewed_by: u?.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function listQueue(limit = 200): Promise<QueueRow[]> {
  const { data, error } = await sb
    .from("bot_activity_queue")
    .select("id,bot_id,job_type,status,priority,attempts,scheduled_for,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as QueueRow[];
}

export async function listRiskScores(limit = 100): Promise<RiskScoreRow[]> {
  const { data, error } = await sb
    .from("risk_scores")
    .select("*")
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RiskScoreRow[];
}

export async function checkAdminAccess(): Promise<boolean> {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return false;
  const { data, error } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  if (error) return false;
  return !!data?.is_admin;
}

export const BOT_TYPE_LABEL: Record<BotType, string> = {
  engagement_bot: "Engagement",
  moderation_bot: "Moderation",
  spam_guard: "Spam Guard",
  comment_guard: "Comment Guard",
  register_guard: "Register Guard",
  risk_detection_bot: "Risk Detection",
};

export const RISK_COLOR: Record<RiskLevel, string> = {
  low: "text-emerald-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-500",
};
