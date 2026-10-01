import { motion, AnimatePresence } from "framer-motion";
import {
  ChatNavIcon,
  GroupNavIcon,
  HomeNavIcon,
  HotNavIcon,
  ProfileNavIcon,
} from "@/components/candy/bottom-nav-icons";
import "@/styles/nav-glass-v2.css";
import { useLanguage } from "@/i18n/context";


/**
 * Premium iOS-inspired floating dock nav.
 * Tabs: Trang chủ · 18 · Nhóm · Tin nhắn · Hồ sơ
 */
export type AppTab = "fwb" | "home" | "eighteen" | "connect" | "chat" | "profile";


interface BottomNavProps {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  unreadCount?: number;
  isAdmin?: boolean;
}

type TabDef = {
  id: AppTab;
  label: string;
  /** accessible name when the visible label is hidden */
  ariaLabel?: string;
  render: (active: boolean) => React.ReactNode;
};

export function BottomNav({ active, onChange, unreadCount = 0 }: BottomNavProps) {
  const { t } = useLanguage();

  const tabs: TabDef[] = [
    {
      id: "fwb",
      label: t("home"),
      render: (a) => <HomeNavIcon active={a} />,
    },
    {
      id: "eighteen",
      label: "HOT",
      render: (a) => <HotNavIcon active={a} />,
    },
    {
      id: "connect",
      label: "Nhóm",
      render: (a) => (
        <span className="ios-dock__icon-inner">
          <GroupNavIcon active={a} />
          {!a ? (
            <span className="ios-dock__badge" aria-hidden="true">
              999+
            </span>
          ) : null}
        </span>
      ),
    },

    {
      id: "chat",
      label: t("messages"),
      render: (a) => (
        <span className="ios-dock__icon-inner">
          <ChatNavIcon active={a} />
          {unreadCount > 0 ? (
            <AnimatePresence>
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="ios-dock__badge"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            </AnimatePresence>
          ) : null}
        </span>
      ),
    },
    {
      id: "profile",
      label: t("profile"),
      render: (a) => <ProfileNavIcon active={a} />,
    },
  ];

  return (
    <nav
      className="ios-dock"
      aria-label={t("mainNav")}
    >

      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <motion.button
            key={t.id}
            type="button"
            className={`ios-dock__tab${isActive ? " is-active" : ""}`}
            aria-label={t.ariaLabel ?? t.label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="ios-dock__pill" aria-hidden="true" />
            <span className="ios-dock__icon">{t.render(isActive)}</span>
            <span className="ios-dock__label">{t.label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
