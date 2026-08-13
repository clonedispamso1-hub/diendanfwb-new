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
 */
export function MessageResetCountdown() {
  const { c } = useResetCountdown();
  const cells: Array<{ v: number; l: string }> = [
    { v: c.days, l: "ngày" },
    { v: c.hours, l: "giờ" },
    { v: c.minutes, l: "phút" },
    { v: c.seconds, l: "giây" },
  ];
  return (
    <div
      className="msg-reset-countdown"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(245,158,11,0.35)",
        background: "linear-gradient(135deg, rgba(254,243,199,0.96), rgba(253,230,138,0.92))",
        color: "#7c2d12",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      aria-live="off"
    >
      <div style={{ fontSize: 12.5, fontWeight: 800 }}>⏳ Tin nhắn sẽ được làm mới sau:</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {cells.map((x) => (
          <div
            key={x.l}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "6px 4px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(180,83,9,0.18)",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
              {x.v}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75 }}>{x.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
