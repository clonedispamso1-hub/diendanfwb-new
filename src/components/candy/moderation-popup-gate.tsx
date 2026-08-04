import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/candy/auth-provider";
import { X } from "lucide-react";

/**
 * ModerationPopupGate
 * -------------------
 * Shows a one-time popup to a post owner when a moderator has locked their
 * post or disabled its comments. The popup appears once per moderation
 * event. After the user dismisses it, the accompanying notification stays
 * in the notifications list until they open the affected post.
 *
 * Data contract:
 *   notifications.type ∈ { "post_locked", "post_comments_disabled" }
 *   notifications.data = { post_id, popup_pending: true, kind: "moderation" }
 *
 * On dismiss we flip `data.popup_pending` to false — the row (and its unread
 * state) is preserved so the notification list keeps showing it.
 */

type ModRow = {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  data: any;
  created_at: string;
};

const MOD_TYPES = ["post_locked", "post_comments_disabled"];

export function ModerationPopupGate() {
  const { me } = useAuth() as any;
  const [queue, setQueue] = useState<ModRow[]>([]);

  const load = useCallback(async () => {
    if (!me?.id) return;
    const { data } = await (supabase.from("notifications") as any)
      .select("id, type, title, message, data, created_at")
      .eq("user_id", me.id)
      .in("type", MOD_TYPES)
      .order("created_at", { ascending: true })
      .limit(20);
    const rows = ((data as ModRow[]) || []).filter(
      (n) => n?.data?.popup_pending === true,
    );
    setQueue(rows);
  }, [me?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!me?.id) return;
    const ch = (supabase as any)
      .channel(`mod-popup-${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { try { (supabase as any).removeChannel(ch); } catch { /* noop */ } };
  }, [me?.id, load]);

  const current = queue[0];
  if (!current) return null;

  const isLocked = current.type === "post_locked";
  const title = current.title || (isLocked ? "Bài viết đã bị khóa" : "Bình luận đã bị tắt");
  const body =
    current.message ||
    (isLocked
      ? "Bài viết của bạn đã bị đội ngũ kiểm duyệt khóa vì vi phạm quy tắc website."
      : "Bình luận trên bài viết của bạn đã bị đội ngũ kiểm duyệt tắt vì vi phạm quy tắc website.");

  const dismiss = async () => {
    const id = current.id;
    // Optimistic: pop this one off the queue immediately.
    setQueue((q) => q.filter((r) => r.id !== id));
    try {
      await (supabase.from("notifications") as any)
        .update({ data: { ...(current.data || {}), popup_pending: false } })
        .eq("id", id);
    } catch { /* best-effort */ }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440,
          background: "#141821",
          border: `1px solid ${isLocked ? "rgba(239,68,68,0.45)" : "rgba(96,165,250,0.45)"}`,
          borderRadius: 16, padding: 22, color: "#fff",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          position: "relative",
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Đóng"
          style={{
            position: "absolute", top: 10, right: 10,
            background: "transparent", border: 0, color: "#cbd5e1",
            cursor: "pointer", padding: 6, borderRadius: 8,
          }}
        >
          <X size={18} />
        </button>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{isLocked ? "🔒" : "💬"}</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: "0.9rem", lineHeight: 1.55, color: "#cbd5e1", marginBottom: 18 }}>
          {body}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={dismiss}
            style={{
              padding: "10px 22px",
              background: isLocked ? "#ef4444" : "#4f8cff",
              border: 0, borderRadius: 10, color: "#fff",
              fontWeight: 700, cursor: "pointer", fontSize: "0.9rem",
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModerationPopupGate;
