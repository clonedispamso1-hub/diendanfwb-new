/**
 * PopupRenderer — chỉ MỘT popup được bật, kiểm tra DUY NHẤT lúc load/F5.
 *
 * Quy tắc:
 *  • Chỉ hiện popup sau khi đăng nhập.
 *  • Đọc cấu hình popup đang bật 1 lần (có cache) — không poll, không realtime.
 *  • Bấm X mà KHÔNG tick checkbox ⇒ F5 vẫn hiện lại.
 *  • Tick "Không hiển thị lại trong [chu kỳ]" ⇒ ẩn đúng chu kỳ (lưu localStorage
 *    theo user + popup), hết chu kỳ mới hiện lại.
 *  • Admin đổi chu kỳ ⇒ áp dụng ngay ở lần load sau (chu kỳ tính theo cấu hình
 *    hiện tại, không lưu cứng hạn cũ).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getActivePopup, type PopupItem } from "@/lib/popup-api";
import { PopupCard, POPUP_CARD_CSS } from "@/components/candy/popup-card";

const key = (userId: string, popupId: string) =>
  `candy.popup.${userId}.${popupId}.dismissedAt`;

function repeatMs(popup: PopupItem): number {
  const m = Number(popup.repeatMinutes) > 0 ? Number(popup.repeatMinutes) : 1440;
  return m * 60_000;
}

/** Đang trong chu kỳ ẩn? (tính theo chu kỳ hiện tại của cấu hình) */
function isSnoozed(userId: string, popup: PopupItem): boolean {
  if (typeof window === "undefined") return true;
  const at = Number(window.localStorage.getItem(key(userId, popup.id)) || 0);
  if (!at) return false;
  return Date.now() < at + repeatMs(popup);
}

function snooze(userId: string, popup: PopupItem) {
  try {
    window.localStorage.setItem(key(userId, popup.id), String(Date.now()));
  } catch {
    /* noop */
  }
}

export function snoozeText(popup: PopupItem): string {
  const m = Number(popup.repeatMinutes) > 0 ? Number(popup.repeatMinutes) : 1440;
  if (m < 60) return `${m} phút`;
  if (m % 1440 === 0) return `${m / 1440} ngày`;
  if (m % 60 === 0) return `${m / 60} giờ`;
  return `${Math.round(m / 60)} giờ`;
}

export function PopupRenderer() {
  const [userId, setUserId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupItem | null>(null);
  const [dsa, setDsa] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const next = session?.user?.id ?? null;
      setUserId(next);
      if (!next) setPopup(null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Kiểm tra MỘT LẦN mỗi lần load/F5 (hoặc khi vừa đăng nhập).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const item = await getActivePopup();
        if (cancelled || !item || !item.enabled) return;
        if (isSnoozed(userId, item)) return;
        setDsa(false);
        setPopup(item);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!popup) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [popup]);

  const close = useCallback(() => {
    if (popup && userId && dsa) snooze(userId, popup);
    setPopup(null);
  }, [popup, userId, dsa]);

  if (!popup) return null;

  return (
    <div className="pr-overlay" role="dialog" aria-modal="true">
      <PopupCard
        popup={popup}
        onClose={close}
        showDsa
        dsa={dsa}
        onDsaChange={setDsa}
        dsaLabel={`Không hiển thị lại trong ${snoozeText(popup)}`}
        total={1}
        index={0}
      />
      <style>{`
        .pr-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
          justify-content:center;padding:16px;background:rgba(8,11,24,.66);
          backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
          animation:pr-fade .28s ease both;}
        ${POPUP_CARD_CSS}
      `}</style>
    </div>
  );
}
