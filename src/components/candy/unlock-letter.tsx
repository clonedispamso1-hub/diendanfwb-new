/**
 * UnlockLetter — UI thay thế popup "Cộng đồng VIP Zalo".
 * Chuỗi hiệu ứng: xích rung → ổ khóa sáng → xích đứt → ánh sáng → phong bì mở → thư trượt lên.
 * Chỉ UI/UX — logic & link Admin giữ nguyên (fetchCommunityPage).
 */
import { useEffect, useRef, useState } from "react";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";

export interface UnlockLetterProps {
  open: boolean;
  onClose: () => void;
  /** Giữ tương thích API cũ — dữ liệu luôn lấy từ "Quản lý Popup Chung". */
  adminProfileLink?: string;
  perks?: string[];
  featureName?: string;
}

/** UnlockLetter — CẦU NỐI tới popup DUY NHẤT CommonLockedPopup. */
export function UnlockLetter({ open, onClose, featureName }: UnlockLetterProps) {
  return <CommonLockedPopup open={open} onClose={onClose} featureName={featureName} />;
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