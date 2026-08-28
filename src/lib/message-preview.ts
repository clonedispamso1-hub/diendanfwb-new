/**
 * getMessagePreview — helper DÙNG CHUNG cho mọi nơi hiển thị nội dung rút gọn
 * của một tin nhắn (Chat List, Notification, Search, Admin Panel, Clone Panel,
 * Recent Chats, Mobile…).
 *
 * Nguyên tắc: KHÔNG BAO GIỜ để lộ marker nội bộ, storage path, bucket, UUID,
 * tên file hay signed URL ra giao diện.
 */
import { parseVoiceMarker, hasVoiceToken, stripVoiceTokens } from "@/lib/voice-chat";
import { ACCEPT_TOKEN, ACCEPT_PREVIEW_TEXT } from "@/lib/message-requests";

const GIF_RE = /\[\[gif:[^\]\s]+\]\]/g;
const URL_RE = /https?:\/\/\S+/gi;

export function isVoiceMessage(content?: string | null): boolean {
  return !!parseVoiceMarker(content) || hasVoiceToken(content);
}

export interface MessagePreviewInput {
  content?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  message_type?: string | null;
  is_recalled?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * @param msg      bản ghi tin nhắn (hoặc chuỗi content)
 * @param isSelf   người gửi có phải là mình không (để đổi ngôi xưng)
 */
export function getMessagePreview(
  msg: MessagePreviewInput | string | null | undefined,
  isSelf = false,
): string {
  if (!msg) return "Tin nhắn mới";
  const m: MessagePreviewInput = typeof msg === "string" ? { content: msg } : msg;

  if (m.is_recalled) {
    return isSelf ? "Bạn đã thu hồi một tin nhắn" : "Đối phương đã thu hồi một tin nhắn";
  }

  const raw = (m.content ?? "").trim();

  // Tin hệ thống "chấp nhận trò chuyện" — không bao giờ lộ mã [[sys:accept]]
  if (raw.includes(ACCEPT_TOKEN)) return ACCEPT_PREVIEW_TEXT;

  // Voice — tuyệt đối không lộ path/URL
  if (isVoiceMessage(raw)) {
    return isSelf ? "🎙️ Tin nhắn thoại" : "🎙️ Đã gửi tin nhắn thoại";
  }


  if (m.message_type === "location" || (m.latitude != null && m.longitude != null)) {
    return "📍 Vị trí";
  }

  if (GIF_RE.test(raw)) {
    GIF_RE.lastIndex = 0;
    const stripped = raw.replace(GIF_RE, "").trim();
    return stripped || "🖼️ Nhãn dán";
  }
  GIF_RE.lastIndex = 0;

  if (raw) {
    const clean = stripVoiceTokens(raw).replace(URL_RE, "").replace(/\s+/g, " ").trim();
    if (clean) return clean;
  }

  if (m.video_url) return "🎬 Video";
  if (m.image_url) return "🖼️ Ảnh";
  return "Tin nhắn mới";
}

/** Câu thông báo cho tin nhắn thoại (dùng ở Notification). */
export const VOICE_NOTIF_TEXT = "🎙️ Đã gửi cho bạn một tin nhắn thoại";
