/**
 * Feedback Zalo — lưu trong bảng có sẵn `admin_site_settings` (key `feedback_zalo_posts`).
 * Đọc công khai qua site-settings-cache; ghi CHỈ qua RPC admin (adminSetSiteSetting).
 * Không cần bảng/schema/RLS mới.
 */
import { adminSetSiteSetting } from "@/lib/admin-db";
import { getSiteSetting, invalidateSiteSettings } from "@/lib/site-settings-cache";

export const FEEDBACK_ZALO_KEY = "feedback_zalo_posts";

export type FeedbackMediaType = "image" | "video" | "link";

export interface FeedbackZaloPost {
  id: string;
  author_name: string;
  avatar_url: string;
  title: string;
  cover_url: string;
  content_url: string;
  content_type: FeedbackMediaType;
  description: string;
  created_at: string;
}

export type FeedbackZaloDraft = Omit<FeedbackZaloPost, "id" | "created_at">;

const TYPES: FeedbackMediaType[] = ["image", "video", "link"];

/** Chỉ chấp nhận http(s) tuyệt đối. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function sanitize(raw: unknown): FeedbackZaloPost | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const title = str(r.title, 200);
  const author = str(r.author_name, 80);
  const content = safeHttpUrl(r.content_url);
  if (!id || !title || !author || !content) return null;
  const type = TYPES.includes(r.content_type as FeedbackMediaType) ? (r.content_type as FeedbackMediaType) : "link";
  return {
    id,
    title,
    author_name: author,
    avatar_url: safeHttpUrl(r.avatar_url) ?? "",
    cover_url: safeHttpUrl(r.cover_url) ?? "",
    content_url: content,
    content_type: type,
    description: str(r.description, 2000),
    created_at: str(r.created_at, 40),
  };
}

function parseList(value: unknown): FeedbackZaloPost[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  return items.map(sanitize).filter((p): p is FeedbackZaloPost => p !== null);
}

export async function fetchFeedbackZalo(force = false): Promise<FeedbackZaloPost[]> {
  if (force) invalidateSiteSettings(FEEDBACK_ZALO_KEY);
  return parseList(await getSiteSetting(FEEDBACK_ZALO_KEY));
}

export type DraftErrors = Partial<Record<keyof FeedbackZaloDraft, string>>;

export function validateDraft(d: FeedbackZaloDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.author_name.trim()) e.author_name = "Bắt buộc nhập tên người đăng.";
  if (!d.title.trim()) e.title = "Bắt buộc nhập tiêu đề.";
  if (!safeHttpUrl(d.avatar_url)) e.avatar_url = "URL avatar phải là http(s) hợp lệ.";
  if (!safeHttpUrl(d.cover_url)) e.cover_url = "URL ảnh bìa phải là http(s) hợp lệ.";
  if (!safeHttpUrl(d.content_url)) e.content_url = "URL nội dung phải là http(s) hợp lệ.";
  if (!TYPES.includes(d.content_type)) e.content_type = "Chọn loại nội dung.";
  return e;
}

async function writeList(list: FeedbackZaloPost[]): Promise<void> {
  await adminSetSiteSetting(FEEDBACK_ZALO_KEY, { items: list });
  invalidateSiteSettings(FEEDBACK_ZALO_KEY);
}

export async function upsertFeedbackZalo(draft: FeedbackZaloDraft, id?: string): Promise<FeedbackZaloPost[]> {
  const errors = validateDraft(draft);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const list = await fetchFeedbackZalo(true);
  const clean: FeedbackZaloDraft = {
    author_name: draft.author_name.trim(),
    title: draft.title.trim(),
    avatar_url: safeHttpUrl(draft.avatar_url)!,
    cover_url: safeHttpUrl(draft.cover_url)!,
    content_url: safeHttpUrl(draft.content_url)!,
    content_type: draft.content_type,
    description: draft.description.trim(),
  };
  const next = id
    ? list.map((p) => (p.id === id ? { ...p, ...clean } : p))
    : [{ ...clean, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...list];
  if (id && !list.some((p) => p.id === id)) throw new Error("Không tìm thấy feedback để sửa.");
  await writeList(next);
  return next;
}

export async function deleteFeedbackZalo(id: string): Promise<FeedbackZaloPost[]> {
  const list = await fetchFeedbackZalo(true);
  const next = list.filter((p) => p.id !== id);
  await writeList(next);
  return next;
}
