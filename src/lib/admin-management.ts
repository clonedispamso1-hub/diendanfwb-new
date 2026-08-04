// src/lib/admin-management.ts
// Data layer for the Admin Permissions Manager module.
import { supabase } from "@/integrations/supabase/client";
import type { AdminPermission } from "@/lib/admin-permissions";

const sb: any = supabase;

export type AdminRole =
  | "super_admin"
  | "moderation_admin"
  | "finance_admin"
  | "support_admin"
  | "analytics_admin"
  | "bot_admin"
  | "live_admin";

export const ADMIN_ROLES: AdminRole[] = [
  "super_admin",
  "moderation_admin",
  "finance_admin",
  "support_admin",
  "analytics_admin",
  "bot_admin",
  "live_admin",
];

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  moderation_admin: "Moderation Admin",
  finance_admin: "Finance Admin",
  support_admin: "Support Admin",
  analytics_admin: "Analytics Admin",
  bot_admin: "Bot Admin",
  live_admin: "Live Admin",
};

export const ROLE_ACCENT: Record<AdminRole, string> = {
  super_admin: "#f472b6",
  moderation_admin: "#fbbf24",
  finance_admin: "#34d399",
  support_admin: "#60a5fa",
  analytics_admin: "#22d3ee",
  bot_admin: "#a78bfa",
  live_admin: "#f87171",
};

export const GRANULAR_PERMISSIONS: AdminPermission[] = [
  "manage_users" as AdminPermission,
  "manage_bots" as AdminPermission,
  "manage_reports" as AdminPermission,
  "manage_finance" as AdminPermission,
  "manage_live" as AdminPermission,
  "manage_security" as AdminPermission,
  "manage_analytics" as AdminPermission,
  "manage_system_health" as AdminPermission,
  "manage_shadowban" as AdminPermission,
  "manage_posts" as AdminPermission,
];

export interface AdminUserRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_legacy_admin: boolean;
  roles: AdminRole[];
  permissions: AdminPermission[];
  suspended: boolean;
  last_action_at: string | null;
}

export interface AdminCandidate {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface AdminLogRow {
  id: number;
  actor_id: string | null;
  module: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: { username: string | null; display_name: string | null } | null;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const { data, error } = await sb.rpc("list_admin_users");
  if (error) {
    // Fallback: derive from admin_permissions + profiles
    const { data: perms } = await sb.from("admin_permissions").select("user_id, permission");
    const { data: roles } = await sb.from("admin_role_assignments").select("user_id, role, suspended");
    const ids = Array.from(
      new Set([...(perms ?? []).map((p: any) => p.user_id), ...(roles ?? []).map((r: any) => r.user_id)]),
    );
    if (ids.length === 0) return [];
    const { data: profs } = await sb
      .from("profiles")
      .select("id,username,display_name,avatar_url,is_admin")
      .in("id", ids);
    const map = new Map<string, AdminUserRow>();
    for (const p of profs ?? []) {
      map.set(p.id, {
        user_id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        is_legacy_admin: !!p.is_admin,
        roles: [],
        permissions: [],
        suspended: false,
        last_action_at: null,
      });
    }
    for (const r of roles ?? []) {
      const row = map.get(r.user_id);
      if (row) {
        row.roles.push(r.role);
        if (r.suspended) row.suspended = true;
      }
    }
    for (const pe of perms ?? []) {
      const row = map.get(pe.user_id);
      if (row) row.permissions.push(pe.permission);
    }
    return Array.from(map.values());
  }
  return (data ?? []) as AdminUserRow[];
}

export async function searchAdminCandidates(q: string, limit = 10): Promise<AdminCandidate[]> {
  const { data, error } = await sb.rpc("search_admin_candidates", { _q: q, _limit: limit });
  if (error) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id,username,display_name,avatar_url,is_admin")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(limit);
    return (profs ?? []) as AdminCandidate[];
  }
  return (data ?? []) as AdminCandidate[];
}

export async function grantPermission(user_id: string, permission: AdminPermission) {
  const { error } = await sb.rpc("grant_admin_permission", { _user_id: user_id, _perm: permission });
  if (error) throw error;
}
export async function revokePermission(user_id: string, permission: AdminPermission) {
  const { error } = await sb.rpc("revoke_admin_permission", { _user_id: user_id, _perm: permission });
  if (error) throw error;
}
export async function assignRole(user_id: string, role: AdminRole) {
  const { error } = await sb.rpc("assign_admin_role", { _user_id: user_id, _role: role });
  if (error) throw error;
}
export async function removeRole(user_id: string, role: AdminRole) {
  const { error } = await sb.rpc("remove_admin_role", { _user_id: user_id, _role: role });
  if (error) throw error;
}
export async function suspendAdmin(user_id: string) {
  const { error } = await sb.rpc("suspend_admin", { _user_id: user_id });
  if (error) throw error;
}
export async function restoreAdmin(user_id: string) {
  const { error } = await sb.rpc("restore_admin", { _user_id: user_id });
  if (error) throw error;
}

export async function listAdminLogs(limit = 100): Promise<AdminLogRow[]> {
  const { data, error } = await sb
    .from("admin_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = (data ?? []) as AdminLogRow[];
  const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]));
  if (ids.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);
    const map = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
    for (const r of rows) {
      if (r.actor_id) r.actor = map.get(r.actor_id) ?? null;
    }
  }
  return rows;
}
