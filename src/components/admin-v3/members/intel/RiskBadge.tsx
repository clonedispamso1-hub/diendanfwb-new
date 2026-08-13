import { riskTone } from "@/lib/member-intel";

export function RiskBadge({ score, reasons }: { score: number; reasons?: string[] | null }) {
  const { tone, label } = riskTone(score);
  const dot = tone === "ok" ? "🟢" : tone === "warn" ? "🟡" : tone === "high" ? "🟠" : "🔴";
  return (
    <div className={`mi-risk ${tone}`} title={`${label}${reasons?.length ? "\n• " + reasons.join("\n• ") : ""}`}>
      <div className="mi-risk-num">{score}</div>
      <div className="mi-risk-lb">{dot} RISK</div>
    </div>
  );
}
