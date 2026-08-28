/**
 * column-guard — chống lỗi "column ... does not exist" (PostgREST 42703).
 *
 * Khi một DB chưa có đủ cột mà code đang select (ví dụ `identity_crown`,
 * `candy`), PostgREST trả 400 và TOÀN BỘ query thất bại → trang cá nhân trắng,
 * feed mất tên tác giả. Helper này probe 1 lần / (bảng + bộ cột), tự loại các
 * cột không tồn tại rồi cache lại kết quả.
 */

const cache = new Map<string, Promise<string>>();

/** Lấy tên cột bị thiếu từ message lỗi Postgres/PostgREST. */
export function missingColumnFromError(error: unknown): string | null {
  const msg =
    typeof error === "string"
      ? error
      : ((error as any)?.message as string | undefined) ?? "";
  if (!msg) return null;
  // "column profiles.candy does not exist" | 'column "candy" does not exist'
  const m =
    msg.match(/column\s+(?:[a-zA-Z0-9_]+\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i) ||
    msg.match(/could not find the '?([a-zA-Z0-9_]+)'? column/i);
  return m ? m[1] : null;
}

const splitCols = (cols: string) =>
  cols.split(",").map((c) => c.trim()).filter(Boolean);

/**
 * Trả về bộ cột thực sự tồn tại trên bảng (giữ nguyên thứ tự).
 * Kết quả được cache theo `table|cols` nên chỉ probe 1 lần mỗi phiên.
 */
export function resolveAvailableCols(
  client: any,
  table: string,
  cols: string,
): Promise<string> {
  const key = `${table}|${cols}`;
  let running = cache.get(key);
  if (running) return running;

  running = (async () => {
    let list = splitCols(cols);
    for (let i = 0; i < 24 && list.length > 1; i++) {
      try {
        const { error } = await client.from(table).select(list.join(", ")).limit(1);
        if (!error) return list.join(", ");
        const missing = missingColumnFromError(error);
        if (!missing) return list.join(", ");
        const next = list.filter((c) => c !== missing && !c.startsWith(`${missing}:`));
        if (next.length === list.length) return list.join(", ");
        list = next;
      } catch {
        return list.join(", ");
      }
    }
    return list.join(", ");
  })();

  cache.set(key, running);
  return running;
}

/** Xoá cache probe (dùng sau khi chạy migration thêm cột). */
export function resetColumnGuardCache() {
  cache.clear();
}
