import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DragonBallFlyLayer } from "@/components/candy/gift/dragon-ball-fly";
import { Portal } from "@/components/candy/portal";
import { GemRealtimeBridge } from "@/components/candy/gem-realtime-bridge";


interface Notification {
  id: string;
  title: string;
  message: string;
  type?: "info" | "success" | "candy" | "message" | "follow";
  /** Avatar người gửi (Messenger-style). */
  avatarUrl?: string | null;
  /** Optional click handler — if set, banner becomes tappable (Messenger-style). */
  onClick?: () => void;
  /** Số tin nhắn mới đã gộp vào popup này (>=1). */
  groupCount?: number;
}

/** Chữ cái đầu làm avatar dự phòng khi người gửi chưa có ảnh. */
const initialOf = (name: string) => (name.trim()[0] || "?").toUpperCase();

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
  // Chỉ MỘT popup hiển thị tại một thời điểm. Sự kiện mới sẽ cập nhật
  // (gộp) vào chính popup đang hiện, không tạo popup thứ hai.
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((n: Omit<Notification, "id">) => {
    setNotifications((prev) => {
      const current = prev[0];
      // Gộp: giữ nguyên id popup đang hiện để không remount/stack thêm popup.
      const id = current?.id ?? `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const groupCount =
        current && current.type === "message" && n.type === "message"
          ? (current.groupCount ?? 1) + 1
          : 1;
      return [{ ...n, id, groupCount }];
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotifications([]), 5000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const dismiss = (_id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotifications([]);
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
            // "message" dùng class riêng -toast để không trùng với .notification-message (text).
            const variant = n.type === "message" ? "message-toast" : n.type || "info";
            const showAvatar = n.type === "message" || n.type === "follow";
            return (
              <motion.div
                key={n.id}
                className={`notification-popup notification-${variant}${clickable ? " is-clickable" : ""}`}
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
                {showAvatar && (
                  <div className="notification-avatar" aria-hidden="true">
                    {n.avatarUrl ? (
                      <img src={n.avatarUrl} alt="" loading="lazy" />
                    ) : (
                      <span>{initialOf(n.title)}</span>
                    )}
                  </div>
                )}
                <div className="notification-content">
                  {n.type === "follow" && (
                    <p className="notification-eyebrow">Thông báo mới</p>
                  )}
                  <p className="notification-title">
                    {n.title}
                    {n.type === "message" && (n.groupCount ?? 1) > 1 && (
                      <span className="notification-count"> · {n.groupCount} tin nhắn mới</span>
                    )}
                  </p>
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
