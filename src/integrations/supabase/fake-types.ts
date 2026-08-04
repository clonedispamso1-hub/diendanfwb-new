/**
 * Manual type extensions for the fake_profiles / fake_follows feature.
 * The auto-generated types.ts does not yet include these tables (run
 * the migration_fake_followers.sql first, then regenerate types if you want).
 */

export type FakeLocale = "ja" | "ko" | "en" | "zh" | "vi";

export interface FakeProfileRow {
  id: string;
  username: string;
  display_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  avatar?: string | null;
  locale: FakeLocale;
  created_at: string;
  vip_level?: number | null;
  province?: string | null;
  bio?: string | null;
  is_active?: boolean | null;
}

export interface FakeFollowRow {
  id: string;
  fake_profile_id: string;
  following_id: string;
  created_at: string;
}

export interface FakeFollowerJoined {
  id: string;            // fake_follows.id
  created_at: string;
  fake_profile: FakeProfileRow;
}
