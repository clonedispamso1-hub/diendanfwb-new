import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function AdminShell({
  title,
  children,
  back = true,
}: {
  title: string;
  children: ReactNode;
  back?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          {back ? (
            <button
              type="button"
              aria-label="Quay lại"
              onClick={() => navigate(-1)}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted transition"
            >
              <ArrowLeft size={20} />
            </button>
          ) : null}
          <h1 className="text-base font-semibold">{title}</h1>
        </header>
        <div className="page-body p-4">{children}</div>
      </div>
    </main>
  );
}