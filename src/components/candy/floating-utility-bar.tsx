import { useEffect, useState } from "react";
import { Bell, Search, X } from "lucide-react";
import { UserSearch } from "@/components/candy/user-search";
import { Portal } from "@/components/candy/portal";

interface FloatingUtilityBarProps {
  unreadCount?: number;
  onOpenNotifications: () => void;
  onViewProfile: (userId: string) => void;
  onOpenPost?: (postId: string) => void;
}

/**
 * Thanh tiện ích nổi (glassmorphism) đặt sát phía trên BottomNav.
 *  - Nút Tìm kiếm → bật bottom-sheet ở đáy màn hình (input ngay tầm ngón cái).
 *  - Nút Thông báo → mở NotificationsPanel sẵn có.
 *  - Luôn hiển thị khi cuộn — user không cần kéo về đầu trang.
 */
export function FloatingUtilityBar({
  unreadCount = 0,
  onOpenNotifications,
  onViewProfile,
  onOpenPost,
}: FloatingUtilityBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <>
      <div className="util-bar" role="toolbar" aria-label="Tiện ích nhanh">
        <button
          type="button"
          className="util-bar__btn"
          aria-label="Tìm kiếm"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={18} />
        </button>
        <button
          type="button"
          className="util-bar__btn"
          aria-label="Thông báo"
          onClick={onOpenNotifications}
        >
          <Bell size={18} />
          {unreadCount > 0 ? (
            <span className="util-bar__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          ) : null}
        </button>
      </div>

      {searchOpen ? (
        <Portal>
          <div
            className="util-search-backdrop"
            onClick={() => setSearchOpen(false)}
            role="presentation"
          />
          <div
            className="util-search-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="util-search-sheet__handle" />
            <div className="util-search-sheet__head">
              <span className="util-search-sheet__title">Tìm kiếm</span>
              <button
                type="button"
                className="util-search-sheet__close"
                aria-label="Đóng"
                onClick={() => setSearchOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="util-search-sheet__body" data-scroll-lock-ignore>
              <UserSearch
                onViewProfile={(id) => {
                  setSearchOpen(false);
                  onViewProfile(id);
                }}
                onOpenPost={(id) => {
                  setSearchOpen(false);
                  onOpenPost?.(id);
                }}
              />
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  );
}
