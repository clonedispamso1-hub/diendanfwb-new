/**
 * POPUP ENGINE — 01 component popup duy nhất cho toàn website.
 *
 * Cách dùng ở bất kỳ đâu:
 *   import { openPopup } from "@/components/candy/popup-engine";
 *   openPopup("vip_zalo");
 *   openPopup("live_moc", { onConfirm: () => ... });
 *
 * Nội dung / icon / ảnh / nút / hiệu ứng / màu đều lấy từ Admin Panel
 * (Quản lý Popup). Thêm tính năng mới chỉ cần thêm popup_key, không phải
 * viết thêm popup nào nữa.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadFeaturePopups,
  defaultPopup,
  type FeaturePopupConfig,
} from "@/lib/feature-popups";

const EVENT = "candy:open-popup";

export interface OpenPopupOptions {
  /** Ghi đè nội dung tạm thời (không lưu DB). */
  overrides?: Partial<FeaturePopupConfig>;
  /** Chạy khi bấm nút phải (nếu không có link). */
  onConfirm?: () => void;
  onClose?: () => void;
}

interface OpenDetail extends OpenPopupOptions {
  key: string;
}

/** Mở popup theo popup_key. */
export function openPopup(key: string, options: OpenPopupOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenDetail>(EVENT, { detail: { key, ...options } }),
  );
}

/** Đóng popup đang mở. */
export function closePopup() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("candy:close-popup"));
}

