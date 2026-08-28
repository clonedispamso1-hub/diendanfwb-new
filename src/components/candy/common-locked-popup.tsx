/**
 * CommonLockedPopup — POPUP KHOÁ TÍNH NĂNG DUY NHẤT của toàn website.
 *
 * Mọi tính năng khoá (Kết bạn Zalo, Facebook, Xem số điện thoại, Live Móc,
 * Voice Call, Video Call, Chat bị khoá…) đều gọi component này.
 * Nội dung lấy từ Admin Panel → "Quản lý Popup Chung".
 *
 * Thiết kế: Telegram Premium — bo góc lớn, header media, danh sách feature,
 * nút CTA gradient, nút X đóng ở góc phải trên.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "@/components/candy/auth-provider";
import { useVipUnlockLink } from "@/lib/vip-unlock-link";
import { useVipUnlockConfig, renderLocationText } from "@/lib/vip-unlock-config";

/** Giữ export cũ để không vỡ call-site đang import. */
export const VIP_UNLOCK_BENEFITS = [
  "Kết bạn Zalo",
  "Xem số Zalo",
  "Voice Call",
  "Video Call",
  "Live Móc",
  "Hỗ trợ Admin",
] as const;

export interface CommonLockedPopupProps {
  open: boolean;
  onClose: () => void;
  /** Tên tính năng bị khoá (chỉ hiển thị 1 dòng nhỏ, không đổi giao diện). */
  featureName?: string;
  /** Các prop cũ chỉ giữ để không vỡ call-site — KHÔNG còn tác dụng ghi đè. */
  variant?: string;
  title?: string;
  message?: string;
  contactLink?: string | null;
}

const CSS = `
.clp-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;
  justify-content:center;padding:16px;background:rgba(10,14,24,.62);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  animation:clp-fade .18s ease both;}
.clp-card{position:relative;width:100%;max-width:380px;background:#fff;color:#151823;
  border-radius:22px;overflow:hidden;box-shadow:0 24px 60px -18px rgba(8,12,26,.55);
  display:flex;flex-direction:column;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);
  animation:clp-pop .22s cubic-bezier(.2,.8,.3,1) both;}
.dark .clp-card,[data-theme="dark"] .clp-card{background:#171a21;color:#e9ecf3;}
.clp-head{position:relative;padding:26px 20px 18px;text-align:center;
  background:linear-gradient(160deg,#3b82f6 0%,#6366f1 55%,#8b5cf6 100%);color:#fff;}
.clp-head::after{content:"";position:absolute;inset:auto 0 -1px;height:26px;
  background:inherit;border-radius:0 0 26px 26px;}
.clp-media{width:78px;height:78px;margin:0 auto 12px;border-radius:22px;display:grid;
  place-items:center;font-size:40px;line-height:1;background:rgba(255,255,255,.16);
  box-shadow:0 10px 26px -12px rgba(0,0,0,.5);overflow:hidden;}
.clp-media img{width:100%;height:100%;object-fit:cover;}
.clp-title{margin:0;font-size:19px;font-weight:800;letter-spacing:.2px;line-height:1.35;}
.clp-feature{margin:8px 0 0;font-size:12px;font-weight:700;opacity:.85;}
.clp-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;
  border-radius:999px;display:grid;place-items:center;cursor:pointer;font-size:17px;
  line-height:1;color:#fff;background:rgba(255,255,255,.2);transition:background .15s ease;}
.clp-close:hover{background:rgba(255,255,255,.34);}
.clp-body{padding:16px 18px 4px;flex:1 1 auto;min-height:0;overflow-y:auto;
  -webkit-overflow-scrolling:touch;}
.clp-msg{margin:0 0 12px;font-size:13.5px;line-height:1.55;text-align:center;
  color:#5b6070;white-space:pre-line;}
.dark .clp-msg{color:#aab0bf;}
.clp-list{list-style:none;margin:0;padding:0;display:grid;gap:8px;
  max-height:200px;overflow-y:auto;-webkit-overflow-scrolling:touch;}
.clp-item{display:flex;gap:11px;align-items:center;padding:10px 12px;border-radius:14px;
  background:rgba(99,102,241,.07);}
.dark .clp-item{background:rgba(255,255,255,.06);}
.clp-item__ic{flex:0 0 36px;height:36px;width:36px;border-radius:12px;display:grid;
  place-items:center;font-size:19px;background:#fff;box-shadow:0 4px 12px -6px rgba(20,24,40,.4);overflow:hidden;}
.dark .clp-item__ic{background:rgba(255,255,255,.1);}
.clp-item__ic img{width:100%;height:100%;object-fit:cover;}
.clp-item__tt{margin:0;font-size:14px;font-weight:750;line-height:1.3;}
.clp-item__sb{margin:2px 0 0;font-size:12px;line-height:1.4;color:#7b8194;}
.dark .clp-item__sb{color:#a3aabb;}
.clp-actions{padding:14px 18px 18px;display:grid;gap:8px;flex-shrink:0;
  background:inherit;border-top:1px solid rgba(120,124,140,.12);}
.clp-btn{padding:12px 16px;border-radius:14px;font-size:15px;font-weight:800;
  border:1px solid transparent;cursor:pointer;transition:filter .16s ease;}
.clp-btn:hover{filter:brightness(1.06);}
.clp-btn--primary{color:#fff;box-shadow:0 12px 26px -14px rgba(59,130,246,.9);}
.clp-btn--ghost{background:transparent;color:#7b8194;border-color:rgba(120,124,140,.28);font-weight:700;}
@keyframes clp-fade{from{opacity:0}to{opacity:1}}
@keyframes clp-pop{from{opacity:0;transform:translate3d(0,14px,0) scale(.96)}to{opacity:1;transform:none}}
`;

