import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { socialDb as db3 } from "@/services/database";
import { useAuth } from "@/components/candy/auth-provider";
import { useRealtime, pickNew } from "@/lib/realtime-registry";

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Realtime warning popup.
 *
 * Subscribes to `public.notifications` for the signed-in user. On mount, fetches
 * every unread row so a user who was offline when the admin acted sees the
 * warning on their next login. Each notification is displayed exactly once —
 * after the user closes the popup we mark `is_read=true` so it never appears again.
 */
export function WarningNotificationPopup() {
  const { me } = useAuth();
  const [queue, setQueue] = useState<NotificationRow[]>([]);

  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;

    const push = (row: NotificationRow) => {
      setQueue((q) => (q.some((x) => x.id === row.id) ? q : [...q, row]));
    };

    const loadUnread = async () => {
      const { data } = await (db3() as any)
        .from("notifications")
        .select("id, user_id, type, title, message, data, is_read, created_at")
        .eq("user_id", me.id)
        .eq("is_read", false)
        .in("type", ["warning", "lock", "ban", "moderation"])
        .order("created_at", { ascending: true })
        .limit(20);
      if (cancelled) return;
      (data as NotificationRow[] | null)?.forEach(push);
    };

    void loadUnread();

    return () => {
      cancelled = true;
    };
  }, [me?.id]);

  useRealtime(
    me?.id ? `user-notif-${me.id}` : null,
    [{ table: "notifications", event: "INSERT", filter: `user_id=eq.${me?.id}` }],
    (payload) => {
      const row = pickNew(payload) as NotificationRow | undefined;
      if (row && !row.is_read && ["warning", "lock", "ban", "moderation"].includes(row.type)) {
        setQueue((q) => (q.some((x) => x.id === row.id) ? q : [...q, row]));
      }
    },
  );

  const current = queue[0];

  const dismiss = async () => {
    if (!current) return;
    await (db3() as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("id", current.id);
    setQueue((q) => q.slice(1));
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-900 p-6 text-white shadow-2xl"
            initial={{ y: 20, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.95, opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => void dismiss()}
              className="absolute right-3 top-3 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                <AlertTriangle size={22} />
              </span>
              <h2 className="text-lg font-bold">{current.title}</h2>
            </div>
            {current.message && (
              <p className="mb-5 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                {current.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => void dismiss()}
              className="w-full rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600"
            >
              Tôi đã hiểu
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