export function PopupEngine() {
  const [configs, setConfigs] = useState<FeaturePopupConfig[] | null>(null);
  const [current, setCurrent] = useState<OpenDetail | null>(null);
  const [visible, setVisible] = useState(false);
  const loading = useRef(false);

  const ensureConfigs = useCallback(async () => {
    if (configs || loading.current) return;
    loading.current = true;
    const list = await loadFeaturePopups();
    setConfigs(list);
    loading.current = false;
  }, [configs]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      if (!detail?.key) return;
      void ensureConfigs();
      setCurrent(detail);
      setVisible(true);
    };
    const onClose = () => setVisible(false);
    window.addEventListener(EVENT, onOpen as EventListener);
    window.addEventListener("candy:close-popup", onClose);
    return () => {
      window.removeEventListener(EVENT, onOpen as EventListener);
      window.removeEventListener("candy:close-popup", onClose);
    };
  }, [ensureConfigs]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible || !current) return null;

  const base =
    configs?.find((c) => c.key === current.key) ?? defaultPopup(current.key);
  const cfg: FeaturePopupConfig = { ...base, ...(current.overrides ?? {}) };
  if (!cfg.enabled) return null;

  const close = () => {
    setVisible(false);
    current.onClose?.();
  };

  const confirm = () => {
    if (cfg.rightUrl) {
      window.open(cfg.rightUrl, "_blank", "noopener,noreferrer");
    }
    current.onConfirm?.();
    setVisible(false);
  };

  return (
    <>
      <div
        className={`pe-overlay pe-fx-${cfg.effect}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className={`pe-card pe-theme-${cfg.theme}`}>
          <button className="pe-close" onClick={close} aria-label="Đóng">
            ✕
          </button>

          {cfg.effect === "unlock" ||
          cfg.effect === "game" ||
          cfg.effect === "letter" ? (
            <span className="pe-spark" aria-hidden="true" />
          ) : null}

          <div className="pe-icon" aria-hidden="true">
            {cfg.icon || "📢"}
          </div>

          {cfg.imageUrl ? (
            <img className="pe-image" src={cfg.imageUrl} alt="" loading="lazy" />
          ) : null}

          <h3 className="pe-title">{cfg.title}</h3>
          {cfg.content ? <p className="pe-content">{cfg.content}</p> : null}

          <div className="pe-actions">
            {cfg.leftText ? (
              <button className="pe-btn pe-btn--ghost" onClick={close}>
                {cfg.leftText}
              </button>
            ) : null}
            {cfg.rightText ? (
              <button className="pe-btn pe-btn--primary" onClick={confirm}>
                {cfg.rightText}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <style>{POPUP_ENGINE_CSS}</style>
    </>
  );
}

export const POPUP_ENGINE_CSS = `
.pe-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;
  justify-content:center;padding:16px;background:rgba(8,11,24,.66);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  animation:pe-fade .22s ease both;}
.pe-card{position:relative;width:100%;max-width:360px;border-radius:22px;
  padding:26px 20px 20px;text-align:center;color:#fff;overflow:hidden;
  box-shadow:0 30px 70px -24px rgba(0,0,0,.75);
  border:1px solid rgba(255,255,255,.18);animation:pe-in .28s cubic-bezier(.2,.8,.3,1) both;}
.pe-close{position:absolute;right:12px;top:12px;height:30px;width:30px;border:0;
  cursor:pointer;border-radius:999px;color:inherit;background:rgba(255,255,255,.18);
  font-size:13px;line-height:1;display:grid;place-items:center;transition:background-color .15s ease;}
.pe-close:hover{background:rgba(255,255,255,.32);}
.pe-icon{margin:0 auto 12px;height:62px;width:62px;display:grid;place-items:center;
  font-size:30px;border-radius:999px;background:rgba(255,255,255,.2);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 12px 26px -14px rgba(0,0,0,.7);}
.pe-image{display:block;width:100%;max-height:170px;object-fit:cover;border-radius:16px;
  margin:0 0 14px;border:1px solid rgba(255,255,255,.22);}
.pe-title{margin:0 0 8px;font-size:19px;font-weight:900;letter-spacing:-.01em;}
.pe-content{margin:0;font-size:14.5px;line-height:1.6;opacity:.95;}
.pe-actions{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.pe-actions:has(.pe-btn:only-child){grid-template-columns:1fr;}
.pe-btn{border:0;cursor:pointer;padding:12px 14px;border-radius:14px;font-size:15px;
  font-weight:800;transition:transform .15s ease,filter .15s ease;}
.pe-btn:hover{transform:translateY(-1px);filter:brightness(1.06);}
.pe-btn--ghost{color:#fff;background:rgba(255,255,255,.18);
  border:1px solid rgba(255,255,255,.28);}
.pe-btn--primary{color:#0b1020;background:linear-gradient(135deg,#ffffff,#e5edff);
  box-shadow:0 12px 24px -14px rgba(0,0,0,.8);}

/* ---------- Màu ---------- */
.pe-theme-gradient{background:linear-gradient(150deg,#4f46e5,#9333ea 55%,#ec4899);}
.pe-theme-pink{background:linear-gradient(150deg,#be123c,#f43f5e 50%,#fb7185);}
.pe-theme-purple{background:linear-gradient(150deg,#5b21b6,#8b5cf6 55%,#d946ef);}
.pe-theme-blue{background:linear-gradient(150deg,#1e40af,#3b82f6 55%,#60a5fa);}
.pe-theme-dark{background:linear-gradient(150deg,#0f172a,#1f2937 60%,#111827);}
.pe-theme-glass{background:rgba(20,26,44,.72);backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);}
.pe-theme-gold{background:linear-gradient(150deg,#92400e,#f59e0b 55%,#fde68a);color:#3b2405;}
.pe-theme-gold .pe-btn--ghost{color:#3b2405;background:rgba(59,36,5,.12);
  border-color:rgba(59,36,5,.22);}
.pe-theme-gold .pe-close{color:#3b2405;background:rgba(59,36,5,.14);}

/* ---------- Hiệu ứng ---------- */
.pe-fx-fade .pe-card{animation-name:pe-fade;}
.pe-fx-scale .pe-card{animation-name:pe-scale;}
.pe-fx-zoom .pe-card{animation-name:pe-zoom;}
.pe-fx-slide .pe-card{animation-name:pe-slide;}
.pe-fx-letter .pe-card{animation-name:pe-letter;transform-origin:top center;}
.pe-fx-unlock .pe-card{animation-name:pe-unlock;}
.pe-fx-game .pe-card{animation-name:pe-game;}
.pe-fx-3d .pe-card{animation-name:pe-3d;transform-style:preserve-3d;}
.pe-fx-unlock .pe-icon,.pe-fx-game .pe-icon{animation:pe-shake .9s ease both;}
.pe-fx-letter .pe-icon{animation:pe-float 2.6s ease-in-out infinite;}

.pe-spark{position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(circle 3px at 18% 24%,rgba(255,240,170,.95),transparent 60%),
    radial-gradient(circle 2px at 82% 30%,rgba(255,255,255,.9),transparent 60%),
    radial-gradient(circle 2.5px at 26% 76%,rgba(255,240,170,.85),transparent 60%),
    radial-gradient(circle 2px at 74% 82%,rgba(255,255,255,.85),transparent 60%);
  animation:pe-sparkle 2.4s ease-in-out infinite;}

@keyframes pe-fade{from{opacity:0}to{opacity:1}}
@keyframes pe-scale{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@keyframes pe-zoom{0%{opacity:0;transform:scale(.6)}60%{transform:scale(1.04)}100%{opacity:1;transform:none}}
@keyframes pe-slide{from{opacity:0;transform:translate3d(0,40px,0)}to{opacity:1;transform:none}}
@keyframes pe-letter{0%{opacity:0;transform:perspective(800px) rotateX(-85deg) translateY(-20px)}
  100%{opacity:1;transform:perspective(800px) rotateX(0) translateY(0)}}
@keyframes pe-unlock{0%{opacity:0;transform:scale(.86) rotate(-2deg)}
  45%{opacity:1;transform:scale(1.03) rotate(1deg)}100%{transform:none}}
@keyframes pe-game{0%{opacity:0;transform:translateY(-60px) scale(.9)}
  55%{opacity:1;transform:translateY(8px) scale(1.02)}75%{transform:translateY(-4px)}100%{transform:none}}
@keyframes pe-3d{0%{opacity:0;transform:perspective(900px) rotateY(28deg) translateZ(-120px)}
  100%{opacity:1;transform:perspective(900px) rotateY(0) translateZ(0)}}
@keyframes pe-in{from{opacity:0;transform:translate3d(0,12px,0) scale(.97)}to{opacity:1;transform:none}}
@keyframes pe-shake{0%,100%{transform:none}15%{transform:rotate(-9deg)}30%{transform:rotate(8deg)}
  45%{transform:rotate(-6deg)}60%{transform:rotate(4deg)}75%{transform:rotate(-2deg)}}
@keyframes pe-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes pe-sparkle{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .pe-card,.pe-icon,.pe-spark{animation:none!important}
}
`;

export default PopupEngine;
