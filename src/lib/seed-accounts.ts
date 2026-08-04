// Database-only Seed Account system.
//
// Seed Accounts are pure rows in `public.seed_accounts`. They do NOT use
// Supabase Authentication, they are NOT rows in auth.users, and they are NOT
// rows in public.profiles. Because the table carries no device-limit /
// fingerprint / anti-spam triggers, administrators can create an UNLIMITED
// number of them without ever being blocked.
//
// Run the migration first: docs/sql/2026-07-02_seed_accounts_db_only.sql
import { supabase } from "@/lib/supabase";

const sb = supabase as unknown as any;

export interface SeedAccount {
  id: string;
  display_name: string;
  username: string | null;
  avatar: string | null;
  bio: string | null;
  gender: string | null;
  age: number | null;
  distance_km: number | null;
  is_online: boolean;
  is_active: boolean; // true = active/visible, false = hidden
  province: string | null;
  created_at: string;
  updated_at: string;
}

export type SeedAccountInput = Partial<
  Pick<
    SeedAccount,
    | "display_name"
    | "username"
    | "avatar"
    | "bio"
    | "gender"
    | "age"
    | "distance_km"
    | "is_online"
    | "is_active"
    | "province"
  >
>;

const randomUsername = () => `seed_${Math.random().toString(36).slice(2, 8)}`;

/** Admin: list every seed account (active + hidden). */
export async function adminListSeedAccounts(limit = 500): Promise<SeedAccount[]> {
  const { data, error } = await sb
    .from("seed_accounts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as SeedAccount[];
}

/** Admin: create a single seed account (no auth, no limits). */
export async function createSeedAccount(input: SeedAccountInput = {}): Promise<SeedAccount> {
  const payload = {
    display_name: input.display_name?.trim() || "Seed user",
    username: (input.username ?? randomUsername()).trim(),
    avatar: input.avatar?.trim() || null,
    bio: input.bio?.trim() || null,
    gender: input.gender || "female",
    age: input.age ?? 22,
    distance_km: input.distance_km ?? 2,
    is_online: input.is_online ?? true,
    is_active: input.is_active ?? true,
    province: input.province?.trim() || null,
  };
  const { data, error } = await sb.from("seed_accounts").insert(payload).select("*").single();
  if (error) throw error;
  return data as SeedAccount;
}

/** Admin: create many seed accounts at once (no auth, no limits). */
export async function bulkCreateSeedAccounts(inputs: SeedAccountInput[]): Promise<number> {
  if (!inputs.length) return 0;
  const rows = inputs.map((input) => ({
    display_name: input.display_name?.trim() || "Seed user",
    username: (input.username ?? randomUsername()).trim(),
    avatar: input.avatar?.trim() || null,
    bio: input.bio?.trim() || null,
    gender: input.gender || "female",
    age: input.age ?? 22,
    distance_km: input.distance_km ?? 2,
    is_online: input.is_online ?? true,
    is_active: input.is_active ?? true,
    province: input.province?.trim() || null,
  }));
  const { data, error } = await sb.from("seed_accounts").insert(rows).select("id");
  if (error) throw error;
  return (data || []).length;
}

/** Admin: patch a seed account. */
export async function updateSeedAccount(id: string, patch: SeedAccountInput): Promise<void> {
  const { error } = await sb.from("seed_accounts").update(patch).eq("id", id);
  if (error) throw error;
}

/** Admin: permanently delete a seed account. */
export async function deleteSeedAccount(id: string): Promise<void> {
  const { error } = await sb.from("seed_accounts").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Public: load active seed accounts for display in Connections / Feed.
 * Returned rows look exactly like real users to the UI.
 */
export async function loadPublicSeedAccounts(limit = 100): Promise<SeedAccount[]> {
  const { data, error } = await sb
    .from("seed_accounts")
    .select("*")
    .eq("is_active", true)
    .order("is_online", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Table may not exist yet (migration not run). Fail soft.
    console.warn("[seed-accounts] load failed:", error.message);
    return [];
  }
  return (data || []) as SeedAccount[];
}
