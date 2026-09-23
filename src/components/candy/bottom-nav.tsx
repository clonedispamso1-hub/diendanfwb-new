import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/candy/auth-provider";
import {
  ChatNavIcon,
  FeedbackNavIcon,
  HomeNavIcon,
  ProfileNavIcon,
} from "@/components/candy/bottom-nav-icons";
import { Radio } from "lucide-react";
import { useLiveRoomCount } from "@/lib/live-presence";
import { useFeedbackBadge } from "@/lib/feedback";
import "@/components/candy/live/live-dock.css";
import "@/styles/nav-glass-v2.css";
import { useLanguage } from "@/i18n/context";


/**
 * Premium iOS-inspired floating dock nav.
 * Tabs: Trang chủ · Live Hot · Feedback · Tin nhắn · Hồ sơ
 */
export type AppTab = "fwb" | "home" | "guide" | "feedback" | "chat" | "profile";


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
  const { t } = useLanguage();
  const { me } = useAuth();
  const liveCount = useLiveRoomCount();
  const feedbackNew = useFeedbackBadge(me?.id ?? null);

  const tabs: TabDef[] = [
    {
      id: "fwb",
      label: t("home"),
      render: (a) => <HomeNavIcon active={a} />,
    },
    {
      id: "guide",
      label: "Live Hot",
      render: (a) => (
        <Radio
          size={24}
          strokeWidth={a ? 2 : 1.75}
          aria-hidden="true"
          focusable="false"
          vectorEffect="non-scaling-stroke"
        />
      ),
    },
    {
      id: "feedback",
      label: t("feedback"),
      render: (a) => (
        <span className="ios-dock__icon-inner">
          <FeedbackNavIcon active={a} />
          {feedbackNew > 0 ? (
            <AnimatePresence>
              <motion.span
                key="fb-badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="ios-dock__badge"
              >
                {feedbackNew}
              </motion.span>
            </AnimatePresence>
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
        const hasLive = t.id === "guide" && liveCount > 0;
        const badgeCount = liveCount;
        return (
          <motion.button
            key={t.id}
            type="button"
            className={`ios-dock__tab${isActive ? " is-active" : ""}${hasLive ? " has-live" : ""}${
              t.id === "feedback" ? " is-feedback" : ""
            }`}
            aria-label={hasLive ? `${t.label} — đang có ${badgeCount} trận` : t.label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="ios-dock__pill" aria-hidden="true" />
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
