import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { BrandText } from "@/components/candy/brand-text";
import { HeaderUserMenu } from "@/components/candy/header-user-menu";
import type { Profile } from "@/lib/app-types";
import { SearchModal } from "@/components/candy/search-modal";
import {
  PremiumSearchIcon,
  PremiumBellIcon,
  PremiumMenuIcon,
} from "@/components/candy/premium-icons";
import { formatCandy } from "@/lib/format";
import coinIcon from "@/assets/brand/coin.png";



interface AppHeaderProps {
  /** @deprecated Tiêu đề đã bị ẩn theo yêu cầu UI tối giản. */
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  me?: Profile | null;
  isAdmin?: boolean;
  onProfile?: () => void;
  onActivityLog?: () => void;
  onBalanceHistory?: () => void;
  onTransferGem?: () => void;
  onRanking?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  onViewProfile?: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
  onGoHome?: () => void;
}

export function AppHeader({
  showBack,
  onBack,
  me,
  isAdmin: _isAdmin,
  onProfile,
  onActivityLog,
  onBalanceHistory,
  onTransferGem,
  onRanking,
  onSettings,
  onLogout,
  unreadCount = 0,
  onOpenNotifications,
  onViewProfile,
  onOpenPost,
  onGoHome,
}: AppHeaderProps) {
  const noop = () => {};

  // Compact-on-scroll giữ nguyên — chỉ ẩn logo & tiêu đề.
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const check = () => {
      ticking = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setScrolled(y > 8);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(check);
      }
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Home behavior — giống nút Logo Facebook: về trang chủ, scroll top, refresh feed.
  const handleGoHome = () => {
    try { onGoHome?.(); } catch { /* */ }
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.querySelector(".page-body")?.scrollTo({ top: 0, behavior: "smooth" });
    } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent("feed:refresh")); } catch { /* */ }
  };


  return (
    <header
      className={`app-header app-header--clean app-header--floating app-header--minimal sticky-header${scrolled ? " is-scrolled" : ""}`}
    >

      <div className="app-header__left">
        {showBack ? (
          <button className="icon-button" onClick={onBack} aria-label="Quay lại">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <button
            type="button"
            className="app-header__brand"
            onClick={handleGoHome}
            aria-label="Về trang chủ Diễn Đàn FWB"
          >
            <BrandText size={30} className="app-header__brand-name" />
          </button>

        )}

      </div>

      {me ? (
        <div className="app-header__right flex items-center gap-2 md:gap-3">
          <button
            type="button"
            className={`hdr-icon-btn hdr-icon-btn--premium${searchOpen ? " is-active" : ""}`}
            aria-label="Tìm kiếm"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <PremiumSearchIcon size={22} className="nav-icon" />
          </button>
          <button
            type="button"
            className="hdr-icon-btn hdr-icon-btn--premium"
            aria-label="Thông báo"
            data-lucky-bell="1"
            onClick={() => onOpenNotifications?.()}
          >
            <PremiumBellIcon size={22} className="nav-icon" />
            {unreadCount > 0 ? (
              <span className="hdr-icon-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            ) : null}
          </button>

          <button
            type="button"
            className="hdr-icon-btn hdr-icon-btn--premium hdr-wallet-btn flex items-center gap-2"
            aria-label="Số dư ví"
            onClick={() =>
              toast(`Số dư hiện tại của bạn: ${formatCandy(Number(me?.gem_balance ?? 0))}`)
            }
            style={{
              width: "auto",
              padding: "0 14px",
            }}
          >
            <img loading="lazy" decoding="async" src={coinIcon} alt="" aria-hidden width={18} height={18} style={{ display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1 }}>
              {formatCandy(Number(me?.gem_balance ?? 0))}
            </span>
          </button>




          <HeaderUserMenu
            me={me}
            variant="simple"
            onProfile={onProfile ?? noop}
            onActivityLog={onActivityLog ?? noop}
            onBalanceHistory={onBalanceHistory ?? noop}
            onTransferGem={onTransferGem ?? noop}
            onRanking={onRanking ?? noop}
            onSettings={onSettings ?? noop}
            onLogout={onLogout ?? noop}
            triggerClassName="app-header__menu-btn hdr-icon-btn--premium"
            trigger={<PremiumMenuIcon size={20} aria-label="Mở menu" />}
          />
        </div>
      ) : null}

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onViewProfile={(id) => { setSearchOpen(false); onViewProfile?.(id); }}
        onOpenPost={onOpenPost ? (id) => { setSearchOpen(false); onOpenPost(id); } : undefined}
      />
    </header>

  );
}
