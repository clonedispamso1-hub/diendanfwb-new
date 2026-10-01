/* ============================================================
   MOCK DATA (UI-first — sẽ thay bằng Supabase queries sau)
   ============================================================ */

export type ReportPostRow = {
  id: string;
  reporter: { uid: string; username: string };
  target: { uid: string; username: string };
  postId: string;
  postSnippet: string;
  reason: string;
  createdAt: string;
  status: "pending" | "processed";
};

export type ReportMessageRow = {
  id: string;
  reporter: { uid: string; username: string };
  target: { uid: string; username: string };
  conversationId: string;
  messageSnippet: string;
  reason: string;
  createdAt: string;
  status: "pending" | "processed";
};

/* -------- Báo cáo bài viết -------- */
export const MOCK_REPORTS_POST: ReportPostRow[] = [
  {
    id: "RP001",
    reporter: { uid: "U1029", username: "candy_lover" },
    target: { uid: "U1177", username: "spammer99" },
    postId: "P8850",
    postSnippet: "Kiếm tiền online 100tr/tháng inbox ngay...",
    reason: "Spam / quảng cáo trái phép",
    createdAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    status: "pending",
  },
  {
    id: "RP002",
    reporter: { uid: "U2451", username: "sunny.day" },
    target: { uid: "U9902", username: "toxic_guy" },
    postId: "P8877",
    postSnippet: "Nội dung có ngôn từ xúc phạm...",
    reason: "Quấy rối / Ngôn từ thù ghét",
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    status: "pending",
  },
  {
    id: "RP003",
    reporter: { uid: "U3311", username: "mai.tran" },
    target: { uid: "U7788", username: "scammer_x" },
    postId: "P8801",
    postSnippet: "Nhấp link nhận thưởng iPhone 15...",
    reason: "Lừa đảo",
    createdAt: new Date(Date.now() - 1 * 86400_000).toISOString(),
    status: "processed",
  },
];

/* -------- Báo cáo tin nhắn -------- */
export const MOCK_REPORTS_MSG: ReportMessageRow[] = [
  {
    id: "RM001",
    reporter: { uid: "U1029", username: "candy_lover" },
    target: { uid: "U7788", username: "scammer_x" },
    conversationId: "C9981",
    messageSnippet: "Chuyển khoản trước rồi anh gửi hàng...",
    reason: "Lừa đảo qua tin nhắn",
    createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    status: "pending",
  },
  {
    id: "RM002",
    reporter: { uid: "U3311", username: "mai.tran" },
    target: { uid: "U9902", username: "toxic_guy" },
    conversationId: "C9972",
    messageSnippet: "Lời lẽ xúc phạm cá nhân...",
    reason: "Quấy rối",
    createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    status: "processed",
  },
];
