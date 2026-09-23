/**
 * 🎬 KHO METADATA VIDEO — Supabase #2 (media).
 *
 * File video KHÔNG lưu trong Supabase: vẫn nằm trên Cloudflare R2 (không đổi).
 * Bảng `video_posts` trên Supabase #2 chỉ giữ metadata: URL R2, người đăng
 * (uid, tên, avatar), nội dung, UID bài viết dạng ABC-123, thời gian.
 *
 * SQL cài đặt: supabase-sql/SB2/2026-09-12_video_posts.sql
 */
import { db2 } from "@/lib/db/router";
import { supabase } from "@/lib/supabase";
import { supabase as coreClient } from "@/lib/db/router";
import { fetchProfilesByIds, PROFILE_UI_COLS } from "@/lib/profile-cache";

export const VIDEO_TABLE = "video_posts";

const VIDEO_URL_RE = /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?.*)?$/i;

export function isVideoUrl(url: unknown): url is string {
  return typeof url === "string" && (VIDEO_URL_RE.test(url) || /\/video\/upload\//i.test(url));
}

export interface VideoPostRow {
  id: string;
  post_uid: string;
  source_table: string;
  source_id: string;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
  content: string | null;
  video_url: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* UID bài viết: ABC-123                                               */
/* ------------------------------------------------------------------ */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generatePostUid(): string {
  let letters = "";
  for (let i = 0; i < 3; i++) letters += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${letters}-${digits}`;
}

const isUniqueViolation = (error: any) =>
  error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message || "");

/* ------------------------------------------------------------------ */
/* Ghi metadata                                                        */
/* ------------------------------------------------------------------ */

export interface RegisterVideoInput {
  sourceTable?: string;
  sourceId: string;
  userId: string;
  content?: string | null;
  videoUrl: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  createdAt?: string | null;
}

/** Ghi metadata 1 video vào Supabase #2. Không bao giờ ném lỗi ra ngoài. */
export async function registerVideoMetadata(input: RegisterVideoInput): Promise<boolean> {
  if (!isVideoUrl(input.videoUrl) || !input.sourceId || !input.userId) return false;
  try {
    let author = { name: input.authorName ?? null, avatar: input.authorAvatar ?? null };
    if (!author.name) {
      const map = await fetchProfilesByIds([input.userId], PROFILE_UI_COLS, coreClient as any);
      const p: any = map.get(input.userId);
      if (p) {
        author = {
          name: p.display_name || p.full_name || p.username || null,
          avatar: p.avatar || null,
        };
      }
    }
    const base: Record<string, any> = {
      source_table: input.sourceTable || "posts",
      source_id: String(input.sourceId),
      user_id: input.userId,
      author_name: author.name,
      author_avatar: author.avatar,
      content: input.content ?? null,
      video_url: input.videoUrl,
    };
    if (input.createdAt) base.created_at = input.createdAt;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await db2()
        .from(VIDEO_TABLE)
        .insert([{ ...base, post_uid: generatePostUid() }]);
      if (!error) return true;
      if (!isUniqueViolation(error)) {
        console.warn("[admin-videos] insert error:", error.message);
        return false;
      }
      // Trùng (source_table, source_id) → đã ghi rồi, coi như xong.
      if (/source/i.test(error.message || "")) return true;
      // Trùng post_uid → sinh UID khác và thử lại.
    }
  } catch (e) {
    console.warn("[admin-videos] register failed:", e);
  }
  return false;
}

/** Quét bài viết có video và ghi metadata còn thiếu. Trả về số bản ghi mới. */
export async function syncVideoMetadata(limit = 300): Promise<number> {
  const existing = new Set<string>();
  const { data: rows } = await db2().from(VIDEO_TABLE).select("source_table, source_id").limit(5000);
  for (const r of (rows as any[]) || []) existing.add(`${r.source_table}:${r.source_id}`);

  type Candidate = RegisterVideoInput;
  const candidates: Candidate[] = [];

  const { data: posts } = await supabase
    .from("posts")
    .select("id, user_id, content, image_url, image_urls, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const p of ((posts as any[]) || [])) {
    const urls: string[] = [
      ...(Array.isArray(p.image_urls) ? p.image_urls : []),
      ...(p.image_url ? [p.image_url] : []),
    ];
    const video = urls.find(isVideoUrl);
    if (!video) continue;
    if (existing.has(`posts:${p.id}`)) continue;
    candidates.push({
      sourceTable: "posts",
      sourceId: String(p.id),
      userId: p.user_id,
      content: p.content ?? null,
      videoUrl: video,
      createdAt: p.created_at ?? null,
    });
  }

  const { data: legacy } = await supabase
    .from("videos_social" as any)
    .select("id, user_id, video_url, caption, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const v of ((legacy as any[]) || [])) {
    if (!isVideoUrl(v.video_url)) continue;
    if (existing.has(`videos_social:${v.id}`)) continue;
    candidates.push({
      sourceTable: "videos_social",
      sourceId: String(v.id),
      userId: v.user_id,
      content: v.caption ?? null,
      videoUrl: v.video_url,
      createdAt: v.created_at ?? null,
    });
  }

  if (candidates.length === 0) return 0;

  // Gộp 1 request lấy hồ sơ cho tất cả tác giả.
  const ids = [...new Set(candidates.map((c) => c.userId).filter(Boolean))];
  const pmap = await fetchProfilesByIds(ids, PROFILE_UI_COLS, coreClient as any);

  let inserted = 0;
  for (const c of candidates) {
    const p: any = pmap.get(c.userId);
    const ok = await registerVideoMetadata({
      ...c,
      authorName: p ? p.display_name || p.full_name || p.username || null : null,
      authorAvatar: p?.avatar ?? null,
    });
    if (ok) inserted++;
  }
  return inserted;
}

/* ------------------------------------------------------------------ */
/* Đọc                                                                 */
/* ------------------------------------------------------------------ */

export async function listVideoPosts(limit = 200): Promise<VideoPostRow[]> {
  const { data, error } = await db2()
    .from(VIDEO_TABLE)
    .select("id, post_uid, source_table, source_id, user_id, author_name, author_avatar, content, video_url, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data as any[]) || []) as VideoPostRow[];
}

/* ------------------------------------------------------------------ */
/* Xoá                                                                 */
/* ------------------------------------------------------------------ */

/** Xoá file trên Cloudflare R2 (bỏ qua lỗi — metadata vẫn được xoá). */
export async function deleteR2Object(url: string): Promise<void> {
  try {
    const { data } = await coreClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/public/r2-delete", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    /* noop */
  }
}

/** Xoá bài gốc (feed) tương ứng để video biến mất khỏi website. */
async function deleteSourceRow(row: VideoPostRow): Promise<void> {
  try {
    if (row.source_table === "videos_social") {
      await supabase.from("videos_social" as any).delete().eq("id", row.source_id);
    } else {
      await supabase.from("posts").delete().eq("id", row.source_id);
    }
  } catch {
    /* noop */
  }
}

export async function deleteVideoPost(row: VideoPostRow): Promise<void> {
  await deleteSourceRow(row);
  await deleteR2Object(row.video_url);
  const { error } = await db2().from(VIDEO_TABLE).delete().eq("id", row.id);
  if (error) throw new Error(error.message);
}

export async function deleteAllVideoPosts(): Promise<number> {
  const rows = await listVideoPosts(1000);
  for (const row of rows) {
    await deleteSourceRow(row);
    await deleteR2Object(row.video_url);
  }
  const { error } = await db2().from(VIDEO_TABLE).delete().not("id", "is", null);
  if (error) throw new Error(error.message);
  return rows.length;
}
