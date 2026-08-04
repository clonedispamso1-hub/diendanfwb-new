import { useEffect, useState, useSyncExternalStore } from "react";
import { Star, Sparkles } from "lucide-react";
import { getXpState, subscribeXp, type XpState } from "@/lib/fwb-xp";

const EMPTY: XpState = { xp: 0, level: 1, expIntoLevel: 0, expForLevel: 1, nextThreshold: 1, percent: 0 };

export function XpProgressBar({ onOpenLiked, likedBadge }: { onOpenLiked?: () => void; likedBadge?: number }) {
  const state = useSyncExternalStore(subscribeXp, getXpState, () => EMPTY);
  const [bump, setBump] = useState(0);
  const [lastXp, setLastXp] = useState(state.xp);

  useEffect(() => {
    if (state.xp !== lastXp) {
      setBump((n) => n + 1);
      setLastXp(state.xp);
    }
  }, [state.xp, lastXp]);

  return (
    <div className="fwb-xp-bar">
      <div className="fwb-xp-bar__star" aria-hidden>
        <Star size={16} fill="#fff" />
      </div>
      <div className="fwb-xp-bar__main">
        <div className="fwb-xp-bar__row">
          <span className="fwb-xp-bar__level">Cấp {state.level}</span>
          <span key={bump} className="fwb-xp-bar__xp">
            <Sparkles size={11} /> {state.xp.toLocaleString("vi-VN")} XP
          </span>
          <span className="fwb-xp-bar__next">/ {state.nextThreshold.toLocaleString("vi-VN")}</span>
        </div>
        <div className="fwb-xp-bar__track">
          <div className="fwb-xp-bar__fill" style={{ width: `${state.percent}%` }} />
        </div>
      </div>
      {onOpenLiked ? (
        <button type="button" className="fwb-xp-bar__heart" onClick={onOpenLiked} aria-label="Đã thích">
          <span>❤</span>
          {likedBadge && likedBadge > 0 ? <span className="fwb-xp-bar__heart-badge">{likedBadge > 99 ? "99+" : likedBadge}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
