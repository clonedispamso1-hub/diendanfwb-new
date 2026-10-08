import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Premium SOC (Security Operations Center) auth layout.
 * Dark cyber theme, animated grid, neon-blue glow, glassmorphism.
 */
export function AdminAuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="soc-auth relative min-h-screen w-full overflow-hidden flex items-center justify-center px-4 py-10">
      {/* Cyber grid */}
      <div className="soc-grid" aria-hidden />
      {/* Ambient glow orbs */}
      <div className="soc-orb soc-orb-1" aria-hidden />
      <div className="soc-orb soc-orb-2" aria-hidden />
      {/* Scanlines */}
      <div className="soc-scan" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <div className="soc-card p-7 sm:p-9">
          <div className="text-center mb-7">
            <div className="soc-shield mx-auto mb-5">
              <span className="soc-shield-ring" />
              <span className="soc-shield-ring soc-shield-ring-2" />
              <ShieldCheck className="relative z-10 text-cyan-300" size={34} strokeWidth={2.2} />
            </div>
            <div className="soc-badge mb-3">
              <span className="soc-badge-dot" /> SECURE ACCESS
            </div>
            <h1 className="soc-title">{title}</h1>
            {subtitle ? <p className="soc-subtitle mt-2">{subtitle}</p> : null}
          </div>
          {children}
        </div>
        <p className="mt-5 text-center text-[11px] uppercase tracking-[0.25em] text-cyan-200/40">
          Internal Security Console · Authorized personnel only
        </p>
      </div>
    </main>
  );
}

export function AdminField({
  icon,
  children,
  error,
  hint,
}: {
  icon: ReactNode;
  children: ReactNode;
  error?: string | null;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div
        className={`soc-field flex items-center gap-3 rounded-xl px-4 py-3 transition ${
          error ? "soc-field-error" : ""
        }`}
      >
        <span className="text-cyan-300/80 shrink-0">{icon}</span>
        {children}
      </div>
      {error ? (
        <p className="text-xs text-rose-400 pl-2">{error}</p>
      ) : hint ? (
        <p className="text-xs text-cyan-200/40 pl-2">{hint}</p>
      ) : null}
    </div>
  );
}

export const adminInputCls =
  "w-full bg-transparent outline-none text-sm text-cyan-50 placeholder:text-cyan-200/30 tracking-wide";

export const adminPrimaryBtnCls = "soc-btn-primary w-full py-3 font-semibold tracking-wide";
