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
  /** Tên nhóm/khu vực cho luồng tham gia VIP Zalo. */
  groupName?: string;
  message?: string;
  contactLink?: string | null;
  /** Class bổ sung cho popup card. Dùng để scope style riêng (vd: Album). */
  className?: string;
}

const CSS = `
.clp-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;
  justify-content:center;padding:16px;background:oklch(0.12 0.025 255/.6);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:clp-fade .18s ease both;}
.clp-card{position:relative;width:100%;max-width:380px;background:oklch(0.985 0.008 82);color:oklch(0.2 0.025 255);
  border:1px solid oklch(0.83 0.025 80/.75);border-radius:24px;overflow:hidden;
  box-shadow:0 28px 80px -28px oklch(0.13 0.03 255/.48),0 8px 24px -14px oklch(0.13 0.03 255/.22);
  display:flex;flex-direction:column;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);
  animation:clp-pop .24s cubic-bezier(.2,.8,.25,1) both;}
.dark .clp-card,[data-theme="dark"] .clp-card{background:oklch(0.22 0.025 255);color:oklch(0.94 0.01 82);}
.clp-head{position:relative;padding:28px 20px 20px;text-align:center;
  background:linear-gradient(145deg,oklch(0.97 0.018 82),oklch(0.93 0.028 80));color:inherit;border-bottom:1px solid oklch(0.83 0.025 80/.7);}
.dark .clp-head{background:oklch(0.25 0.028 255);}
.clp-head::after{content:"";position:absolute;left:50%;bottom:-1px;width:54px;height:2px;transform:translateX(-50%);background:oklch(0.62 0.12 78);}
.clp-media{width:76px;height:76px;margin:0 auto 12px;border-radius:18px;display:grid;
  place-items:center;font-size:38px;line-height:1;background:oklch(0.91 0.07 82);
  border:1px solid oklch(0.72 0.1 78/.4);box-shadow:0 12px 24px -17px oklch(0.4 0.1 78/.55);overflow:hidden;}
.clp-media img{width:100%;height:100%;object-fit:cover;}
.clp-title{margin:0;font-size:19px;font-weight:800;letter-spacing:.2px;line-height:1.35;}
.clp-feature{margin:8px 0 0;font-size:12px;font-weight:700;opacity:.85;}
.clp-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border:1px solid oklch(0.75 0.03 80/.7);
  border-radius:11px;display:grid;place-items:center;cursor:pointer;font-size:16px;
  line-height:1;color:inherit;background:oklch(0.99 0.005 82/.75);transition:background .15s ease,transform .15s ease;}
.clp-close:hover{background:oklch(0.93 0.025 82);transform:translateY(-1px);}
.clp-body{padding:16px 18px 4px;flex:1 1 auto;min-height:0;overflow-y:auto;
  -webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;}
.clp-msg{margin:0 0 12px;font-size:13.5px;line-height:1.6;text-align:center;
  color:oklch(0.49 0.025 255);white-space:pre-line;}
.dark .clp-msg{color:oklch(0.75 0.02 255);}
/* Dòng tiêu đề IN HOA trong nội dung (vd: "QUYỀN LỢI KHI THAM GIA") — to & nổi bật. */
.clp-msg-head{margin:14px 0 8px;font-size:18px;font-weight:850;line-height:1.3;
  text-align:center;letter-spacing:0;color:oklch(0.26 0.04 252);}
.clp-msg-head:first-child{margin-top:0;}
.clp-list{list-style:none;margin:0;padding:0;display:grid;gap:8px;
  max-height:200px;overflow-y:auto;-webkit-overflow-scrolling:touch;
  touch-action:pan-y;overscroll-behavior:contain;}
.clp-item{display:flex;gap:11px;align-items:center;padding:10px 12px;border-radius:14px;
  background:oklch(0.965 0.015 82);border:1px solid oklch(0.86 0.025 80/.65);}
.dark .clp-item{background:oklch(0.27 0.025 255);}
.clp-item__ic{flex:0 0 36px;height:36px;width:36px;border-radius:10px;display:grid;
  place-items:center;font-size:19px;background:oklch(0.91 0.07 82);box-shadow:none;overflow:hidden;}
.dark .clp-item__ic{background:rgba(255,255,255,.1);}
.clp-item__ic img{width:100%;height:100%;object-fit:cover;}
.clp-item__tt{margin:0;font-size:14px;font-weight:750;line-height:1.3;}
.clp-item__sb{margin:2px 0 0;font-size:12px;line-height:1.4;color:#7b8194;}
.dark .clp-item__sb{color:#a3aabb;}
.clp-actions{padding:14px 18px 18px;display:grid;gap:8px;flex-shrink:0;
  background:inherit;border-top:1px solid oklch(0.83 0.025 80/.6);}
.clp-btn{padding:12px 16px;border-radius:12px;font-size:15px;font-weight:800;
  border:1px solid transparent;cursor:pointer;transition:filter .16s ease;}
.clp-btn:hover{filter:brightness(1.06);}
.clp-btn--primary{color:oklch(0.99 0 0);box-shadow:0 12px 24px -16px oklch(0.25 0.05 252/.8);}
.clp-btn--ghost{background:transparent;color:#7b8194;border-color:rgba(120,124,140,.28);font-weight:700;}
/* Chỉ nút "Hướng dẫn tham gia": tia sáng vàng quét trái → phải → trái, lặp vô hạn. */
.clp-btn--shine{position:relative;overflow:hidden;isolation:isolate;
  border-color:rgba(234,179,8,.55);color:#a16207;
  box-shadow:0 0 12px -2px rgba(234,179,8,.35),0 0 4px rgba(234,179,8,.18);
  animation:clp-shine-glow 2.6s ease-in-out infinite;}
.dark .clp-btn--shine{color:#facc15;border-color:rgba(250,204,21,.5);}
.clp-btn--shine::before{content:"";position:absolute;top:0;bottom:0;left:-60%;width:55%;
  background:linear-gradient(100deg,transparent 0%,rgba(250,204,21,.18) 25%,
    rgba(253,224,71,.65) 50%,rgba(250,204,21,.18) 75%,transparent 100%);
  transform:skewX(-18deg);pointer-events:none;z-index:1;
  animation:clp-shine-sweep 2.6s ease-in-out infinite;}
.clp-btn--shine:hover{filter:none;}
@keyframes clp-shine-sweep{
  0%{left:-60%}
  50%{left:105%}
  100%{left:-60%}}
@keyframes clp-shine-glow{
  0%,100%{box-shadow:0 0 10px -2px rgba(234,179,8,.3),0 0 4px rgba(234,179,8,.15)}
  50%{box-shadow:0 0 16px -2px rgba(234,179,8,.5),0 0 6px rgba(234,179,8,.25)}}
@keyframes clp-fade{from{opacity:0}to{opacity:1}}
@keyframes clp-pop{from{opacity:0;transform:translate3d(0,14px,0) scale(.96)}to{opacity:1;transform:none}}
`;

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
          <button type="button" className="clp-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
          <div className="clp-media" aria-hidden="true">
            {isImage(media) ? <img loading="lazy" decoding="async" src={media} alt="" /> : media}
          </div>
          <h2 className="clp-title">{headTitle}</h2>
          {featureName ? <p className="clp-feature">Tính năng: {featureName}</p> : null}
        </div>

        <div className="clp-body" data-scroll-lock-ignore>
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
          <button
            type="button"
            className="clp-btn clp-btn--ghost clp-btn--shine"
            onClick={goToGuide}
          >
            Hướng dẫn tham gia
          </button>

        </div>
      </div>
      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

export default CommonLockedPopup;
