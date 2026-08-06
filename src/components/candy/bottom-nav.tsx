import { motion, AnimatePresence } from "framer-motion";
import { Home, MessageCircle, Tv, User } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { useLiveRoomCount } from "@/lib/live-presence";
import "@/components/candy/live/live-dock.css";
import "@/styles/nav-glass-v2.css";

/**
 * Premium iOS-inspired floating dock nav.
 * Tabs: Trang chủ · Live Móc 🦋 · ❤️ Kết Nối Bí Mật · Tin nhắn · Hồ sơ
 */
export type AppTab = "fwb" | "home" | "guide" | "connect" | "chat" | "profile";


interface BottomNavProps {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  /** legacy prop kept for compatibility; no longer rendered. */
  onCreate?: () => void;
  unreadCount?: number;
  isAdmin?: boolean;
}

type TabDef = {
  id: AppTab;
  label: string;
  render: (active: boolean) => React.ReactNode;
};

export function BottomNav({ active, onChange, unreadCount = 0 }: BottomNavProps) {
  const { me } = useAuth();
  const liveCount = useLiveRoomCount();

  const tabs: TabDef[] = [
    {
      id: "fwb",
      label: "Trang chủ",
      render: (a) => <Home size={24} strokeWidth={a ? 2.4 : 1.9} />,
    },
    {
      id: "guide",
      label: "Live Móc 🦋",
      render: (a) => <Tv size={24} strokeWidth={a ? 2.4 : 1.9} />,
    },
    {
      id: "connect",
      label: "Kết Nối Bí Mật",
      render: (a) => (
        <span className={`sc-nav-heart3d${a ? " is-active" : ""}`} aria-hidden>
          <i />
        </span>
      ),
    },

    {
      id: "chat",
      label: "Tin nhắn",
      render: (a) => (
        <span style={{ position: "relative", display: "inline-flex" }}>
          <MessageCircle size={24} strokeWidth={a ? 2.4 : 1.9} />
          {unreadCount > 0 ? (
            <AnimatePresence>
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="ios-dock__badge"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            </AnimatePresence>
          ) : null}
        </span>
      ),
    },
    {
      id: "profile",
      label: "Hồ sơ",
      render: (a) => (
        <span className={`ios-dock__avatar${a ? " is-active" : ""}`}>
          {me?.avatar ? (
            <AvatarGlow avatar={me.avatar} userId={me.id} size={24} alt="" />
          ) : (
            <User size={20} strokeWidth={2} />
          )}
        </span>
      ),
    },
  ];

  return (
    <nav className="ios-dock" aria-label="Điều hướng chính">
      {tabs.map((t) => {
        const isActive = active === t.id;
        const hasLive = t.id === "guide" && liveCount > 0;
        const badgeCount = liveCount;
        return (
          <motion.button
            key={t.id}
            type="button"
            className={`ios-dock__tab${isActive ? " is-active" : ""}${hasLive ? " has-live" : ""}${
              t.id === "connect" ? " is-connect" : ""
            }`}
            aria-label={hasLive ? `${t.label} — đang có ${badgeCount} trận` : t.label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(t.id)}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
          >
            {isActive ? (
              <motion.span
                layoutId="ios-dock-pill"
                className="ios-dock__pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="ios-dock__icon">{t.render(isActive)}</span>
            <span className="ios-dock__label">{t.label}</span>
            {hasLive ? (
              <span className="ios-dock__live-badge">
                <i />
                {badgeCount} LIVE
              </span>

            ) : null}
          </motion.button>
        );
      })}
    </nav>
  );
}
