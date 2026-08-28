/**
 * Cache dùng chung cho danh sách "Tài khoản thứ hai" (clone).
 *
 * Trước đây mỗi tab (Danh sách / Đăng bài / Tặng quà) tự gọi RPC
 * `admin_list_internal_accounts` với p_limit lớn, và trang Danh sách còn gọi
 * 2 lần mỗi khi đổi trang → egress tăng theo số lần bấm.
 *
 * Ở đây: 1 request duy nhất cho mỗi bộ lọc (search + gender), cache theo TTL
 * và gộp các lời gọi song song (inflight dedupe).
 */
import { supabase } from "@/lib/db/router";
import { fetchAdminUserIds, withoutAdmins } from "./exclude-admins";

const sb = supabase as any;

export type CloneListRow = Record<string, any> & { id: string; username: string };

const TTL = 60_000;
const cache = new Map<string, { rows: CloneListRow[]; at: number }>();
const inflight = new Map<string, Promise<CloneListRow[]>>();

export interface CloneListOptions {
  search?: string | null;
  gender?: "" | "male" | "female" | null;
  limit?: number;
  force?: boolean;
}

export async function fetchCloneList(opts: CloneListOptions = {}): Promise<CloneListRow[]> {
  const search = (opts.search ?? "").trim() || null;
  const gender = opts.gender || null;
  const limit = opts.limit ?? 10000;
  const key = `${search ?? ""}|${gender ?? ""}|${limit}`;

  if (!opts.force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.rows;
    const run = inflight.get(key);
    if (run) return run;
  }

  const task = (async () => {
    const { data, error } = await sb.rpc("admin_list_internal_accounts", {
      p_search: search,
      p_limit: limit,
      p_offset: 0,
      p_gender: gender,
    });
    if (error) throw error;
    const adminIds = await fetchAdminUserIds();
    const rows = withoutAdmins((data ?? []) as CloneListRow[], adminIds);
    cache.set(key, { rows, at: Date.now() });
    return rows;
  })().finally(() => { inflight.delete(key); });

  inflight.set(key, task);
  return task;
}

/** Gọi sau khi tạo / sửa / khoá / xoá tài khoản. */
export function invalidateCloneList(): void {
  cache.clear();
  inflight.clear();
}
