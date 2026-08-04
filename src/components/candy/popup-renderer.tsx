/**
 * PopupRenderer — hiển thị popup thật từ database, lần lượt theo thứ tự admin bật.
 * Popup 1 hiện trước → user bấm X → popup 2 hiện → ...
 * Có tuỳ chọn "Không hiển thị lại trong 24 giờ" (24h).
 */
import { useEffect, useState } from "react";
import { getActivePopups, type PopupItem } from "@/lib/popup-api";
import { PopupCard, POPUP_CARD_CSS } from "@/components/candy/popup-card";

const LS_KEY = (id: string) => `candy.popup.${id}.hideUntil`;

function isHidden(id: string) {
  if (typeof window === "undefined") return true;
  return Number(localStorage.getItem(LS_KEY(id)) || 0) > Date.now();
}

export function PopupRenderer() {
  const [queue, setQueue] = useState<PopupItem[]>([]);
  const [index, setIndex] = useState(0);
  const [dsa, setDsa] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getActivePopups();
        if (cancelled) return;
        setQueue(list.filter((p) => !isHidden(p.id)));
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const popup = queue[index] ?? null;

  useEffect(() => {
    if (!popup) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [popup]);

  if (!popup) return null;

  const close = () => {
    if (dsa) {
      localStorage.setItem(LS_KEY(popup.id), String(Date.now() + 24 * 3600_000));
    }
    setDsa(false);
    setIndex((i) => i + 1);
  };

  return (
    <div className="pr-overlay" role="dialog" aria-modal="true">
      <PopupCard
        popup={popup}
        onClose={close}
        dsa={dsa}
        onDsaChange={setDsa}
        total={queue.length}
        index={index}
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
