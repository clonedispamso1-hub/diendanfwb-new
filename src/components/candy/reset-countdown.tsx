/**
 * Đếm ngược tới lần reset dữ liệu chat kế tiếp (mỗi 72 giờ).
 * Dùng chung cho Notification panel và Admin Panel — không hardcode thời gian.
 */
import { useEffect, useState } from "react";
import { countdownTo, formatCountdown, nextResetAt, type Countdown } from "@/lib/message-retention";

export function useResetCountdown(): { target: number; c: Countdown } {
  const [target, setTarget] = useState(() => nextResetAt());
  const [c, setC] = useState(() => countdownTo(target));
  useEffect(() => {
    const tick = () => {
      const t = nextResetAt();
      setTarget(t);
      setC(countdownTo(t));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return { target, c };
}

/** Banner nhỏ: "Dữ liệu sẽ được làm mới sau: 2 ngày 13 giờ 15 phút". */
export function ResetCountdownBanner({ withSeconds = false }: { withSeconds?: boolean }) {
  const { c } = useResetCountdown();
  return (
    <div className="border-b border-border/60 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
      ⏳ Dữ liệu sẽ được làm mới sau: {formatCountdown(c, withSeconds)}
    </div>
  );
}

/**
 * Đồng hồ đếm ngược cố định phía trên trang Tin nhắn.
 * 100% tính bằng JavaScript từ mốc reset — không ghi DB, không tốn dung lượng.
 * UI: thanh pill bar siêu gọn, 1 dòng duy nhất.
 */
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function MessageResetCountdown({ inline = false }: { inline?: boolean } = {}) {
  const { c } = useResetCountdown();
  const text = `${c.days}d${pad2(c.hours)}h${pad2(c.minutes)}m${pad2(c.seconds)}s`;

  return (
    <div
      className={inline ? "msg-reset-countdown msg-reset-countdown--inline" : "msg-reset-countdown flex justify-center"}
      style={inline ? undefined : { position: "sticky", top: 0, zIndex: 20, marginBottom: 8 }}
      aria-live="off"
    >
      <span
        className="font-mono text-[12px] font-bold tabular-nums tracking-tight"
        style={{
          padding: "3px 10px",
          borderRadius: 999,
          border: "1px solid rgba(245,158,11,0.28)",
          background: "linear-gradient(135deg, rgba(254,243,199,0.92), rgba(253,230,138,0.86))",
          color: "#7c2d12",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {text}
      </span>
    </div>
  );
}
