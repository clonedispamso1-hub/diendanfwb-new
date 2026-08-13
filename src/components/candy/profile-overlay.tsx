import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

const ProfilePage = lazyWithRetry(() =>
  import("@/components/candy/profile-page").then((m) => ({ default: m.ProfilePage })),
);

interface Props {
  userId: string;
  onClose: () => void;
  onOpenChat: (id: string) => void;
  onOpenPost: (id: string) => void;
  onOpenVideo: (id: string) => void;
  onViewProfile: (id: string) => void;
}

/**
 * ProfileOverlay — hồ sơ người khác mở dạng TRANG CON (push) đè lên Trang chủ.
 * Home KHÔNG bị unmount nên feed giữ nguyên scroll / video / cache.
 * Hỗ trợ nút Back và vuốt từ mép trái sang phải (iOS style) để quay lại.
 */
export function ProfileOverlay({
  userId, onClose, onOpenChat, onOpenPost, onOpenVideo, onViewProfile,
}: Props) {
  const [dragX, setDragX] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  // Sau khi animation vào xong → BỎ HẲN transform. `transform` tạo containing
  // block khiến mọi popup `position: fixed` bên trong bị kẹp trong overlay
  // (và bị overflow của body overlay cắt) → trông như popup nằm dưới overlay.
  const [settled, setSettled] = useState(false);
  const [name, setName] = useState<string>("");
  const [scrolled, setScrolled] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    const t = window.setTimeout(() => setSettled(true), 320);
    return () => { cancelAnimationFrame(id); window.clearTimeout(t); };
  }, []);

  // Mỗi lần đổi user (push tiếp) → reset trạng thái vuốt.
  useEffect(() => { setDragX(null); setName(""); setScrolled(false); }, [userId]);

  // Khi vuốt → tạm bật lại transform; thả tay xong → gỡ transform trở lại.
  useEffect(() => {
    if (dragX !== null) { setSettled(false); return; }
    const t = window.setTimeout(() => setSettled(true), 320);
    return () => window.clearTimeout(t);
  }, [dragX]);

  // Khoá hoàn toàn scroll của Home Feed phía sau; khi đóng overlay sẽ
  // khôi phục đúng vị trí scroll cũ (không remount / refetch feed).
  useBodyScrollLock(true);

  // Ẩn toàn bộ chrome của Trang chủ (header, feed header, bottom nav) khi overlay mở.
  useEffect(() => {
    document.body.classList.add("profile-overlay-open");
    return () => document.body.classList.remove("profile-overlay-open");
  }, []);

  // Scroll trong overlay → header thu gọn: "← Quay lại   <Tên>"
  const onBodyScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 72);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY, active: t.clientX <= 32 };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = startRef.current;
    const t = e.touches[0];
    if (!s || !s.active || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) return;
    setDragX(dx);
  }, []);

  const onTouchEnd = useCallback(() => {
    const s = startRef.current;
    startRef.current = null;
    if (!s?.active) return;
    setDragX((cur) => {
      if (cur !== null && cur > 90) {
        // Thoát: quay lại đúng vị trí cũ của feed.
        window.setTimeout(onClose, 0);
        return cur;
      }
      return null;
    });
  }, [onClose]);

  const animating = dragX !== null || !settled;
  const style: React.CSSProperties = animating
    ? {
        transform:
          dragX !== null ? `translateX(${dragX}px)` : entered ? "translateX(0)" : "translateX(100%)",
        transition: dragX !== null ? "none" : "transform 260ms cubic-bezier(.32,.72,0,1)",
      }
    : { transform: "none", transition: "none" };

  return (
    <div
      className="profile-overlay"
      role="dialog"
      aria-label="Trang cá nhân"
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <style>{`
        .profile-overlay {
          position: fixed; inset: 0; z-index: var(--z-profile-overlay, 1000);
          background: hsl(var(--background));
          display: flex; flex-direction: column;
          will-change: transform;
          box-shadow: -18px 0 40px rgba(0,0,0,.28);
        }
        .profile-overlay-bar {
          position: sticky; top: 0; z-index: 2;
          flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; padding-top: max(10px, env(safe-area-inset-top));
          border-bottom: 1px solid hsl(var(--border) / .6);
          background: hsl(var(--background) / .92);
          backdrop-filter: blur(12px);
        }
        .profile-overlay-back {
          display: inline-flex; align-items: center; gap: 6px;
          height: 36px; padding: 0 14px 0 10px; border-radius: 999px;
          font-size: 14px; font-weight: 700;
          border: 1px solid hsl(var(--border)); background: hsl(var(--card));
          color: hsl(var(--foreground)); cursor: pointer;
        }
        .profile-overlay-back:active { transform: scale(.96); }
        .profile-overlay-title { font-weight: 800; font-size: 15px; }

        .profile-overlay-body {
          flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch;
          padding: 12px 12px 96px;
        }
        .profile-overlay-edge {
          position: absolute; left: 0; top: 0; bottom: 0; width: 24px; z-index: 2;
        }
        /* Tab "Bài viết / Ảnh / Liên hệ" KHÔNG được sticky trong overlay:
           nó từng dính lên đầu và đè lên Feed. */
        .profile-overlay .tg-tabs,
        .profile-overlay .tg-tabs--pill,
        .profile-overlay .profile-tabs-sticky {
          position: static !important;
          top: auto !important;
        }
      `}</style>
      <div className="profile-overlay-edge" aria-hidden="true" />
      <div className="profile-overlay-bar">
        <button type="button" className="profile-overlay-back" onClick={onClose} aria-label="Quay lại">
          <ArrowLeft size={16} />
          <span>Quay lại</span>
        </button>
        {scrolled && name ? <span className="profile-overlay-title">{name}</span> : null}
      </div>
      <div className="profile-overlay-body" data-scroll-lock-ignore ref={bodyRef} onScroll={onBodyScroll}>
        <Suspense fallback={<div className="page-fallback" aria-hidden />}>
          <ProfilePage
            userId={userId}
            onProfileName={setName}
            onViewProfile={onViewProfile}
            onOpenChat={onOpenChat}
            onOpenPost={onOpenPost}
            onOpenVideo={onOpenVideo}
          />
        </Suspense>
      </div>
    </div>
  );
}
