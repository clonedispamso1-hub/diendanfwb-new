/**
 * Lưu tạm số liệu fake (👁 ❤️ 💬) của từng phòng Live để khi người dùng
 * rời trang rồi quay lại, số liệu tiếp tục từ giá trị cuối — không reset về 0.
 *
 * Chỉ dùng sessionStorage + Map trong bộ nhớ. Không API, không polling, không realtime.
 */
export type LiveStats = { viewers: number; likes: number; comments: number };

const KEY = "livemoc.stats.v1";

let mem: Record<string, LiveStats> | null = null;

function load(): Record<string, LiveStats> {
  if (mem) return mem;
  mem = {};
  if (typeof window === "undefined") return mem;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
        const o = v as Partial<LiveStats>;
        if (
          typeof o?.viewers === "number" &&
          typeof o?.likes === "number" &&
          typeof o?.comments === "number"
        ) {
          mem[id] = { viewers: o.viewers, likes: o.likes, comments: o.comments };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return mem;
}

export function getLiveStats(id: string): LiveStats | null {
  return load()[id] ?? null;
}

/** Ghi lại toàn bộ số liệu hiện tại (gọi khi tick / khi rời trang). */
export function saveLiveStats(all: Record<string, LiveStats>): void {
  const store = load();
  Object.assign(store, all);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}
