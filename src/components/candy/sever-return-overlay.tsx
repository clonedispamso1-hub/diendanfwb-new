import { createPortal } from "react-dom";
import { SeverFlowLogo } from "./sever-flow-logo";
import { SeverProgress } from "./sever-progress";
import { useSeverTimer } from "@/hooks/use-sever-timer";
import { SEVER_PHASE_DURATION_MS } from "@/lib/sever-timing";

export const SEVER_RETURN_DURATION_MS = SEVER_PHASE_DURATION_MS;

export function SeverReturnOverlay({ onComplete, portalTarget }: {
  onComplete: () => void;
  portalTarget: HTMLElement;
}) {
  const { progress } = useSeverTimer(onComplete);

  return createPortal(
    <div className="sever-return" role="status" aria-live="polite">
      <SeverFlowLogo />
      <p className="sever-return__label">ĐANG CHUYỂN VỀ</p>
      <h2 className="sever-return__title">SEVER HỖN TẠP</h2>
      <SeverProgress value={progress} />
    </div>, portalTarget,
  );
}