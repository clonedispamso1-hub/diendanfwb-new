import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { getReputation, isLockedUser } from "./reputation-store";

/* Badge màu theo mức uy tín:
   100–90: Xanh · 89–70: Vàng · Dưới 70: Đỏ */
export function reputationTier(score: number) {
  if (score >= 90) return { color: "#22c55e", bg: "rgba(34,197,94,0.15)", label: "Uy tín cao" };
  if (score >= 70) return { color: "#fbbf24", bg: "rgba(251,191,36,0.15)", label: "Uy tín trung bình" };
  return { color: "#ef4444", bg: "rgba(239,68,68,0.15)", label: "Uy tín thấp" };
}

export function ReputationBadge({ score, small }: { score: number; small?: boolean }) {
  const t = reputationTier(score);
  return (
    <span
      className="rd-rep-badge"
      style={{
        color: t.color,
        background: t.bg,
        borderColor: t.color + "55",
        padding: small ? "2px 6px" : "3px 8px",
        fontSize: small ? "0.7rem" : "0.75rem",
      }}
    >
      {score} · {t.label}
    </span>
  );
}

/* Icon ổ khóa đỏ nếu tài khoản đã bị khóa vì uy tín */
export function LockedIcon({ uid, size = 12 }: { uid: string; size?: number }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const check = () => setLocked(isLockedUser(uid));
    check();
    window.addEventListener("ddx:locked-users-change", check);
    return () => window.removeEventListener("ddx:locked-users-change", check);
  }, [uid]);
  if (!locked) return null;
  return (
    <Lock
      size={size}
      color="#ef4444"
      style={{ marginLeft: 4, verticalAlign: "middle" }}
      aria-label="Tài khoản đã bị khóa"
    />
  );
}

/* Hook đọc điểm uy tín của current user (mock) */
export function useCurrentReputation() {
  const [score, setScore] = useState<number>(() => getReputation());
  useEffect(() => {
    const upd = () => setScore(getReputation());
    upd();
    window.addEventListener("ddx:reputation-change", upd);
    return () => window.removeEventListener("ddx:reputation-change", upd);
  }, []);
  return score;
}
