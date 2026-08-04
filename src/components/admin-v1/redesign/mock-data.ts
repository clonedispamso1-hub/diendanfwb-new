/* ============================================================
   MOCK DATA (UI-first — sẽ thay bằng Supabase queries sau)
   ============================================================ */

export type CommentStatus = "normal" | "locked" | "reported";

export type CommentRow = {
  id: string;
  user: { uid: string; username: string; avatar?: string | null };
  postId: string;
  postTitle: string;
  content: string;
  createdAt: string;
  likes: number;
  status: CommentStatus;
};

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

/* -------- Bình luận -------- */
export const MOCK_COMMENTS: CommentRow[] = [
  {
    id: "CMT001",
    user: { uid: "U1029", username: "candy_lover" },
    postId: "P8891",
    postTitle: "Ngày cuối tuần chill với bánh 🍭",
    content: "Nhìn ngon quá luôn 😍",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    likes: 12,
    status: "normal",
  },
  {
    id: "CMT002",
    user: { uid: "U2451", username: "sunny.day" },
    postId: "P8890",
    postTitle: "Săn deal hôm nay",
    content: "Link scam nha mọi người cẩn thận, đừng bấm vào!!!",
    createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    likes: 3,
    status: "reported",
  },
  {
    id: "CMT003",
    user: { uid: "U9902", username: "toxic_guy" },
    postId: "P8877",
    postTitle: "Bức ảnh gia đình",
    content: "[Nội dung đã bị khóa do vi phạm]",
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    likes: 0,
    status: "locked",
  },
  {
    id: "CMT004",
    user: { uid: "U3311", username: "mai.tran" },
    postId: "P8891",
    postTitle: "Ngày cuối tuần chill với bánh 🍭",
    content: "Cho mình xin công thức với ạ 🙏",
    createdAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
    likes: 5,
    status: "normal",
  },
  {
    id: "CMT005",
    user: { uid: "U1177", username: "spammer99" },
    postId: "P8850",
    postTitle: "Chào buổi sáng",
    content: "Kiếm tiền online 100tr/tháng inbox ngay!!!",
    createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    likes: 0,
    status: "reported",
  },
];

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
