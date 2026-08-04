import { useEffect, useState } from "react";
import { PremiumMoonIcon, PremiumSunIcon } from "@/components/candy/premium-icons";

const THEME_KEY = "ddx-theme";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  // Mặc định luôn khởi động ở Light Mode (không theo prefers-color-scheme).
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.transition = "background-color 240ms ease, color 240ms ease";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  if (!mounted) {
    return <button className="theme-toggle hdr-icon-btn hdr-icon-btn--premium" aria-label="Đổi chế độ" type="button" />;
  }

  return (
    <button
      className="theme-toggle hdr-icon-btn hdr-icon-btn--premium"
      onClick={toggle}
      aria-label={theme === "light" ? "Chuyển sang nền tối" : "Chuyển sang nền sáng"}
      title={theme === "light" ? "Nền tối" : "Nền sáng"}
      type="button"
    >
      {theme === "light" ? <PremiumMoonIcon size={20} /> : <PremiumSunIcon size={20} />}
    </button>
  );
}
