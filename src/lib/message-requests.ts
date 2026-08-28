/**
 * TIN NHẮN ĐANG CHỜ (Message Request) — chuẩn Threads/Instagram.
 *
 * Không cần đổi schema: trạng thái được suy ra từ chính bảng `messages`.
 *  - Chưa chấp nhận: chỉ MỘT phía đã gửi, và chưa có tin hệ thống chấp nhận.
 *  - Người gửi đầu tiên chỉ được gửi tối đa 2 tin khi chưa được chấp nhận.
 *  - Người nhận bấm "Chấp nhận trò chuyện" (chèn tin hệ thống) HOẶC trả lời
 *    bất kỳ tin nào → cuộc trò chuyện thành accepted, gỡ giới hạn 2 bên.
 */

export const PENDING_LIMIT = 2;
export const ACCEPT_TOKEN = "[[sys:accept]]";

export type ChatMsgLite = {
  sender_id: string;
  receiver_id?: string;
  content?: string | null;
};

/** Nội dung tin hệ thống khi chấp nhận trò chuyện. */
export function acceptSystemContent(receiverName: string): string {
  const name = (receiverName || "Người dùng").trim();
  return `${ACCEPT_TOKEN}${name}`;
}

export function isAcceptSystemMessage(content: string | null | undefined): boolean {
  return typeof content === "string" && content.startsWith(ACCEPT_TOKEN);
}

/** Dòng thông báo hiển thị giữa màn hình chat (đúng 1 câu). */
export function acceptSystemText(content: string | null | undefined): string {
  const name = String(content ?? "").slice(ACCEPT_TOKEN.length).trim() || "Người dùng";
  return `${name} đã chấp nhận cuộc trò chuyện`;
}

/** Nội dung xem trước ở danh sách chat (không lộ mã hệ thống). */
export const ACCEPT_PREVIEW_TEXT = "Đã chấp nhận cuộc trò chuyện";

export type RequestState = {
  /** Cuộc trò chuyện đã được chấp nhận (không còn giới hạn). */
  accepted: boolean;
  /** Số tin mình đã gửi khi còn đang chờ. */
  mySentCount: number;
  /** Số tin còn được gửi (khi chưa chấp nhận). */
  remaining: number;
  /** Khoá ô nhập: đã gửi đủ 2 tin mà chưa được chấp nhận. */
  locked: boolean;
  /** Hiện thanh "Chấp nhận trò chuyện" (mình là người nhận tin chờ). */
  showAccept: boolean;
  /** Ghi chú "Còn 1 tin nhắn…". */
  note: string | null;
};

/** Tính trạng thái tin nhắn đang chờ của một hội thoại 1-1. */
export function computeRequestState(
  messages: ChatMsgLite[],
  meId: string | null | undefined,
  peerId: string | null | undefined,
): RequestState {
  const idle: RequestState = {
    accepted: true, mySentCount: 0, remaining: PENDING_LIMIT,
    locked: false, showAccept: false, note: null,
  };
  if (!meId || !peerId) return idle;

  const rows = messages.filter(
    (m) => m && (m.sender_id === meId || m.sender_id === peerId),
  );
  const hasAcceptSystem = rows.some((m) => isAcceptSystemMessage(m.content));
  const mine = rows.filter((m) => m.sender_id === meId);
  const theirs = rows.filter((m) => m.sender_id === peerId);

  // Đã chấp nhận khi: có tin hệ thống, hoặc cả 2 phía đều đã gửi tin.
  const accepted = hasAcceptSystem || (mine.length > 0 && theirs.length > 0);
  if (accepted) return { ...idle, mySentCount: mine.length };

  const mySentCount = mine.length;
  const remaining = Math.max(0, PENDING_LIMIT - mySentCount);
  const showAccept = mySentCount === 0 && theirs.length > 0;
  const locked = mySentCount >= PENDING_LIMIT;
  const note = !showAccept && mySentCount > 0 && !locked
    ? `Còn ${remaining} tin nhắn. Khi họ chưa chấp nhận tin nhắn đang chờ của bạn, bạn chỉ được gửi tối đa ${PENDING_LIMIT} tin nhắn.`
    : null;

  return { accepted: false, mySentCount, remaining, locked, showAccept, note };
}

export const PENDING_LOCKED_TEXT =
  "Đã gửi tin nhắn đang chờ. Bạn có thể gửi thêm sau khi họ chấp nhận tin nhắn đang chờ của bạn.";
