/**
 * PopupCard — phần hiển thị của popup (dùng chung cho website và bản xem trước
 * trong Admin Panel). Nền luôn đặc, chữ luôn tương phản cao.
 */
import { X, Facebook, MessageCircle, Globe } from "lucide-react";
import { getTemplate } from "@/lib/popup-templates";
import type { PopupItem } from "@/lib/popup-api";

export interface PopupCardProps {
  popup: PopupItem;
  onClose?: () => void;
  dsa?: boolean;
  onDsaChange?: (v: boolean) => void;
  /** số popup trong hàng đợi + vị trí hiện tại */
  total?: number;
  index?: number;
  showDsa?: boolean;
}

export function PopupCard({
  popup,
  onClose,
  dsa = false,
  onDsaChange,
  total = 1,
  index = 0,
  showDsa = true,
}: PopupCardProps) {
  const tpl = getTemplate(popup.template);
  const textColor = popup.textColor || tpl.textColor;
  const links = [
    popup.facebook && { href: popup.facebook, icon: Facebook, label: "Facebook" },
    popup.zalo && { href: popup.zalo, icon: MessageCircle, label: "Zalo" },
    popup.website && { href: popup.website, icon: Globe, label: "Website" },
  ].filter(Boolean) as { href: string; icon: typeof Globe; label: string }[];

  return (
    <div
      className={`pr-card pr-anim-${tpl.animation}`}
      style={{
        background: tpl.background,
        boxShadow: `${tpl.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        border: `1px solid ${tpl.ring}`,
        color: textColor,
      }}
    >
      <div className="pr-decor" aria-hidden="true">
        {tpl.decor.map((d, i) => (
          <span
            key={i}
            className="pr-decor-item"
            style={{
              left: `${8 + i * 21}%`,
              animationDelay: `${i * 0.9}s`,
              animationDuration: `${7 + i}s`,
            }}
          >
            {d}
          </span>
        ))}
      </div>

      <button
        className="pr-close"
        onClick={onClose}
        type="button"
        aria-label="Đóng popup"
      >
        <X size={18} strokeWidth={2.6} />
      </button>

      <div className="pr-body">
        <div className="pr-badge">
          <span className="pr-badge-emoji">{tpl.emoji}</span>
        </div>

        {popup.imageUrl && (
          <div className="pr-media">
            <img src={popup.imageUrl} alt={popup.title} loading="lazy" />
          </div>
        )}

        <h2
          className="pr-title"
          style={{ fontSize: Math.round(popup.fontSize * 1.65), color: textColor }}
        >
          {popup.title || tpl.defaults.title}
        </h2>

        {popup.content && (
          <p
            className="pr-content"
            style={{
              fontSize: popup.fontSize,
              color: popup.textColor || tpl.mutedColor,
            }}
          >
            {popup.content}
          </p>
        )}

        {popup.buttonText && (
          <a
            className="pr-cta"
            href={popup.website || popup.facebook || popup.zalo || "#"}
            target={
              popup.website || popup.facebook || popup.zalo ? "_blank" : undefined
            }
            rel="noopener noreferrer"
            style={{ background: tpl.buttonBg, color: tpl.buttonColor }}
          >
            {popup.buttonText}
          </a>
        )}

        {links.length > 0 && (
          <div className="pr-links">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="pr-link"
                style={{ color: textColor, borderColor: tpl.ring }}
              >
                <l.icon size={15} />
                {l.label}
              </a>
            ))}
          </div>
        )}

        {showDsa && (
          <label className="pr-dsa" style={{ color: tpl.mutedColor }}>
            <input
              type="checkbox"
              checked={dsa}
              onChange={(e) => onDsaChange?.(e.target.checked)}
            />
            Không hiển thị lại trong 24 giờ
          </label>
        )}

        {total > 1 && (
          <div className="pr-dots" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={i === index ? "on" : ""} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const POPUP_CARD_CSS = `
.pr-card{position:relative;width:100%;max-width:430px;max-height:90vh;overflow-y:auto;
  border-radius:26px;opacity:1;isolation:isolate;}
.pr-card::-webkit-scrollbar{width:0}
.pr-decor{position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:26px}
.pr-decor-item{position:absolute;top:-10%;font-size:22px;opacity:.5;
  font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
  animation:pr-float linear infinite;}
.pr-close{position:absolute;top:14px;right:14px;z-index:3;width:34px;height:34px;
  display:grid;place-items:center;border:none;border-radius:999px;cursor:pointer;
  background:rgba(255,255,255,.92);color:#111827;
  box-shadow:0 6px 16px rgba(0,0,0,.25);transition:transform .18s ease, background .18s ease;}
.pr-close:hover{transform:rotate(90deg) scale(1.06);background:#fff}
.pr-body{position:relative;z-index:2;padding:34px 26px 26px;text-align:center;}
.pr-badge{width:74px;height:74px;margin:0 auto 16px;border-radius:24px;display:grid;
  place-items:center;background:rgba(255,255,255,.18);
  border:1px solid rgba(255,255,255,.35);
  box-shadow:0 12px 30px rgba(0,0,0,.2);animation:pr-bob 3.2s ease-in-out infinite;}
.pr-badge-emoji{font-size:38px;line-height:1;
  font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.pr-media{margin:0 0 18px;border-radius:18px;overflow:hidden;
  border:1px solid rgba(255,255,255,.3);box-shadow:0 14px 30px rgba(0,0,0,.22);}
.pr-media img{display:block;width:100%;max-height:210px;object-fit:cover}
.pr-title{margin:0 0 10px;font-weight:800;line-height:1.25;letter-spacing:-.01em;
  text-shadow:0 2px 10px rgba(0,0,0,.22)}
.pr-content{margin:0;line-height:1.6;white-space:pre-wrap}
.pr-cta{display:inline-block;margin-top:20px;padding:13px 30px;border-radius:999px;
  font-weight:800;text-decoration:none;font-size:15px;
  box-shadow:0 12px 26px rgba(0,0,0,.28);transition:transform .18s ease, box-shadow .18s ease;}
.pr-cta:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 16px 34px rgba(0,0,0,.34)}
.pr-links{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px}
.pr-link{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;
  font-size:13px;font-weight:600;text-decoration:none;border:1px solid;
  background:rgba(255,255,255,.14);transition:background .18s ease, transform .18s ease}
.pr-link:hover{background:rgba(255,255,255,.28);transform:translateY(-1px)}
.pr-dsa{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;
  font-size:13px;cursor:pointer;user-select:none}
.pr-dsa input{width:16px;height:16px;accent-color:#fff;cursor:pointer}
.pr-dots{display:flex;gap:6px;justify-content:center;margin-top:14px}
.pr-dots span{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.4)}
.pr-dots span.on{width:18px;background:rgba(255,255,255,.95)}
@keyframes pr-fade{from{opacity:0}to{opacity:1}}
@keyframes pr-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes pr-float{0%{transform:translateY(-40px) rotate(0)}
  100%{transform:translateY(110vh) rotate(360deg)}}
.pr-anim-fade{animation:pr-in-fade .45s cubic-bezier(.22,1,.36,1) both}
.pr-anim-zoom{animation:pr-in-zoom .5s cubic-bezier(.34,1.56,.64,1) both}
.pr-anim-slide-up{animation:pr-in-up .5s cubic-bezier(.22,1,.36,1) both}
.pr-anim-drop{animation:pr-in-drop .6s cubic-bezier(.34,1.4,.64,1) both}
@keyframes pr-in-fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pr-in-zoom{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}
@keyframes pr-in-up{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
@keyframes pr-in-drop{from{opacity:0;transform:translateY(-56px) rotate(-3deg)}
  to{opacity:1;transform:none}}
@media (max-width:480px){
  .pr-card{max-width:100%;border-radius:22px}
  .pr-body{padding:28px 18px 22px}
  .pr-badge{width:64px;height:64px;border-radius:20px}
  .pr-badge-emoji{font-size:32px}
}
@media (prefers-reduced-motion: reduce){
  .pr-decor-item,.pr-badge{animation:none}
}
`;
