// Popup "Cộng đồng VIP Zalo" — UI ONLY, dùng chung style popup toàn site.
// Link nhóm VIP + link nhắn tin Admin lấy từ Admin Panel (connect_settings, cache sẵn).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Users, Crown, MessageCircle } from "lucide-react";
import { adminContactLink, fetchConnectConfig, vipGroupLink } from "@/lib/connect/radar-match";

export interface CommunityVipModalProps {
  open: boolean;
  /** Khu vực của tài khoản đang xem (VD: "TP.HCM", "Bình Dương") */
  region?: string | null;
  /** Chỉ hiện "Liên hệ Admin" + "Đóng" (dùng ở hồ sơ người khác) */
  adminOnly?: boolean;
  onClose: () => void;
  onJoin?: () => void;
}


export function CommunityVipModal({ open, region, adminOnly, onClose, onJoin }: CommunityVipModalProps) {
  const [links, setLinks] = useState<{ vip: string; admin: string }>({ vip: "", admin: "" });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void fetchConnectConfig().then((cfg) => {
      if (!alive) return;
      setLinks({ vip: vipGroupLink(cfg, region), admin: adminContactLink(cfg) });
    });
    return () => {
      alive = false;
    };
  }, [open, region]);

  if (!open) return null;
  if (typeof document === "undefined") return null;
  const area = (region || "").trim() || "của bạn";

  const openLink = (url: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return createPortal(
    <div
      className="ui-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Cộng đồng VIP Zalo"
      onClick={onClose}
    >
      <div className="ui-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Đóng">
          <X size={16} />
        </button>

        <div className="ui-modal-icon" aria-hidden="true">
          <Users size={26} />
        </div>

        <h2>Cộng đồng VIP Zalo</h2>
        <p>
          Bạn chưa tham gia <strong>Cộng đồng VIP Zalo khu vực {area}</strong> nên chưa thể sử dụng
          tính năng này.
        </p>

        <div className="ui-modal-actions">
          {!adminOnly && (
            <button
              type="button"
              className="ui-modal-btn ui-modal-btn--primary"
              onClick={() => (onJoin ? onJoin() : openLink(links.vip))}
              disabled={!links.vip && !onJoin}
            >
              <Crown size={16} />
              <span>Tham gia cộng đồng VIP</span>
            </button>
          )}
          <button
            type="button"
            className={`ui-modal-btn ${adminOnly ? "ui-modal-btn--primary" : "ui-modal-btn--secondary"}`}
            onClick={() => openLink(links.admin)}
            disabled={!links.admin}
          >
            <MessageCircle size={16} />
            <span>Liên hệ Admin</span>
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

export default CommunityVipModal;
