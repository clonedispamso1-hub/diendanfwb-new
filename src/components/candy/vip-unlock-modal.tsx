/**
 * VipUnlockModal — POPUP DUY NHẤT của toàn website cho mọi tính năng khoá VIP.
 *
 * Dùng cho: Gọi thoại, Gọi video, Live, Kết bạn Zalo, Xem số Zalo, Gửi lời mời…
 * KHÔNG tạo popup riêng ở nơi khác.
 *
 * Toàn bộ nội dung (tiêu đề, mô tả, icon, quyền lợi, nút, link Admin) lấy từ
 * Admin Panel → "Quản lý Popup VIP" (admin_site_settings.vip_unlock_popup).
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Lock,
  MessageCircle,
  Phone,
  Video,
  Heart,
  Radio,
  Sparkles,
  Crown,
  type LucideIcon,
} from "lucide-react";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
import { useVipUnlockLink } from "@/lib/vip-unlock-link";
import { resolveVariant, useVipUnlockConfig, type VipVariantKey } from "@/lib/vip-unlock-config";

const ICONS: Record<string, LucideIcon> = {
  lock: Lock,
  phone: Phone,
  video: Video,
  heart: Heart,
  radio: Radio,
  sparkles: Sparkles,
  message: MessageCircle,
  crown: Crown,
};

/** Giữ export cũ để không vỡ call-site đang import. */
export const VIP_UNLOCK_BENEFITS = [
  "Gọi Voice",
  "Video Call",
  "Live",
  "Kết bạn Zalo",
  "Xem số Zalo",
  "Hỗ trợ trực tiếp từ Admin",
] as const;

export interface VipUnlockModalProps {
  open: boolean;
  onClose: () => void;
  /** Biến thể tính năng — chỉ đổi tiêu đề/mô tả/icon, giao diện giữ nguyên. */
  variant?: VipVariantKey;
  /** Ghi đè tiêu đề (ưu tiên cao nhất). */
  title?: string;
  /** Ghi đè dòng mô tả. */
  message?: string;
  /** Ghi đè link Liên hệ Admin. */
  contactLink?: string | null;
}

export function VipUnlockModal({
  open,
  onClose,
  variant = "default",
  title,
  message,
  contactLink,
}: VipUnlockModalProps) {
  const cfg = useVipUnlockConfig();
  const resolved = resolveVariant(cfg, variant);
  const fallbackLink = useVipUnlockLink(contactLink);
  const link = (contactLink || resolved.link || fallbackLink || "").trim();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const Icon = ICONS[resolved.icon] || Lock;
  const headTitle = (title || resolved.title).trim();
  const body = (message || resolved.message).trim();

  const openAdmin = () => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) openExternalLinkWithFeedback(link);
    else window.location.assign(link.startsWith("/") ? link : `/${link}`);
    onClose();
  };

  return createPortal(
    <div
      className="ui-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={headTitle}
      onClick={onClose}
    >
      <div className="ui-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Đóng">
          <X size={16} />
        </button>

        <div className="ui-modal-icon" aria-hidden="true">
          <Icon size={26} />
        </div>

        <h2>🔒 {headTitle}</h2>
        <p>{body}</p>
        <p style={{ marginTop: 6, fontWeight: 600 }}>Tham gia Cộng Đồng VIP Zalo để mở khóa:</p>

        <ul
          style={{
            listStyle: "none",
            margin: "8px auto 4px",
            padding: 0,
            display: "grid",
            gap: 6,
            textAlign: "left",
            maxWidth: 260,
          }}
        >
          {resolved.benefits.map((b) => (
            <li key={b} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span aria-hidden="true">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="ui-modal-actions">
          <button
            type="button"
            className="ui-modal-btn ui-modal-btn--primary"
            onClick={openAdmin}
            disabled={!link}
          >
            <MessageCircle size={16} />
            <span>{resolved.buttonLabel}</span>
          </button>
          <button type="button" className="ui-modal-btn ui-modal-btn--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default VipUnlockModal;
