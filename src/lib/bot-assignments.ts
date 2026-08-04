// src/lib/bot-assignments.ts
// Data layer for the bot_assignments table (real users acting as bots).
import { supabase } from "@/integrations/supabase/client";
import type { BotType, RiskLevel } from "@/lib/bot-system";

const sb: any = supabase;

export interface BotAssignment {
  id: string;
  user_id: string;
  bot_role: BotType;
  enabled: boolean;
  priority_level: number;
  cooldown_config: { min_seconds?: number; max_seconds?: number } & Record<string, unknown>;
  activity_config: {
    active_hours?: { start: number; end: number };
    max_actions_per_hour?: number;
    max_actions_per_day?: number;
    intensity?: number;
    targeting?: Record<string, unknown>;
    comment_pool?: string[];
  } & Record<string, unknown>;
  created_by_admin: string | null;
  last_action_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSlim {
  id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_admin?: boolean | null;
}

export interface BotAssignmentRow extends BotAssignment {
  profile?: ProfileSlim | null;
  risk?: { level: RiskLevel; score: number } | null;
}

export async function listAssignments(): Promise<BotAssignmentRow[]> {
  const { data, error } = await sb
    .from("bot_assignments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as BotAssignment[];
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: profiles }, { data: risks }] = await Promise.all([
    sb.from("profiles").select("id,username,display_name,avatar_url,is_admin").in("id", ids),
    sb.from("risk_scores").select("user_id,level,score").in("user_id", ids),
  ]);
  const pmap = new Map<string, ProfileSlim>((profiles ?? []).map((p: any) => [p.id, p]));
  const rmap = new Map<string, { level: RiskLevel; score: number }>(
    (risks ?? []).map((r: any) => [r.user_id, { level: r.level, score: r.score }]),
  );
  return rows.map((r) => ({ ...r, profile: pmap.get(r.user_id) ?? null, risk: rmap.get(r.user_id) ?? null }));
}

export async function searchProfiles(q: string, limit = 10): Promise<ProfileSlim[]> {
  const term = q.trim();
  if (!term) return [];
  const { data, error } = await sb
    .from("profiles")
    .select("id,username,display_name,avatar_url,is_admin")
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProfileSlim[];
}

export async function assignBot(args: {
  user_id: string;
  bot_role: BotType;
  priority_level?: number;
  enabled?: boolean;
}): Promise<BotAssignment> {
  const { data: u } = await sb.auth.getUser();
  const payload = {
    user_id: args.user_id,
    bot_role: args.bot_role,
    enabled: args.enabled ?? true,
    priority_level: args.priority_level ?? 5,
    created_by_admin: u?.user?.id ?? null,
  };
  const { data, error } = await sb
    .from("bot_assignments")
    .upsert(payload, { onConflict: "user_id,bot_role" })
    .select("*")
    .single();
  if (error) throw error;
  return data as BotAssignment;
}

export async function updateAssignment(id: string, patch: Partial<BotAssignment>) {
  const { error } = await sb.from("bot_assignments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeAssignment(id: string) {
  const { error } = await sb.from("bot_assignments").delete().eq("id", id);
  if (error) throw error;
}

export async function checkSuperAdmin(): Promise<boolean> {
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return false;
  // Reuse profiles.is_admin as super-admin fallback (matches has_bot_role server fn)
  const { data } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  return !!data?.is_admin;
}
