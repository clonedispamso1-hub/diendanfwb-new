import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/components/candy/auth-provider";
import { isRealUserForReminder, shouldShowPostReminder } from "@/lib/post-reminder";

const KEY = (uid: string) => `fwb_post_reminder_at:${uid}`;
const isInternalPath = (p: string) => /admin|internal|tools/i.test(p);

/**
 * "Đăng bài để tìm thêm bạn mới nhé ❤️" — chỉ hiển thị, không đụng lượt / gem.
 * Một instance duy nhất trong CandyApp; mốc thời gian lưu theo tài khoản nên
 * F5 / chuyển trang không hiện lại trước 4 giờ.
 */
export function PostReminderPopup() {
  const { me } = useAuth() as any;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    const uid = me?.id as string | undefined;
    if (!uid || checkedFor.current === uid) return;
    if (!isRealUserForReminder(me) || isInternalPath(pathname)) return;
    checkedFor.current = uid;
    let last: number | null = null;
    try {
      const raw = localStorage.getItem(KEY(uid));
      last = raw ? Number(raw) : null;
    } catch { /* ignore */ }
    if (!shouldShowPostReminder(last, Date.now())) return;
    try { localStorage.setItem(KEY(uid), String(Date.now())); } catch { /* ignore */ }
    // Chờ popup quà 20 lượt (nếu có) đóng rồi mới hiện để không chồng nhau.
    const iv = window.setInterval(() => {
      if (document.querySelector(".fpc-backdrop")) return;
      window.clearInterval(iv);
      setOpen(true);
    }, 1200);
    return () => window.clearInterval(iv);
  }, [me, pathname]);

  const close = (after?: () => void) => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      after?.();
    }, 220);
  };

  const postNow = () =>
    close(() => {
      const fire = () => window.dispatchEvent(new Event("fwb:open-composer"));
      if (pathname !== "/") {
        void navigate({ to: "/" }).then(() => window.setTimeout(fire, 300));
      } else fire();
    });

  if (!open) return null;
  return (
    <div
      className={`prp-backdrop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prp-title"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="prp-card">
        <div className="prp-heart" aria-hidden>❤️</div>
        <h2 id="prp-title" className="prp-title">Đăng bài để tìm thêm bạn mới nhé ❤️</h2>
        <div className="prp-actions">
          <button type="button" className="prp-btn prp-btn--primary" onClick={postNow}>
            Đăng bài ngay ❤️
          </button>
          <button type="button" className="prp-btn prp-btn--ghost" onClick={() => close()}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
