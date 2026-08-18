/**
 * CommonLockedPopup — POPUP KHOÁ TÍNH NĂNG DUY NHẤT của toàn website.
 *
 * Mọi tính năng khoá (Kết bạn Zalo, Facebook, Xem số điện thoại, Live Móc,
 * Voice Call, Video Call, Chat bị khoá…) đều gọi component này.
 * Nội dung lấy từ Admin Panel → "Quản lý Popup Chung".
 *
 * Thiết kế: card trắng, bo góc, shadow nhẹ, fade 160ms + scale 0.96 → 1.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
import { useVipUnlockLink } from "@/lib/vip-unlock-link";
import { useVipUnlockConfig } from "@/lib/vip-unlock-config";

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
  justify-content:center;padding:16px;background:rgba(15,18,28,.45);
  animation:clp-fade .16s ease both;}
.clp-card{width:100%;max-width:360px;background:#fff;color:#151823;border-radius:16px;
  padding:22px 20px;box-shadow:0 10px 30px rgba(0,0,0,.14);text-align:center;
  animation:clp-pop .16s ease both;}
.clp-icon{font-size:32px;line-height:1;margin-bottom:10px;}
.clp-icon img{width:48px;height:48px;border-radius:12px;object-fit:cover;}
.clp-title{margin:0 0 8px;font-size:17px;font-weight:800;letter-spacing:.2px;color:#151823;}
.clp-msg{margin:0;font-size:14px;line-height:1.55;color:#4a4f5e;white-space:pre-line;}
.clp-feature{margin:0 0 8px;font-size:12px;font-weight:700;color:#8a8f9e;}
.clp-list{list-style:none;margin:12px auto 0;padding:0;display:grid;gap:6px;
  text-align:left;max-width:230px;font-size:14px;color:#333846;}
.clp-actions{margin-top:18px;display:grid;gap:8px;}
.clp-btn{padding:11px 16px;border-radius:10px;font-size:14px;font-weight:700;
  border:1px solid transparent;cursor:pointer;}
.clp-btn--primary{color:#fff;}
.clp-btn--ghost{background:#fff;color:#5b6070;border-color:#e2e4ea;}
@keyframes clp-fade{from{opacity:0}to{opacity:1}}
@keyframes clp-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
`;

export function CommonLockedPopup({ open, onClose, featureName }: CommonLockedPopupProps) {
  const cfg = useVipUnlockConfig();
  const fallbackLink = useVipUnlockLink();
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

  const icon = (cfg.icon || "🔒").trim();
  const iconIsImage = /^(https?:\/\/|\/|data:image)/i.test(icon);
  const headTitle = cfg.title.trim();
  const body = cfg.message.trim();

  const openSupport = () => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) openExternalLinkWithFeedback(link);
    else window.location.assign(link.startsWith("/") ? link : `/${link}`);
    onClose();
  };

  return createPortal(
    <div className="clp-overlay" role="dialog" aria-modal="true" aria-label={headTitle} onClick={onClose}>
      <div className="clp-card" onClick={(e) => e.stopPropagation()}>
        <div className="clp-icon" aria-hidden="true">
          {iconIsImage ? <img src={icon} alt="" /> : icon}
        </div>
        <h2 className="clp-title">{headTitle}</h2>
        {featureName ? <p className="clp-feature">Tính năng: {featureName}</p> : null}
        <p className="clp-msg">{body}</p>
        {cfg.benefits.length > 0 && (
          <ul className="clp-list">
            {cfg.benefits.map((b) => (
              <li key={b}>✓ {b}</li>
            ))}
          </ul>
        )}
        <div className="clp-actions">
          <button
            type="button"
            className="clp-btn clp-btn--primary"
            style={{ background: cfg.buttonColor }}
            onClick={openSupport}
            disabled={!link}
          >
            {cfg.buttonLabel}
          </button>
          <button type="button" className="clp-btn clp-btn--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

export default CommonLockedPopup;
