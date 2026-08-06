/**
 * UnlockLetter — UI thay thế popup "Cộng đồng VIP Zalo".
 * Chuỗi hiệu ứng: xích rung → ổ khóa sáng → xích đứt → ánh sáng → phong bì mở → thư trượt lên.
 * Chỉ UI/UX — logic & link Admin giữ nguyên (fetchCommunityPage).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Heart } from "lucide-react";
import { fetchCommunityPage } from "@/lib/connect/community-content";
import { openExternalLinkWithFeedback } from "@/lib/external-link";

export interface UnlockLetterProps {
  open: boolean;
  onClose: () => void;
  /** Ghi đè link hồ sơ Admin (mặc định đọc từ Admin Panel). */
  adminProfileLink?: string;
  perks?: string[];
}

const DEFAULT_PERKS = [
  "Kết bạn Zalo",
  "Xem số Zalo",
  "Gửi lời mời",
  "Hỗ trợ trực tiếp từ Admin",
];

export function UnlockLetter({ open, onClose, adminProfileLink, perks }: UnlockLetterProps) {
  const [link, setLink] = useState(adminProfileLink || "");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (adminProfileLink) { setLink(adminProfileLink); return; }
    if (!open) return;
    let alive = true;
    void fetchCommunityPage().then((cfg) => {
      if (!alive) return;
      setLink((cfg.admin_profile_link || cfg.admin_url || "").trim());
    });
    return () => { alive = false; };
  }, [open, adminProfileLink]);

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 460);
  };

  const openAdmin = () => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) openExternalLinkWithFeedback(link);
    else window.location.assign(link.startsWith("/") ? link : `/${link}`);
    requestClose();
  };

  return createPortal(
    <div
      className={`ulk-scrim${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Mở khóa tính năng"
      onClick={requestClose}
    >
      <div className="ulk-letter" onClick={(e) => e.stopPropagation()}>
        <span className="ulk-flap" aria-hidden="true" />
        <button type="button" className="ulk-x" onClick={requestClose} aria-label="Đóng">
          <X size={16} />
        </button>

        <div className="ulk-env" aria-hidden="true">✉️</div>

        <h2 className="ulk-title">🔓 MỞ KHÓA TÍNH NĂNG</h2>
        <p className="ulk-text">
          Bạn hiện chưa tham gia
          <br />
          <strong>Cộng Đồng VIP Zalo</strong>.
        </p>
        <p className="ulk-sub">Tham gia cộng đồng sẽ mở khóa:</p>
        <ul className="ulk-perks">
          {(perks || DEFAULT_PERKS).map((p) => (
            <li key={p}><span className="ulk-check">✓</span>{p}</li>
          ))}
        </ul>

        <div className="ulk-actions">
          <button type="button" className="ulk-btn ulk-btn--ghost" onClick={requestClose}>
            Đóng
          </button>
          <button
            type="button"
            className="ulk-btn ulk-btn--pink"
            onClick={openAdmin}
            disabled={!link}
          >
            <Heart size={15} />
            <span>Liên hệ Admin</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Tiếng "keng" nhỏ khi ổ khóa bật (WebAudio, không tải file). */
function playClink() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [1180, 2360].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(i ? 0.05 : 0.11, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch { /* noop */ }
}

const STRAP_LINKS = 9;

/**
 * Nút "Kết bạn Zalo" ở trạng thái khóa: 2 sợi xích kim loại 3D quấn chéo,
 * ổ khóa vàng ở giữa (nhấp nháy + sparkle). Click → rung → tách khóa →
 * xích bung ra → mắt xích rơi → nút sáng lên → hiện lá thư (~820ms).
 */
export function ZaloLockedButton({ onClick }: { onClick: () => void }) {
  const [breaking, setBreaking] = useState(false);
  const [gone, setGone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const handleClick = () => {
    if (breaking) return;
    if (gone) { onClick(); return; }
    setBreaking(true);
    playClink();
    timer.current = window.setTimeout(() => {
      onClick();
      setBreaking(false);
      setGone(true);
    }, 820);
  };

  const strap = (dir: 1 | -1) => (
    <span className="zlk-strap" style={{ ["--dir" as string]: dir }}>
      {Array.from({ length: STRAP_LINKS }, (_, i) => (
        <i
          key={i}
          className={`zlk-link${i % 2 ? " zlk-link--flat" : ""}`}
          style={{ ["--i" as string]: Math.abs(i - (STRAP_LINKS - 1) / 2) + 1 }}
        />
      ))}
    </span>
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`ulk-locked-btn${breaking ? " is-breaking" : ""}`}
      aria-label="Kết bạn Zalo — cần tham gia Cộng Đồng VIP"
    >
      <span className="ulk-locked-btn__txt">Kết bạn Zalo</span>

      {!gone ? (
        <span className="zlk" aria-hidden="true">
          <span className="zlk-sheen" />
          {strap(-1)}
          {strap(1)}

          <span className="zlk-lock">
            <span className="zlk-lock__shackle" />
            <span className="zlk-lock__body" />
            <span className="zlk-lock__glow" />
          </span>

          <span className="zlk-sparkles">
            <i style={{ ["--sx" as string]: "-38px", ["--sy" as string]: "-12px", ["--sd" as string]: "0ms" }} />
            <i style={{ ["--sx" as string]: "26px", ["--sy" as string]: "-16px", ["--sd" as string]: "420ms" }} />
            <i style={{ ["--sx" as string]: "44px", ["--sy" as string]: "12px", ["--sd" as string]: "900ms" }} />
            <i style={{ ["--sx" as string]: "-20px", ["--sy" as string]: "14px", ["--sd" as string]: "1300ms" }} />
          </span>

          <span className="ulk-spark" />
        </span>
      ) : null}
    </button>
  );
}


export default UnlockLetter;