import { useEffect, useState } from "react";
import { ShieldAlert, X, Clock, MessageCircle } from "lucide-react";
import {
  formatRemaining,
  type RestrictionKind,
  type RestrictionRow,
} from "@/services/restrictions.service";
import { friendlyRestrictionMessage } from "@/lib/friendly-restrictions";
import { useAdminContactUrl } from "@/lib/use-admin-contact";

interface BlockedDetail {
  restriction: RestrictionRow;
  kind: RestrictionKind;
}

/**
 * Global host — listens to `ddx:restriction-blocked` and renders a
 * premium modal explaining the blocked action + remaining time.
 *
 * Mount ONCE, near the app root.
 */
export function RestrictionPopupHost() {
  const [current, setCurrent] = useState<BlockedDetail | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<BlockedDetail>).detail;
      if (!detail?.restriction) return;
      setCurrent(detail);
    };
    window.addEventListener("ddx:restriction-blocked", handler as EventListener);
    return () => window.removeEventListener("ddx:restriction-blocked", handler as EventListener);
  }, []);

  // Live-refresh countdown once per second while open.
  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [current]);

  if (!current) return null;
  const { restriction, kind } = current;
  const isPermanent = !restriction.expires_at;
  const friendly = friendlyRestrictionMessage(`RESTRICTED:${kind}:${isPermanent ? "permanent" : "temp"}`);
  const close = () => setCurrent(null);
  return <RestrictionPopupBody restriction={restriction} friendly={friendly} isPermanent={isPermanent} onClose={close} />;
}

function RestrictionPopupBody({
  restriction, friendly, isPermanent, onClose,
}: {
  restriction: RestrictionRow; friendly: string; isPermanent: boolean; onClose: () => void;
}) {
  const contactUrl = useAdminContactUrl();
  return (
    <div className="rd-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="rd-modal rd-restriction-popup" onClick={(e) => e.stopPropagation()}>
        <button className="rd-modal-close" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        <div className="rd-rep-popup-icon"><ShieldAlert size={28} /></div>
        <h2>{friendly}</h2>

        <div className="rd-rep-popup-reason">
          <span className="rd-label">Lý do:</span>
          <p>{restriction.reason?.trim() || "Vi phạm quy định cộng đồng."}</p>
        </div>

        <div className={`rd-rep-popup-note ${isPermanent ? "is-danger" : ""}`}>
          <Clock size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          {isPermanent ? (
            <>Hạn chế <b>vĩnh viễn</b>.</>
          ) : (
            <>Thời gian còn lại: <b>{formatRemaining(restriction.expires_at)}</b></>
          )}
        </div>

        <div className="rd-locked-actions" style={{ marginTop: 16 }}>
          <button className="rd-btn-ghost" onClick={onClose}>Đã hiểu</button>
          <a className="rd-btn-primary" href={contactUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} /> Liên hệ Admin
          </a>
        </div>
      </div>
    </div>
  );
}