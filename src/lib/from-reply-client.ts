import { supabase } from "@/lib/supabase";
import { fromReplyNotifyFn } from "./from-reply.functions";

/** Báo máy chủ sau khi user gửi tin từ bài viết thành công. Không chặn UI, lỗi được bỏ qua. */
export function notifyFromReply(receiverId: string): void {
  void (async () => {
    try {
      const { data } = await (supabase as any).auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      await fromReplyNotifyFn({ data: { token, receiverId } });
    } catch { /* bỏ qua: không ảnh hưởng chat */ }
  })();
}
