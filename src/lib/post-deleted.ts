import { toast } from "sonner";

/**
 * Phát hiện lỗi từ Supabase khi tương tác (like/comment/gift) với một bài viết
 * đã bị xóa. Trả về true nếu là lỗi "bài viết không còn tồn tại".
 */
export function isPostDeletedError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  // 23503: foreign_key_violation, 23502: not_null, PGRST116: row not found
  if (code === "23503" || code === "PGRST116") return true;
  return (
    msg.includes("foreign key") ||
    msg.includes("violates foreign key") ||
    msg.includes("not present in table") ||
    msg.includes("no rows") ||
    (msg.includes("post") && msg.includes("not") && msg.includes("found"))
  );
}

/**
 * Hiển thị cảnh báo & redirect về trang chủ khi user tương tác với bài đã bị xóa.
 */
export function handleDeletedPostInteraction() {
  if (typeof window === "undefined") return;
  toast.error("Bài viết này vi phạm đã bị xóa!", {
    duration: 2500,
    action: {
      label: "OK",
      onClick: () => {
        window.location.href = "/";
      },
    },
  });
  window.setTimeout(() => {
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
  }, 2800);
}
