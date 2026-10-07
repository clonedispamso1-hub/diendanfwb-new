/**
 * SeverTransitionOverlay — màn hình đen "Đang chuyển Sever…" phủ toàn viewport.
 * UI-only: logo website + spinner trái tim vàng + tên khu vực đang chuyển tới.
 * Thời gian + dòng trạng thái chạy theo src/lib/server-transition.ts (không đổi logic sever).
 */
import { createPortal } from "react-dom";
import { SeverFlowLogo } from "./sever-flow-logo";
import { SeverProgress } from "./sever-progress";
import { useSeverTimer } from "@/hooks/use-sever-timer";
import {
  SERVER_TRANSITION_STATUSES,
} from "@/lib/server-transition";
import "@/styles/sever-transition.css";

export function SeverTransitionOverlay({
  region,
  onClose,
  portalTarget,
}: {
  region: string;
  onClose: () => void;
  portalTarget?: HTMLElement;
}) {
  const { elapsed, progress } = useSeverTimer(onClose);

  const status = [...SERVER_TRANSITION_STATUSES]
    .reverse()
    .find((s) => elapsed >= s.at)?.label;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="sever-transition" role="status" aria-live="polite">
      <span className="sever-transition__glow" aria-hidden="true" />
      <div className="sever-transition__stage">
        <div className="sever-transition__logo">
          <SeverFlowLogo />
          <span className="sever-transition__led" aria-hidden="true" />
        </div>
        <div className="sever-transition__loader" aria-hidden="true">
          <span className="sever-transition__ring" />
          <span className="sever-transition__heart" />
        </div>
        <p className="sever-transition__title">Đang chuyển Sever…</p>
        <div className="sever-transition__region">
          <span className="sever-transition__dot" aria-hidden="true" />
          <span className="sever-transition__region-name">{region}</span>
        </div>
        <SeverProgress value={progress} />
      </div>
      <div className="sever-transition__footer" aria-hidden="true">
        <span className="sever-transition__footer-line" />
        <span className="sever-transition__status">{status}</span>
      </div>
    </div>,
    portalTarget ?? document.body,
  );
}

export default SeverTransitionOverlay;