const isImage = (v: string) => /^(https?:\/\/|\/|data:image)/i.test(v);

export function CommonLockedPopup({ open, onClose, featureName }: CommonLockedPopupProps) {
  const cfg = useVipUnlockConfig();
  const fallbackLink = useVipUnlockLink();
  const { me } = useAuth();
  const link = (cfg.link || fallbackLink || "").trim();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const area = ((me as any)?.province || (me as any)?.location || "") as string;
  const rt = (t: string) => renderLocationText(t, area, cfg.defaultLocation);
  const headTitle = rt(cfg.title);
  const body = rt((cfg.message || "").trim());
  const buttonText = rt(cfg.buttonLabel || "Liên Hệ Admin");
  const media = (cfg.headerMedia || cfg.icon || "🔒").trim();

  const openSupport = () => {
    if (!link) return;
    const url = /^https?:\/\//i.test(link) ? link : link.startsWith("/") ? link : `https://${link}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return createPortal(
    <div className="clp-overlay" role="dialog" aria-modal="true" aria-label={headTitle} onClick={onClose}>
      <div className="clp-card" onClick={(e) => e.stopPropagation()}>
        <div className="clp-head">
          <button type="button" className="clp-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
          <div className="clp-media" aria-hidden="true">
            {isImage(media) ? <img loading="lazy" decoding="async" src={media} alt="" /> : media}
          </div>
          <h2 className="clp-title">{headTitle}</h2>
          {featureName ? <p className="clp-feature">Tính năng: {featureName}</p> : null}
        </div>

        <div className="clp-body">
          {body ? <p className="clp-msg">{body}</p> : null}
          {cfg.features.length > 0 && (
            <ul className="clp-list">
              {cfg.features.map((f, i) => (
                <li className="clp-item" key={`${f.title}-${i}`}>
                  <span className="clp-item__ic" aria-hidden="true">
                    {isImage(f.icon) ? <img loading="lazy" decoding="async" src={f.icon} alt="" /> : f.icon || "✨"}
                  </span>
                  <span>
                    <p className="clp-item__tt">{rt(f.title)}</p>
                    {f.subtitle ? <p className="clp-item__sb">{rt(f.subtitle)}</p> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="clp-actions">
          <button
            type="button"
            className="clp-btn clp-btn--primary"
            style={{ background: cfg.buttonColor }}
            onClick={openSupport}
            disabled={!link}
          >
            {buttonText}
          </button>
          <button type="button" className="clp-btn clp-btn--ghost" onClick={onClose}>
            Để sau
          </button>
        </div>
      </div>
      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

export default CommonLockedPopup;
