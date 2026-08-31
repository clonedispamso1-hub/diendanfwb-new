/**
 * Cache dùng chung cho danh sách Thư mục + Nhóm mồi (bait groups).
 *
 * - Lưu ở sessionStorage với TTL ~10 phút để 4 nơi đang fetch (Newsfeed card,
 *   danh sách nhóm, admin manager, internal tools) không gọi lặp lại liên tục.
 * - Chỉ select đúng các cột cần dùng thay cho select("*").
 */
import { sb4, type BaitGroup, type BaitGroupFolder } from "@/lib/supabase-v4";

export const BAIT_GROUP_COLUMNS =
  "id, folder_id, name, province, avatar_url, member_count, message_count, preview_text, info_text, sort_order";
/** Fallback khi DB chưa có cột info_text. */
export const BAIT_GROUP_COLUMNS_LEGACY =
  "id, folder_id, name, province, avatar_url, member_count, message_count, preview_text, sort_order";
export const BAIT_FOLDER_COLUMNS = "id, name, by_location, name_template, sort_order, created_at";

const TTL_MS = 10 * 60_000;
const KEY = "bait-groups-cache:v1";

export interface BaitGroupsData {
  folders: BaitGroupFolder[];
  groups: BaitGroup[];
}

interface Entry extends BaitGroupsData {
  ts: number;
}

function readCache(): BaitGroupsData | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    if (!entry?.ts || Date.now() - entry.ts > TTL_MS) return null;
    return { folders: entry.folders || [], groups: entry.groups || [] };
  } catch {
    return null;
  }
}

function writeCache(data: BaitGroupsData) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...data, ts: Date.now() } satisfies Entry));
  } catch {
    /* quota đầy — bỏ qua, chỉ mất cache */
  }
}

/** Xoá cache (gọi sau khi admin thêm/sửa/xoá nhóm mồi). */
export function invalidateBaitGroupsCache() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

let inflight: Promise<BaitGroupsData> | null = null;

/**
 * Lấy thư mục + nhóm mồi. Mặc định dùng cache còn hạn; `force` để tải lại.
 * `client` cho phép truyền client admin (sb4Admin) khi cần quyền cao hơn.
 */
export async function fetchBaitGroups(options?: {
  force?: boolean;
  client?: ReturnType<typeof sb4>;
}): Promise<BaitGroupsData> {
  const force = options?.force === true;
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
    if (inflight) return inflight;
  }

  const sb = options?.client ?? sb4();
  const run = (async (): Promise<BaitGroupsData> => {
    const [f, g] = await Promise.all([
      sb.from("bait_group_folders").select(BAIT_FOLDER_COLUMNS).order("sort_order").order("created_at"),
      sb.from("bait_groups").select(BAIT_GROUP_COLUMNS).order("sort_order"),
    ]);
    // DB chưa thêm cột info_text → thử lại với danh sách cột cũ.
    if (g.error) {
      const retry = await sb.from("bait_groups").select(BAIT_GROUP_COLUMNS_LEGACY).order("sort_order");
      if (!retry.error) {
        g.data = retry.data as any;
        g.error = null as any;
      }
    }
    if (f.error || g.error) throw new Error((f.error || g.error)?.message || "Lỗi tải dữ liệu");
    const data: BaitGroupsData = {
      folders: (f.data as unknown as BaitGroupFolder[]) || [],
      groups: (g.data as unknown as BaitGroup[]) || [],
    };
    writeCache(data);
    return data;
  })();

  inflight = run.finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Lấy 1 nhóm mồi theo id — ưu tiên cache, fallback query 1 dòng. */
export async function fetchBaitGroupById(groupId: string): Promise<BaitGroup | null> {
  const cached = readCache();
  const hit = cached?.groups.find((g) => g.id === groupId);
  if (hit) return hit;
  const res = await sb4()
    .from("bait_groups")
    .select(BAIT_GROUP_COLUMNS)
    .eq("id", groupId)
    .maybeSingle();
  if (res.error) {
    const retry = await sb4()
      .from("bait_groups")
      .select(BAIT_GROUP_COLUMNS_LEGACY)
      .eq("id", groupId)
      .maybeSingle();
    return (retry.data as unknown as BaitGroup) || null;
  }
  return (res.data as unknown as BaitGroup) || null;
}
