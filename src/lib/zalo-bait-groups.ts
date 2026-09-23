/**
 * "Nhóm Zalo Mồi" — dữ liệu nằm RIÊNG trên Supabase #4 (src/lib/supabase-v4.ts),
 * bảng `public.zalo_bait_groups`. Không đụng Supabase 1/2/3 và không dùng lại
 * bảng `bait_groups` của tab "Nhóm".
 *
 * SQL khởi tạo: supabase-sql/SB4/2026-09-14_zalo_bait_groups.sql
 */
import { sb4, sb4Admin } from "@/lib/supabase-v4";

export const ZALO_GROUP_TABLE = "zalo_bait_groups";
export const ZALO_GROUP_COLUMNS =
  "id, name, avatar_url, message_count, member_count, men_count, women_count, admin_count, sort_order, created_at";

export interface ZaloBaitGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  message_count: number;
  member_count: number;
  men_count: number;
  women_count: number;
  admin_count: number;
  sort_order: number;
  created_at: string;
}

export interface ZaloBaitGroupInput {
  name: string;
  avatar_url: string | null;
  message_count: number;
  member_count: number;
  men_count: number;
  women_count: number;
  admin_count: number;
  sort_order?: number;
}

/**
 * Chỉ có Tổng thành viên → tự chia Nam / Nữ / Admin sao cho tổng đúng bằng Tổng.
 * Admin ~0.6% (tối thiểu 1 khi tổng ≥ 3), phần còn lại chia Nam 48% / Nữ 52%.
 */
export function splitMembers(total: number): { men: number; women: number; admins: number } {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  if (t === 0) return { men: 0, women: 0, admins: 0 };
  if (t <= 2) return { men: t, women: 0, admins: 0 };
  const admins = Math.max(1, Math.min(t - 2, Math.round(t * 0.006)));
  const rest = t - admins;
  const men = Math.floor(rest * 0.48);
  const women = rest - men;
  return { men, women, admins };
}

/** Kiểm tra Nam + Nữ + Admin = Tổng thành viên. */
export function validateMemberSplit(input: {
  member_count: number;
  men_count: number;
  women_count: number;
  admin_count: number;
}): string | null {
  const { member_count, men_count, women_count, admin_count } = input;
  if ([member_count, men_count, women_count, admin_count].some((n) => !Number.isFinite(n) || n < 0))
    return "Các số phải là số nguyên không âm.";
  const sum = men_count + women_count + admin_count;
  if (sum !== member_count)
    return `Nam + Nữ + Admin (${sum}) phải bằng Tổng thành viên (${member_count}).`;
  return null;
}

/** Danh sách nhóm cho popup người dùng (đọc bằng key công khai). */
export async function listZaloBaitGroups(): Promise<ZaloBaitGroup[]> {
  const { data, error } = await sb4()
    .from(ZALO_GROUP_TABLE)
    .select(ZALO_GROUP_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as ZaloBaitGroup[]) || [];
}

/** Danh sách nhóm cho Admin Panel. */
export async function adminListZaloBaitGroups(): Promise<ZaloBaitGroup[]> {
  const { data, error } = await sb4Admin()
    .from(ZALO_GROUP_TABLE)
    .select(ZALO_GROUP_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as ZaloBaitGroup[]) || [];
}

export async function createZaloBaitGroup(input: ZaloBaitGroupInput): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_GROUP_TABLE).insert(input as any);
  if (error) throw new Error(error.message);
}

export async function updateZaloBaitGroup(id: string, input: ZaloBaitGroupInput): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_GROUP_TABLE).update(input as any).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteZaloBaitGroup(id: string): Promise<void> {
  const { error } = await sb4Admin().from(ZALO_GROUP_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
