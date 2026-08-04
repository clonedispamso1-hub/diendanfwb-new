import type { ReactNode } from "react";

export function ModuleShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="adm-module">
      <div className="adm-module-header">
        <div>
          <h3 className="adm-module-title">{title}</h3>
          {subtitle ? <p className="adm-module-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="adm-module-actions">{actions}</div> : null}
      </div>
      <div className="adm-module-body">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className={`adm-stat adm-stat-${tone}`}>
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
      {hint ? <div className="adm-stat-hint">{hint}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "healthy" || status === "active" || status === "ok"
      ? "good"
      : status === "degraded" || status === "warning" || status === "warn"
        ? "warn"
        : status === "down" || status === "critical" || status === "bad"
          ? "bad"
          : "neutral";
  return <span className={`adm-badge adm-badge-${tone}`}>{status}</span>;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}
