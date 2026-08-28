import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DragonBallFlyLayer } from "@/components/candy/gift/dragon-ball-fly";
import { Portal } from "@/components/candy/portal";
import { GemRealtimeBridge } from "@/components/candy/gem-realtime-bridge";


interface Notification {
  id: string;
  title: string;
  message: string;
  type?: "info" | "success" | "candy" | "message";
  /** Optional click handler — if set, banner becomes tappable (Messenger-style). */
  onClick?: () => void;
}

interface NotificationContextValue {
  notify: (n: Omit<Notification, "id">) => void;
}


const NotificationContext = createContext<NotificationContextValue>({ notify: () => {} });

export function useNotification() {
  return useContext(NotificationContext);
}

function RealtimeToastBridge({ notify }: { notify: (n: Omit<Notification, "id">) => void }) {
  // Popup Ngọc Rồng / hiệu ứng quà vẫn tắt. Riêng XU (tặng xu / chuyển xu) và
  // thông báo mới thì hiện popup NGAY qua Supabase Realtime — không polling.
  return <GemRealtimeBridge notify={notify} />;
}


export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notify = useCallback((n: Omit<Notification, "id">) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [...prev, { ...n, id }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ notify }}>
      <RealtimeToastBridge notify={notify} />
      {children}
      <DragonBallFlyLayer />
      <Portal>
      <div className="notification-stack">
        <AnimatePresence>
          {notifications.map((n) => {
            const clickable = typeof n.onClick === "function";
            return (
              <motion.div
                key={n.id}
                className={`notification-popup notification-${n.type || "info"}${clickable ? " is-clickable" : ""}`}
                initial={{ opacity: 0, y: -60, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.95 }}
                transition={{ type: "spring", damping: 22, stiffness: 320 }}
                onClick={clickable ? () => { try { n.onClick?.(); } finally { dismiss(n.id); } } : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    try { n.onClick?.(); } finally { dismiss(n.id); }
                  }
                } : undefined}
                style={clickable ? { cursor: "pointer" } : undefined}
              >
                <div className="notification-content">
                  <p className="notification-title">{n.title}</p>
                  <p className="notification-message">{n.message}</p>
                </div>
                <button
                  className="notification-close"
                  onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                  aria-label="Đóng thông báo"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </Portal>
    </NotificationContext.Provider>
  );
}
