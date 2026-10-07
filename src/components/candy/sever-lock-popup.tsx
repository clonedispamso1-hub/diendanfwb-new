import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CountryFlag, type CountryFlagType } from "@/components/candy/country-flag";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useSeverTimer } from "@/hooks/use-sever-timer";
import { SEVER_PHASE_DURATION_MS } from "@/lib/sever-timing";
import { SeverProgress } from "./sever-progress";
import "@/styles/sever-lock.css";

export const SEVER_LOCK_DURATION_MS = SEVER_PHASE_DURATION_MS;

function LockChain({ side }: { side: "top" | "bottom" }) {
  return (
    <div className={`sever-lock-chain sever-lock-chain--${side}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <svg key={index} viewBox="0 0 30 18" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="4" width="18" height="10" rx="5" />
          <rect x="11" y="4" width="18" height="10" rx="5" />
        </svg>
      ))}
    </div>
  );
}

/** Shown after any regional Sever tap: all regional Severs are locked. */
export function SeverLockPopup({ location, country, onReturnToMixed, portalTarget }: {
  location: string;
  country: CountryFlagType;
  onReturnToMixed: () => void;
  portalTarget?: HTMLElement;
}) {
  const { progress } = useSeverTimer(onReturnToMixed);
  const dialogRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock();

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="sever-lock-backdrop">
      <div className="sever-lock-card" role="alertdialog" aria-modal="true" data-state="open"
        aria-labelledby="sever-lock-title" aria-describedby="sever-lock-location sever-lock-return"
        ref={dialogRef} tabIndex={-1}
        onKeyDown={(event) => { if (event.key === "Tab") event.preventDefault(); }}>
        <LockChain side="top" /><LockChain side="bottom" />
        <div className="sever-lock-medallion" aria-hidden="true">
          <CountryFlag country={country} className="sever-lock-flag" />
        </div>
        <p className="sever-lock-eyebrow">SEVER ĐANG KHÓA</p>
        <h2 className="sever-lock-title" id="sever-lock-title">
          Không mở được <span className="sever-lock-title__loc">{location}</span>
        </h2>
        <p className="sever-lock-desc" id="sever-lock-location">
          Vì bạn <strong>chưa tham gia VIP ZALO</strong> khu&nbsp;vực <span className="sever-lock-desc__loc">{location}</span>.
        </p>
        <p className="sever-lock-return" id="sever-lock-return">Bạn sẽ được đưa về Sever Hỗn Tạp</p>
        <div className="sever-lock-progress">
          <SeverProgress value={progress} />
        </div>
      </div>
    </div>, portalTarget ?? document.body,
  );
}
