/**
 * PopupCard — phần hiển thị của popup (dùng chung cho website và bản xem trước
 * trong Admin Panel). Nền luôn đặc, chữ luôn tương phản cao.
 */
import { X, Facebook, MessageCircle, Globe, Megaphone, Check } from "lucide-react";
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
  /** Nhãn nút “Không hiển thị lại trong N phút”. */
  snoozeLabel?: string;
  /** Nhãn checkbox “Không hiển thị lại trong [chu kỳ]”. */
  dsaLabel?: string;
  /** Giao diện cao cấp chỉ dùng cho popup phía người dùng. */
  variant?: "classic" | "premium";
}

export function PopupCard({
  popup,
  onClose,
  dsa = false,
  onDsaChange,
  total = 1,
  index = 0,
  showDsa = true,
  snoozeLabel,
  dsaLabel,
  variant = "classic",
}: PopupCardProps) {
  const tpl = getTemplate(popup.template);
  const isPremium = variant === "premium";
  const textColor = popup.textColor || tpl.textColor;
  const links = [
    popup.facebook && { href: popup.facebook, icon: Facebook, label: "Facebook" },
    popup.zalo && { href: popup.zalo, icon: MessageCircle, label: "Zalo" },
    popup.website && { href: popup.website, icon: Globe, label: "Website" },
  ].filter(Boolean) as { href: string; icon: typeof Globe; label: string }[];

  return (
    <div
      className={`pr-card ${isPremium ? "pr-card--premium" : ""} pr-anim-${tpl.animation}`}
      style={isPremium ? undefined : {
          background: tpl.background,
          boxShadow: `${tpl.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
          border: `1px solid ${tpl.ring}`,
          color: textColor,
        }}
    >
      {!isPremium && (
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
      )}

      <button
        className="pr-close"
        onClick={onClose}
        type="button"
        aria-label="Đóng popup"
      >
        <X size={18} strokeWidth={2.6} />
      </button>

      <div className="pr-body">
        {isPremium ? (
          <div className="pr-premium-heading">
            <div className="pr-badge" aria-hidden="true">
              <Megaphone size={27} strokeWidth={2.15} />
            </div>
            <div className="pr-heading-copy">
              <span className="pr-eyebrow">Thông báo</span>
              <h2 className="pr-title">{popup.title || tpl.defaults.title}</h2>
            </div>
          </div>
        ) : (
          <div className="pr-badge">
            <span className="pr-badge-emoji">{tpl.emoji}</span>
          </div>
        )}

        {popup.imageUrl && (
          <div className="pr-media">
            <img decoding="async" src={popup.imageUrl} alt={popup.title} loading="lazy" />
          </div>
        )}

        {!isPremium && (
          <h2
            className="pr-title"
            style={{ fontSize: Math.round(popup.fontSize * 1.65), color: textColor }}
          >
            {popup.title || tpl.defaults.title}
          </h2>
        )}

        {popup.content && (
          <p
            className="pr-content"
            style={isPremium ? { fontSize: popup.fontSize } : {
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
            style={isPremium ? undefined : { background: tpl.buttonBg, color: tpl.buttonColor }}
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
                rel="noopener noreferrer"
                className="pr-link"
                style={isPremium ? undefined : { color: textColor, borderColor: tpl.ring }}
              >
                <l.icon size={15} />
                {l.label}
              </a>
            ))}
          </div>
        )}

        {showDsa && (
          <label className="pr-dsa" style={isPremium ? undefined : { color: tpl.mutedColor }}>
            <input
              type="checkbox"
              checked={dsa}
              onChange={(e) => onDsaChange?.(e.target.checked)}
            />
            {isPremium && <span className="pr-checkmark" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>}
            {dsaLabel || "Không hiển thị lại trong 24 giờ"}
          </label>
        )}

        {snoozeLabel && (
          <button
            type="button"
            className="pr-snooze"
            onClick={onClose}
              style={isPremium ? undefined : { color: textColor, borderColor: tpl.ring }}
          >
            {snoozeLabel}
          </button>
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
.pr-card--premium{--pr-blue:#0a84ff;--pr-blue-deep:#2563eb;--pr-blue-soft:#60a5fa;
  --pr-ink:#10213f;--pr-copy:#52627d;--pr-surface:#f8fbff;--pr-line:rgba(255,255,255,.58);
  max-width:410px;border:1px solid var(--pr-line);border-radius:28px;color:var(--pr-ink);
  overflow:hidden;background:linear-gradient(145deg,rgba(248,251,255,.94),rgba(228,241,255,.84));
  box-shadow:0 28px 70px -24px rgba(10,84,255,.48),0 18px 42px -24px rgba(16,33,63,.3),
    inset 0 1px 0 rgba(255,255,255,.92);font-family:"Epilogue","Be Vietnam Pro",sans-serif;
  backdrop-filter:blur(24px) saturate(145%);}
.pr-card--premium::before{content:"";position:absolute;inset:0 0 auto;height:148px;z-index:-1;
  background:linear-gradient(128deg,rgba(10,132,255,.18),rgba(96,165,250,.08) 58%,transparent);}
.pr-card--premium::after{content:"";position:absolute;width:145px;height:145px;right:-65px;top:-72px;
  border-radius:50%;z-index:-1;background:rgba(10,132,255,.12);filter:blur(8px);}
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
.pr-card--premium .pr-close{top:18px;right:18px;width:32px;height:32px;color:var(--pr-copy);
  background:rgba(255,255,255,.58);border:1px solid rgba(255,255,255,.78);
  box-shadow:0 8px 22px rgba(16,33,63,.08);backdrop-filter:blur(12px);}
.pr-card--premium .pr-close:hover{transform:scale(1.06);background:rgba(255,255,255,.9);color:var(--pr-ink)}
.pr-card--premium .pr-body{padding:34px 30px 26px;text-align:left}
.pr-premium-heading{display:flex;align-items:flex-start;gap:16px;padding-right:36px;margin-bottom:24px}
.pr-card--premium .pr-badge{flex:0 0 auto;width:58px;height:58px;margin:0;border-radius:19px;color:white;
  background:linear-gradient(145deg,var(--pr-blue),var(--pr-blue-deep));
  border:1px solid rgba(255,255,255,.55);box-shadow:0 13px 28px -10px rgba(10,132,255,.7),
  inset 0 1px 0 rgba(255,255,255,.42);animation:pr-premium-float 4s ease-in-out infinite;}
.pr-heading-copy{min-width:0;padding-top:3px}
.pr-eyebrow{display:block;margin-bottom:5px;color:var(--pr-blue-deep);font-size:10px;font-weight:700;
  line-height:1.2;text-transform:uppercase;letter-spacing:0}
.pr-card--premium .pr-title{margin:0;color:var(--pr-ink);font-family:"Urbanist","Be Vietnam Pro",sans-serif;
  font-size:25px;font-weight:800;line-height:1.12;letter-spacing:0;text-shadow:none;overflow-wrap:anywhere}
.pr-media{margin:0 0 18px;border-radius:18px;overflow:hidden;
  border:1px solid rgba(255,255,255,.3);box-shadow:0 14px 30px rgba(0,0,0,.22);}
.pr-media img{display:block;width:100%;max-height:210px;object-fit:cover}
.pr-title{margin:0 0 10px;font-weight:800;line-height:1.25;letter-spacing:-.01em;
  text-shadow:0 2px 10px rgba(0,0,0,.22)}
.pr-content{margin:0;line-height:1.6;white-space:pre-wrap}
.pr-card--premium .pr-content{color:var(--pr-copy);font-weight:450;line-height:1.65;text-align:left}
.pr-cta{display:inline-block;margin-top:20px;padding:13px 30px;border-radius:999px;
  font-weight:800;text-decoration:none;font-size:15px;
  box-shadow:0 12px 26px rgba(0,0,0,.28);transition:transform .18s ease, box-shadow .18s ease;}
.pr-cta:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 16px 34px rgba(0,0,0,.34)}
.pr-card--premium .pr-cta{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;
  margin-top:25px;padding:13px 24px;color:white;background:linear-gradient(105deg,var(--pr-blue),var(--pr-blue-deep));
  box-shadow:0 15px 30px -13px rgba(10,132,255,.68),inset 0 1px 0 rgba(255,255,255,.3);
  font-size:14px;font-weight:700;letter-spacing:0}
.pr-card--premium .pr-cta:hover{transform:translateY(-2px);box-shadow:0 19px 36px -13px rgba(10,132,255,.76)}
.pr-links{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px}
.pr-link{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;
  font-size:13px;font-weight:600;text-decoration:none;border:1px solid;
  background:rgba(255,255,255,.14);transition:background .18s ease, transform .18s ease}
.pr-link:hover{background:rgba(255,255,255,.28);transform:translateY(-1px)}
.pr-card--premium .pr-links{margin-top:12px}
.pr-card--premium .pr-link{min-height:42px;padding:10px 20px;color:var(--pr-blue-deep);
  border-color:rgba(10,132,255,.18);background:rgba(255,255,255,.56);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.82),0 8px 22px rgba(37,99,235,.08);
  font-size:13px;font-weight:700;backdrop-filter:blur(12px)}
.pr-card--premium .pr-link:hover{color:white;background:var(--pr-blue);transform:translateY(-1px)}
.pr-dsa{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;
  font-size:13px;cursor:pointer;user-select:none}
.pr-dsa input{width:16px;height:16px;accent-color:#fff;cursor:pointer}
.pr-card--premium .pr-dsa{position:relative;justify-content:flex-start;margin:20px 2px 0;color:var(--pr-copy);
  font-size:11.5px;line-height:1.45}
.pr-card--premium .pr-dsa input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.pr-checkmark{display:grid;flex:0 0 20px;width:20px;height:20px;place-items:center;border-radius:7px;
  color:transparent;background:rgba(255,255,255,.64);border:1px solid rgba(82,98,125,.22);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9);transition:background .18s ease,border-color .18s ease,color .18s ease}
.pr-card--premium .pr-dsa input:checked + .pr-checkmark{color:white;background:var(--pr-blue);border-color:var(--pr-blue)}
.pr-card--premium .pr-dsa input:focus-visible + .pr-checkmark{outline:3px solid rgba(10,132,255,.2);outline-offset:2px}
.pr-snooze{margin:14px auto 0;display:block;background:rgba(255,255,255,.14);
  border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:9px 16px;
  font-size:12.5px;font-weight:700;cursor:pointer}
.pr-snooze:hover{background:rgba(255,255,255,.24)}
.pr-card--premium .pr-snooze{color:var(--pr-blue-deep);border-color:rgba(10,132,255,.18);
  background:rgba(255,255,255,.58)}
.pr-dots{display:flex;gap:6px;justify-content:center;margin-top:14px}
.pr-dots span{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.4)}
.pr-dots span.on{width:18px;background:rgba(255,255,255,.95)}
@keyframes pr-fade{from{opacity:0}to{opacity:1}}
@keyframes pr-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes pr-premium-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-4px) rotate(1deg)}}
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
.pr-card--premium.pr-anim-slide-up{animation:pr-premium-in .5s cubic-bezier(.22,1,.36,1) both}
@keyframes pr-premium-in{from{opacity:0;transform:translateY(14px) scale(.965)}to{opacity:1;transform:none}}
@media (max-width:480px){
  .pr-card{max-width:100%;border-radius:22px}
  .pr-body{padding:28px 18px 22px}
  .pr-badge{width:64px;height:64px;border-radius:20px}
  .pr-badge-emoji{font-size:32px}
  .pr-card--premium{width:min(100%,390px);max-height:calc(100dvh - 24px);border-radius:28px}
  .pr-card--premium .pr-body{padding:29px 21px 22px}
  .pr-premium-heading{gap:13px;padding-right:32px;margin-bottom:20px}
  .pr-card--premium .pr-badge{width:52px;height:52px;border-radius:17px}
  .pr-card--premium .pr-title{font-size:22px}
  .pr-card--premium .pr-content{font-size:14px!important;line-height:1.6}
  .pr-card--premium .pr-cta{min-height:48px;margin-top:22px}
}
@media (prefers-reduced-motion: reduce){
  .pr-decor-item,.pr-badge,.pr-card--premium.pr-anim-slide-up{animation:none}
}
`;
