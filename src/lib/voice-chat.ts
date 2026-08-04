/**
 * Voice Chat V1 — helpers dùng chung (React + Supabase, không server riêng).
 *
 * Tin nhắn voice được gửi dưới dạng marker trong `content`:
 *   [voice:<storage_path>|<duration_seconds>]
 * nhờ vậy mọi đường gửi tin hiện có (user thật, nick ảo, admin rep hộ seed)
 * đều hoạt động mà không phải sửa lại logic insert.
 */
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/media";

export const VOICE_BUCKET = "voice-messages";
export const VOICE_MAX_SECONDS = 60;

const VOICE_RE = /^\s*\[voice:([^|\]]+)\|(\d+)\]\s*$/;

export interface VoicePayload {
  path: string;
  duration: number;
}

export function voiceToken(path: string, duration: number): string {
  return `[voice:${path}|${Math.max(0, Math.round(duration))}]`;
}

export function parseVoiceMarker(content?: string | null): VoicePayload | null {
  if (!content) return null;
  const m = VOICE_RE.exec(content);
  if (!m) return null;
  return { path: m[1], duration: Number(m[2]) || 0 };
}

/** Ký URL tạm (mặc định 10 phút) + cache trong bộ nhớ để tránh gọi lặp. */
const signedCache = new Map<string, { url: string; expires: number }>();

export async function getVoiceSignedUrl(path: string, seconds = 600): Promise<string | null> {
  // Audio mới nằm ở Supabase Media #2 (public URL) — dùng thẳng, không cần ký.
  if (/^https?:\/\//i.test(path)) return path;
  const cached = signedCache.get(path);
  if (cached && cached.expires > Date.now() + 15_000) return cached.url;
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + seconds * 1000 });
  return data.signedUrl;
}

export function formatVoiceDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Upload 1 blob ghi âm vào bucket private, trả về storage path. */
export async function uploadVoiceBlob(
  userId: string,
  blob: Blob,
  ext = "webm",
): Promise<string> {
  const filename = `${userId}-${Date.now()}.${ext}`;
  const file = new File([blob], filename, { type: blob.type || "audio/webm" });
  const media = await uploadMedia(file, { kind: "other", compress: false });
  return media.secureUrl;
}

// ---------------------------------------------------------------- library

export interface VoiceLibraryItem {
  id: string;
  title: string;
  storage_path: string;
  duration: number;
  category: string | null;
  created_at: string;
}

export async function listVoiceLibrary(): Promise<VoiceLibraryItem[]> {
  const { data, error } = await supabase
    .from("voice_library" as any)
    .select("id,title,storage_path,duration,category,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) ?? [];
}

export async function uploadVoiceLibraryItem(
  adminId: string,
  file: File,
  title: string,
  duration: number,
  category?: string,
): Promise<VoiceLibraryItem> {
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
  const uploaded = await uploadMedia(
    new File([file], `${adminId}-${Date.now()}.${ext}`, { type: file.type || "audio/mpeg" }),
    { kind: "other", compress: false },
  );
  const path = uploaded.secureUrl;

  const { data, error } = await supabase
    .from("voice_library" as any)
    .insert({
      title: title.trim() || file.name,
      storage_path: path,
      duration: Math.max(0, Math.round(duration)),
      mime_type: file.type || null,
      category: category?.trim() || null,
      created_by: adminId,
    })
    .select("id,title,storage_path,duration,category,created_at")
    .single();
  if (error) throw error;
  return data as any;
}

export async function renameVoiceLibraryItem(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("voice_library" as any)
    .update({ title: title.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteVoiceLibraryItem(item: VoiceLibraryItem): Promise<void> {
  if (!/^https?:\/\//i.test(item.storage_path)) {
    await supabase.storage.from(VOICE_BUCKET).remove([item.storage_path]);
  }
  const { error } = await supabase.from("voice_library" as any).delete().eq("id", item.id);
  if (error) throw error;
}

/** Đọc thời lượng (giây) của một file audio phía client. */
export function readAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      const done = (v: number) => { URL.revokeObjectURL(url); resolve(v); };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        done(Number.isFinite(d) ? d : 0);
      };
      audio.onerror = () => done(0);
      audio.src = url;
    } catch { resolve(0); }
  });
}

/** VIP hoặc Admin mới được gửi voice. */
export function canSendVoice(profile: any): boolean {
  if (!profile) return false;
  if (profile.is_admin === true) return true;
  if (profile.is_vip === true) return true;
  return Number(profile.vip_level ?? 0) > 0;
}
// ------------------------------------------------------------- inline token

/** Token voice có thể nằm lẫn trong nội dung bài viết / bình luận. */
export const VOICE_TOKEN_GLOBAL = /\[voice:([^|\]]+)\|(\d+)\]/g;

export function hasVoiceToken(text?: string | null): boolean {
  if (!text) return false;
  VOICE_TOKEN_GLOBAL.lastIndex = 0;
  return VOICE_TOKEN_GLOBAL.test(text);
}

export function stripVoiceTokens(text?: string | null): string {
  return (text ?? "").replace(/\[voice:[^|\]]+\|\d+\]/g, "").trim();
}

/** Nội dung popup khoá VIP theo khu vực của người dùng. */
export function voiceVipLockMessage(profile: any): string {
  const area =
    profile?.province || profile?.city || profile?.region || profile?.location || "";
  return (
    `Tính năng Voice Chat chỉ dành cho thành viên VIP Zalo${area ? ` khu vực ${area}` : " khu vực bạn đăng ký"}.` +
    "\n\nVui lòng liên hệ Admin thông qua Trung tâm trợ giúp hoặc Tin nhắn hệ thống để được hướng dẫn tham gia nhóm VIP."
  );
}
