import { supabase } from "@/lib/supabase";
import { generateFakeBatch, type VipDistribution } from "@/lib/fake-identity";
import type { FakeFollowerJoined } from "@/integrations/supabase/fake-types";

// Cast helper – fake_* tables không có trong types.ts auto-gen.
// Bảng đã được tạo qua SQL migration_fake_followers.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAny = supabase as unknown as any;

const CHUNK = 200;

async function insertFakeProfilesCompat(profiles: Array<Record<string, unknown>>) {
  const primary = await sb.from("fake_profiles").insert(profiles).select("id");
  if (!primary.error) return primary;

  const message = String(primary.error.message || "").toLowerCase();
  if (!message.includes("display_name") && !message.includes("avatar_url")) {
    return primary;
  }

  const fallbackProfiles = profiles.map((profile) => ({
    username: profile.username,
    full_name: profile.display_name,
    avatar: profile.avatar_url,
    locale: profile.locale,
    vip_level: profile.vip_level,
  }));
  return sb.from("fake_profiles").insert(fallbackProfiles).select("id");
}

export async function buffFakeFollowers(
  targetUserId: string,
  count: number,
  onProgress?: (done: number, total: number) => void,
  vipDist: VipDistribution = {},
): Promise<number> {
  if (count <= 0) return 0;
  const safe = Math.min(count, 1000);

  let created = 0;
  for (let offset = 0; offset < safe; offset += CHUNK) {
    const sliceSize = Math.min(CHUNK, safe - offset);
    const profiles = generateFakeBatch(sliceSize, vipDist);

    const { data: insertedProfiles, error: pErr } = await insertFakeProfilesCompat(
      profiles as unknown as Array<Record<string, unknown>>,
    );
    if (pErr) throw pErr;

    const ids = (insertedProfiles ?? []) as unknown as Array<{ id: string }>;
    const followsRows = ids.map((p) => ({
      fake_profile_id: p.id,
      following_id: targetUserId,
    }));

    const { error: fErr } = await sb.from("fake_follows").insert(followsRows);
    if (fErr) throw fErr;

    created += ids.length;
    onProgress?.(created, safe);
  }

  await syncFollowerCount(targetUserId);
  return created;
}

export async function syncFollowerCount(userId: string): Promise<number> {
  const [{ count: realCount }, { count: fakeCount }] = await Promise.all([
    sbAny
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
    sb
      .from("fake_follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
  ]);
  const total = (realCount ?? 0) + (fakeCount ?? 0);
  const { error } = await supabase.from("profiles").update({ followers_count: total }).eq("id", userId);
  if (error) throw error;
  return total;
}

export async function getTotalFollowerCount(userId: string): Promise<number> {
  // Buff sạch: badge Followers luôn tôn trọng profiles.followers_count
  // (admin buff 11K → hồ sơ và lịch sử tài khoản hiển thị 11K ngay,
  //  không cần tạo follower thật).
  const [{ count: realCount, error: realErr }, { count: fakeCount, error: fakeErr }, profileRes] = await Promise.all([
    sbAny
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
    sb
      .from("fake_follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
    sbAny
      .from("profiles")
      .select("followers_count")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (realErr) throw realErr;
  if (fakeErr) throw fakeErr;
  const organic = (realCount ?? 0) + (fakeCount ?? 0);
  const buff = Number(profileRes?.data?.followers_count ?? 0);
  return Math.max(organic, Number.isFinite(buff) ? buff : 0);
}

export async function loadFakeFollowers(
  targetUserId: string,
  opts: { from?: number; to?: number } = {},
): Promise<FakeFollowerJoined[]> {
  const from = opts.from ?? 0;
  const to = opts.to ?? from + 999;
  const { data, error } = await sb
    .from("fake_follows")
    .select("id, created_at, fake_profile:fake_profiles(id, username, display_name, full_name, avatar, avatar_url, locale, vip_level, province, bio, is_active, created_at)")
    .eq("following_id", targetUserId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []) as FakeFollowerJoined[];
}

export async function countFakeFollowers(targetUserId: string): Promise<number> {
  const { count, error } = await sb
    .from("fake_follows")
    .select("id", { count: "exact", head: true })
    .eq("following_id", targetUserId);
  if (error) throw error;
  return count ?? 0;
}
