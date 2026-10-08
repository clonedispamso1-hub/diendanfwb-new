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
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import "@/styles/vip-locked-popup.css";


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
  /** Tên nhóm/khu vực cho luồng tham gia VIP Zalo. */
  groupName?: string;
  message?: string;
  contactLink?: string | null;
  /** Class bổ sung cho popup card. Dùng để scope style riêng (vd: Album). */
  className?: string;
}

const isImage = (v: string) => /^(https?:\/\/|\/|data:image)/i.test(v);

export function CommonLockedPopup({ open, onClose, featureName, groupName, variant }: CommonLockedPopupProps) {
  const cfg = useVipUnlockConfig();
  const fallbackLink = useVipUnlockLink();
  const { me } = useAuth();
  const link = (cfg.link || fallbackLink || "").trim();
  void variant;

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
  // Tiêu đề LUÔN lấy từ Admin Panel → "Quản lý Popup Chung" ({location} thay động).
  // Không dùng tên nhóm để tạo tiêu đề riêng.
  void groupName;
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

  /**
   * Đóng popup rồi chuyển sang tab "Vip Zalo Tham Gia" trên chính trang hiện tại.
   * Không navigate sang route khác, không mở trang mới.
   */
  const goToGuide = () => {
    onClose();
    if (typeof window === "undefined") return;
    // Đánh dấu để FeedPage tự mở tab "Vip Zalo Tham Gia" ngay khi mount
    // (trường hợp popup đang mở ở trang khác trong app-shell).
    try {
      sessionStorage.setItem("goto-vip-zalo-tab", "1");
    } catch {
      /* ignore */
    }
    // AppShell (react-router MemoryRouter) lắng nghe event này để về "/" nếu cần,
    // FeedPage lắng nghe để switchTab("following") — không reload, không mở tab mới.
    window.dispatchEvent(new CustomEvent("goto-vip-zalo-tab"));
  };




  return createPortal(
    <div className="clp-overlay" role="dialog" aria-modal="true" aria-label={headTitle} onClick={onClose}>
      <div className="clp-card" onClick={(e) => e.stopPropagation()}>
        <div className="clp-head">
          <Button variant="ghost" type="button" className="clp-close" onClick={onClose} aria-label="Đóng">
            ✕
          </Button>
          <div className="clp-media" aria-hidden="true">
            {isImage(media) ? <img loading="lazy" decoding="async" src={media} alt="" /> : media}
          </div>
          <h2 className="clp-title">{headTitle}</h2>
          {featureName ? <p className="clp-feature">Tính năng: {featureName}</p> : null}
          <div className="clp-intro">
          {body
            ? body.split("\n").map((line, i) => {
                const t = line.trim();
                if (!t) return null;
                // Dòng IN HOA (vd: "QUYỀN LỢI KHI THAM GIA") → tiêu đề cỡ lớn.
                const isHeading =
                  t.length <= 60 && t === t.toLocaleUpperCase("vi-VN") && /\p{L}/u.test(t);
                return isHeading ? (
                  <p className="clp-msg-head" key={i}>
                    {t}
                  </p>
                ) : (
                  <p className="clp-msg" key={i}>
                    {t}
                  </p>
                );
              })
            : null}
          </div>
        </div>

        <div className="clp-body" data-scroll-lock-ignore>
          {cfg.features.length > 0 && (
            <Accordion type="multiple" className="clp-list">
              {cfg.features.map((f, i) => (
                <AccordionItem className="clp-item" key={`${f.title}-${i}`} value={`benefit-${i}`}>
                  <AccordionTrigger className="clp-item__trigger">
                    <span className="clp-item__ic" aria-hidden="true">
                      {isImage(f.icon) ? <img loading="lazy" decoding="async" src={f.icon} alt="" /> : f.icon || "✨"}
                    </span>
                    <span className="clp-item__tt">{rt(f.title)}</span>
                  </AccordionTrigger>
                  <AccordionContent className="clp-item__detail">
                    {f.subtitle ? <p className="clp-item__sb">{rt(f.subtitle)}</p> : null}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>

        <div className="clp-actions">
          <Button
            variant="ghost"
            type="button"
            className="clp-btn clp-btn--primary"
            style={{ background: cfg.buttonColor }}
            onClick={openSupport}
            disabled={!link}
          >
            {buttonText}
          </Button>
          <Button
            variant="ghost"
            type="button"
            className="clp-btn clp-btn--ghost clp-btn--shine"
            onClick={goToGuide}
          >
            Hướng dẫn tham gia
          </Button>

        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CommonLockedPopup;
