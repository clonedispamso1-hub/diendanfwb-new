/**
 * Gán "Nhóm mồi" cho Tài khoản thứ hai (seed accounts).
 *
 * - Dữ liệu nhóm dùng lại nguyên trạng: `bait_groups` ("Nhóm Mới") và
 *   `zalo_bait_groups` ("Nhóm Zalo Mồi") trên Supabase #4.
 * - Quan hệ account ↔ nhóm lưu bền ở bảng `seed_account_groups` (Supabase #4),
 *   khoá chính (account_id, group_kind, group_id) → không bao giờ trùng nhóm.
 *
 * SQL khởi tạo: supabase-sql/SB4/2026-09-17_seed_account_groups.sql
 */
import { sb4Admin } from "@/lib/supabase-v4";
import { fetchBaitGroups } from "@/lib/bait-groups-cache";
import { listZaloBaitGroups } from "@/lib/zalo-bait-groups";

export const SEED_ACCOUNT_GROUPS_TABLE = "seed_account_groups";

export type SeedGroupKind = "bait" | "zalo";

export interface SeedGroupOption {
  kind: SeedGroupKind;
  id: string;
  name: string;
  avatar_url: string | null;
  member_count: number;
  message_count: number;
  /** Mô tả/preview có sẵn của nhóm. */
  info: string | null;
  /** Nhãn nguồn hiển thị cho admin. */
  source: string;
}

export interface SeedAccountGroupRow {
  account_id: string;
  group_kind: SeedGroupKind;
  group_id: string;
}

/** Toàn bộ nhóm mồi hiện có (Nhóm Mới + Nhóm Zalo Mồi). */
export async function fetchAllSeedGroups(): Promise<SeedGroupOption[]> {
  const [bait, zalo] = await Promise.all([
    fetchBaitGroups().catch(() => ({ folders: [], groups: [] })),
    listZaloBaitGroups().catch(() => []),
  ]);

  const folderName = new Map<string, string>(
    (bait.folders || []).map((f) => [f.id, f.name] as [string, string]),
  );
  const baitOptions: SeedGroupOption[] = (bait.groups || []).map((g) => ({
    kind: "bait" as const,
    id: g.id,
    name: g.name,
    avatar_url: g.avatar_url ?? null,
    member_count: Number(g.member_count ?? 0),
    message_count: Number(g.message_count ?? 0),
    info: g.info_text ?? g.preview_text ?? null,
    source: folderName.get(g.folder_id) || "Nhóm Mới",
  }));

  const zaloOptions: SeedGroupOption[] = (zalo || []).map((g) => ({
    kind: "zalo" as const,
    id: g.id,
    name: g.name,
    avatar_url: g.avatar_url ?? null,
    member_count: Number(g.member_count ?? 0),
    message_count: Number(g.message_count ?? 0),
    info: null,
    source: "Nhóm Zalo Mồi",
  }));

  return [...baitOptions, ...zaloOptions];
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random 1–10 nhóm (số lượng cũng random) từ danh sách nhóm hiện có. */
export function pickRandomGroups(all: SeedGroupOption[], max = 10): SeedGroupOption[] {
  if (!all.length) return [];
  const limit = Math.min(max, all.length);
  const n = Math.floor(Math.random() * limit) + 1;
  return shuffle(all).slice(0, n);
}

/**
 * Random & LƯU nhóm mồi cho từng account. Mỗi account một số lượng khác nhau.
 * Lần chạy sau THAY THẾ assignment cũ của chính account đó (không nhân bản).
 */
export async function randomAssignSeedGroups(
  accountIds: string[],
  options?: { groups?: SeedGroupOption[] },
): Promise<{ accounts: number; links: number }> {
  const ids = Array.from(new Set(accountIds.filter(Boolean)));
  if (!ids.length) return { accounts: 0, links: 0 };

  const all = options?.groups ?? (await fetchAllSeedGroups());
  if (!all.length) throw new Error("Chưa có nhóm mồi nào để random");

  const rows: Array<{ account_id: string; group_kind: SeedGroupKind; group_id: string }> = [];
  for (const accountId of ids) {
    for (const g of pickRandomGroups(all)) {
      rows.push({ account_id: accountId, group_kind: g.kind, group_id: g.id });
    }
  }

  const sb = sb4Admin();
  // Thay thế assignment cũ của đúng các account được chọn.
  const del = await sb.from(SEED_ACCOUNT_GROUPS_TABLE).delete().in("account_id", ids);
  if (del.error) throw new Error(del.error.message);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from(SEED_ACCOUNT_GROUPS_TABLE).insert(chunk as any);
    if (error) throw new Error(error.message);
  }

  return { accounts: ids.length, links: rows.length };
}

/** Số nhóm đã gán cho từng account (dùng cho cột "Nhóm mồi"). */
export async function fetchSeedGroupCounts(accountIds: string[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(accountIds.filter(Boolean)));
  if (!ids.length) return {};
  const out: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await sb4Admin()
      .from(SEED_ACCOUNT_GROUPS_TABLE)
      .select("account_id")
      .in("account_id", chunk);
    if (error) return out; // bảng chưa tạo → im lặng
    for (const r of (data || []) as Array<{ account_id: string }>) {
      out[r.account_id] = (out[r.account_id] || 0) + 1;
    }
  }
  return out;
}

/** Chi tiết nhóm mồi của 1 account (đã kèm thông tin nhóm sẵn có). */
export async function fetchSeedGroupsOfAccount(accountId: string): Promise<SeedGroupOption[]> {
  const { data, error } = await sb4Admin()
    .from(SEED_ACCOUNT_GROUPS_TABLE)
    .select("group_kind, group_id")
    .eq("account_id", accountId);
  if (error) throw new Error(error.message);
  const links = (data || []) as Array<{ group_kind: SeedGroupKind; group_id: string }>;
  if (!links.length) return [];
  const all = await fetchAllSeedGroups();
  const byKey = new Map(all.map((g) => [`${g.kind}:${g.id}`, g]));
  return links
    .map((l) => byKey.get(`${l.group_kind}:${l.group_id}`))
    .filter((g): g is SeedGroupOption => Boolean(g));
}
