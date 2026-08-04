import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { getPendingPenalties, shiftPendingPenalty, getReputation } from "./reputation-store";
import { pushNotification } from "./audit-log";
import type { ReputationPenalty } from "./reputation-store";

/* Popup xuất hiện đúng 1 lần cho mỗi lần bị trừ điểm.
   Sau khi user bấm "Đã hiểu" → lưu vào Notifications. */
export function ReputationPopupHost() {
  const [current, setCurrent] = useState<ReputationPenalty | null>(null);

  useEffect(() => {
    const pop = () => {
      if (!current) {
        const q = getPendingPenalties();
        if (q.length > 0) {
          const next = shiftPendingPenalty();
          if (next) setCurrent(next);
        }
      }
    };
    pop();
    window.addEventListener("ddx:reputation-pending", pop);
    return () => window.removeEventListener("ddx:reputation-pending", pop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const score = getReputation();
  const lowWarn = score < 70;

  const close = () => {
    pushNotification({
      title: `Bạn vừa bị trừ ${current.amount} điểm uy tín`,
      body: `Lý do: ${current.reason}. Điểm uy tín hiện tại: ${score}.`,
    });
    setCurrent(null);
    // Cho phép popup kế tiếp trong queue nổi lên
    setTimeout(() => window.dispatchEvent(new CustomEvent("ddx:reputation-pending")), 0);
  };

  return (
    <div className="rd-modal-backdrop" onClick={close}>
      <div
        className="rd-modal rd-rep-popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="rd-modal-close" onClick={close} aria-label="Đóng">
          <X size={16} />
        </button>
        <div className="rd-rep-popup-icon">
          <ShieldAlert size={28} />
        </div>
        <h2>Bạn vừa bị trừ {current.amount} điểm uy tín.</h2>
        <div className="rd-rep-popup-reason">
          <span className="rd-label">Lý do:</span>
          <p>{current.reason}</p>
        </div>
        <div className={`rd-rep-popup-note ${lowWarn ? "is-danger" : ""}`}>
          Điểm uy tín hiện tại: <b>{score}</b>
          <br />
          Nếu điểm uy tín dưới 70, tài khoản sẽ bị khóa vĩnh viễn.
        </div>
        <button className="rd-btn-primary" onClick={close}>
          Đã hiểu
        </button>
      </div>
    </div>
  );
}
