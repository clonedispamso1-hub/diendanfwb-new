// Admin module permissions helper.
// Uses my_admin_permissions() RPC defined in db/2026051400_admin_modules_expansion.sql.
// Falls back to profiles.is_admin (treated as super_admin) if the RPC isn't deployed yet.
import { supabase } from "@/integrations/supabase/client";

export type AdminPermission =
  | "super_admin"
  | "moderation_admin"
  | "finance_admin"
  | "support_admin"
  | "analytics_admin"
  | "bot_admin"
  | "security_admin"
  | "live_admin";

export async function loadMyAdminPermissions(isLegacyAdmin: boolean): Promise<Set<AdminPermission>> {
  const sb = supabase as any;
  try {
    const { data, error } = await sb.rpc("my_admin_permissions");
    if (!error && Array.isArray(data)) {
      const set = new Set<AdminPermission>(data as AdminPermission[]);
      if (isLegacyAdmin) set.add("super_admin");
      return set;
    }
  } catch {
    /* swallow */
  }
  // Fallback: legacy is_admin = full access
  return new Set<AdminPermission>(isLegacyAdmin ? ["super_admin"] : []);
}

export function hasPerm(set: Set<AdminPermission>, perm: AdminPermission): boolean {
  return set.has("super_admin") || set.has(perm);
}

export async function logAdminAction(
  module: string,
  action: string,
  target_type?: string | null,
  target_id?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sb = supabase as any;
  try {
    await sb.rpc("log_admin_action", {
      _module: module,
      _action: action,
      _target_type: target_type ?? null,
      _target_id: target_id ?? null,
      _metadata: metadata ?? {},
    });
  } catch {
    /* non-fatal */
  }
}
