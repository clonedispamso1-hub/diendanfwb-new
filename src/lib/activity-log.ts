import { supabase } from "@/lib/supabase";

/**
 * Ghi 1 dòng vào activity_logs với mô tả tiếng Việt sẵn sàng hiển thị.
 * Best-effort: lỗi sẽ log console nhưng không ném ra ngoài.
 */
export async function logActivity(params: {
  userId: string;
  actionType: string;
  description: string;
  targetId?: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  const { userId, actionType, description, targetId, metadata } = params;
  try {
    const payload: Record<string, any> = {
      user_id: userId,
      action_type: actionType,
      target_id: targetId ?? null,
      metadata: { ...(metadata || {}), description },
    };
    // Cố gắng ghi kèm cột description (nếu migration đã chạy).
    let { error } = await supabase.from("activity_logs").insert({ ...payload, description } as any);
    if (error && /description/i.test(error.message || "")) {
      // Fallback: cột chưa tồn tại — vẫn có description nằm trong metadata.
      await supabase.from("activity_logs").insert(payload as any);
    }
  } catch (err) {
    console.warn("[activity-log] insert failed", err);
  }
}

export function truncate(text: string, max = 80): string {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}