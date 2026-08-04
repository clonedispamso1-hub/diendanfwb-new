/**
 * VipCommunityPopup — popup "Cộng đồng VIP Zalo" DÙNG CHUNG cho toàn site.
 *
 * Dùng cho: Kết bạn Zalo, Xem Live, và mọi tính năng VIP sau này.
 * KHÔNG tạo popup riêng ở nơi khác — chỉ truyền vào title / message / adminProfileLink.
 *
 * - Khu vực trong nội dung LUÔN lấy theo tài khoản ĐANG ĐĂNG NHẬP (profile.province),
 *   không lấy theo hồ sơ đang xem. Không hardcode.
 * - Nút "Liên hệ Admin" mở "Link Hồ Sơ Admin" cấu hình trong Admin Panel
 *   (lưu ở Supabase #2). Admin đổi link là toàn site cập nhật ngay.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Users, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { fetchCommunityPage } from "@/lib/connect/community-content";

export interface VipCommunityPopupProps {
  open: boolean;
  onClose: () => void;
  /** Tiêu đề popup — mặc định "Cộng đồng VIP Zalo" */
  title?: string;
  /**
   * Nội dung popup. Nếu bỏ trống sẽ dùng nội dung chuẩn theo `featureLabel`.
   * Chuỗi `[KHU VỰC]` (nếu có) sẽ được thay bằng khu vực của tài khoản đang đăng nhập.
   */
  message?: string;
  /** VD: "Kết bạn Zalo" | "xem Live" — dùng để sinh nội dung chuẩn. */
  featureLabel?: string;
  /** Ghi đè link hồ sơ Admin (mặc định đọc từ Admin Panel / Supabase #2). */
  adminProfileLink?: string;
}

const DEFAULT_TITLE = "Cộng đồng VIP Zalo";

export function VipCommunityPopup({
  open,
  onClose,
  title,
  message,
  featureLabel = "tính năng này",
  adminProfileLink,
}: VipCommunityPopupProps) {
  const { me } = useAuth();
  const [link, setLink] = useState(adminProfileLink || "");

  // Khu vực = khu vực CHÍNH người đang xem đã đăng ký (không phải hồ sơ đang mở).
  const area =
    ((me as any)?.province || (me as any)?.region || (me as any)?.location || "").toString().trim() ||
    "của bạn";

  useEffect(() => {
    if (adminProfileLink) {
      setLink(adminProfileLink);
      return;
    }
    if (!open) return;
    let alive = true;
    void fetchCommunityPage().then((cfg) => {
      if (!alive) return;
      setLink((cfg.admin_profile_link || cfg.admin_url || "").trim());
    });
    return () => {
      alive = false;
    };
  }, [open, adminProfileLink]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const body = (message || `Bạn chưa tham gia Cộng đồng VIP Zalo khu vực [KHU VỰC].\nVui lòng tham gia Cộng đồng VIP Zalo khu vực này để ${featureLabel}.`)
    .replaceAll("[KHU VỰC]", area);
  const [firstLine, ...restLines] = body.split("\n");

  const openAdmin = () => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(link.startsWith("/") ? link : `/${link}`);
    }
    onClose();
  };

  return createPortal(
    <div
      className="ui-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title || DEFAULT_TITLE}
      onClick={onClose}
    >
      <div className="ui-modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Đóng">
          <X size={16} />
        </button>

        <div className="ui-modal-icon" aria-hidden="true">
          <Users size={26} />
        </div>

        <h2>{title || DEFAULT_TITLE}</h2>
        <p>
          {firstLine}
          {restLines.map((l) => (
            <span key={l}>
              <br />
              {l}
            </span>
          ))}
        </p>

        <div className="ui-modal-actions">
          <button
            type="button"
            className="ui-modal-btn ui-modal-btn--primary"
            onClick={openAdmin}
            disabled={!link}
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

export default VipCommunityPopup;
