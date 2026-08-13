/**
 * post-view-queue — gom lượt xem bài viết và ghi DB theo lô.
 *
 * Trước: mỗi bài hiện trong viewport = 1 upsert ngay lập tức.
 * Sau:   gom trong 45 giây rồi ghi 1 lần (bulk upsert), flush khi ẩn tab.
 *
 * Dedup phía server vẫn dựa vào UNIQUE(post_id, user_id).
 */
import { supabase } from "@/lib/supabase";

const FLUSH_MS = 45_000;

const pending = new Map<string, string>(); // postId -> userId
const seen = new Set<string>();            // đã ghi trong phiên này
let timer: ReturnType<typeof setTimeout> | null = null;
let wired = false;

async function flush() {
  timer = null;
  if (!pending.size) return;
  const rows = [...pending.entries()].map(([post_id, user_id]) => ({ post_id, user_id }));
  pending.clear();
  try {
    await supabase
      .from("post_views" as any)
      .upsert(rows as any, { onConflict: "post_id,user_id", ignoreDuplicates: true });
  } catch {
    /* bỏ qua — view không phải dữ liệu tới hạn */
  }
}

function wire() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
  window.addEventListener("pagehide", () => { void flush(); });
}

/** Xếp hàng 1 lượt xem. Trả về false nếu đã tính trước đó. */
export function queuePostView(postId: string, userId: string): boolean {
  const key = `${postId}:${userId}`;
  if (seen.has(key)) return false;
  seen.add(key);
  wire();
  pending.set(postId, userId);
  if (!timer) timer = setTimeout(() => { void flush(); }, FLUSH_MS);
  return true;
}

export function flushPostViews() { return flush(); }
