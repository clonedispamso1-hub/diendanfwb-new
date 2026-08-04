import { useEffect, useState } from "react";

/**
 * Small tooltip pointing to the three-dot button on the profile cover.
 * Only shown when viewing OTHER users' profile, once per user (localStorage).
 */
interface Props {
  targetUserId: string;
  /** Skip entirely for own profile. */
  disabled?: boolean;
}

const STORAGE_PREFIX = "coachmark:profile-more:v1:";

export function ProfileMoreCoachmark({ targetUserId, disabled }: Props) {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (disabled || !targetUserId) return;
    const key = STORAGE_PREFIX + targetUserId;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* ignore */
    }

    const showT = window.setTimeout(() => setVisible(true), 600);
    const fadeT = window.setTimeout(() => setFadeOut(true), 600 + 3800);
    const hideT = window.setTimeout(() => {
      setVisible(false);
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }, 600 + 3800 + 350);

    const dismiss = () => {
      setFadeOut(true);
      window.setTimeout(() => setVisible(false), 250);
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("pointerdown", dismiss, { once: true });

    return () => {
      window.clearTimeout(showT);
      window.clearTimeout(fadeT);
      window.clearTimeout(hideT);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [disabled, targetUserId]);

  if (disabled || !visible) return null;

  return (
    <div
      className={`pmc-tip${fadeOut ? " pmc-tip--out" : ""}`}
      role="tooltip"
      aria-live="polite"
    >
      <span className="pmc-tip__text">Xem thông tin của người này</span>
      <span className="pmc-tip__arrow" aria-hidden />
      <style>{`
        .pmc-tip {
          position: absolute;
          top: 56px;
          right: 12px;
          z-index: 8;
          max-width: 220px;
          padding: 8px 12px;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.3;
          color: #111827;
          background: rgba(255,255,255,0.96);
          border: 1px solid rgba(15,23,42,0.08);
          border-radius: 12px;
          box-shadow: 0 10px 30px -8px rgba(15,23,42,0.28), 0 2px 6px rgba(15,23,42,0.10);
          backdrop-filter: blur(8px);
          animation: pmc-in .28s ease-out both;
          pointer-events: none;
          white-space: normal;
        }
        .dark .pmc-tip {
          color: #f1f5f9;
          background: rgba(24,26,38,0.92);
          border-color: rgba(255,255,255,0.10);
          box-shadow: 0 12px 32px -10px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4);
        }
        .pmc-tip--out { animation: pmc-out .32s ease-in both; }
        .pmc-tip__arrow {
          position: absolute;
          top: -6px;
          right: 14px;
          width: 12px; height: 12px;
          background: inherit;
          border-left: 1px solid rgba(15,23,42,0.08);
          border-top: 1px solid rgba(15,23,42,0.08);
          transform: rotate(45deg);
          border-top-left-radius: 3px;
        }
        .dark .pmc-tip__arrow {
          border-left-color: rgba(255,255,255,0.10);
          border-top-color: rgba(255,255,255,0.10);
          background: rgba(24,26,38,0.92);
        }
        @keyframes pmc-in {
          from { opacity: 0; transform: translateY(-6px) scale(.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pmc-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(-4px) scale(.98); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pmc-tip, .pmc-tip--out { animation: none; }
        }
      `}</style>
    </div>
  );
}
