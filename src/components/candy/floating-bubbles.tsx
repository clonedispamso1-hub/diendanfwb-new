/**
 * Floating Bubbles — Floating Action Buttons (Fanpage / Nhóm Zalo).
 * Premium redesign: glassmorphism, spring animation, glow hover, ripple click.
 * - Mặc định thu gọn: chỉ một FAB "+".
 * - Bấm "+" → hiện Facebook / Zalo + nút "Thu gọn" ở trên cùng.
 * - Không còn nút ✕ riêng trên từng bong bóng.
 * - Config: RPC get_site_setting('floating_bubbles').
 */
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Portal } from "@/components/candy/portal";

type BubbleCfg = {
  enabled: boolean;
  title: string;
  url: string;
  icon: string; // emoji hoặc URL ảnh
  color?: string; // màu nền (hex hoặc gradient CSS)
};
type Cfg = {
  enabled: boolean;
  zalo: BubbleCfg;
  facebook: BubbleCfg;
};

export const BUBBLE_DEFAULT_COLORS = { zalo: "#0068ff", facebook: "#1877f2" };

const DEFAULT: Cfg = {
  enabled: true,
  zalo: { enabled: true, title: "Nhóm Zalo", url: "https://zalo.me/", icon: "📱", color: BUBBLE_DEFAULT_COLORS.zalo },
  facebook: { enabled: true, title: "Fanpage Admin", url: "https://facebook.com/", icon: "👍", color: BUBBLE_DEFAULT_COLORS.facebook },
};

const LS_COLLAPSED = "fwbvn.floating-bubble.collapsed.v1";

/** Logo Facebook chính thức (f xanh) */
function FacebookLogo() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden focusable="false">
      <path
        fill="#fff"
        d="M13.5 21.9V14.2h2.6l.5-3.03h-3.1V9.2c0-.87.24-1.47 1.5-1.47h1.7V5.02c-.3-.04-1.3-.13-2.47-.13-2.45 0-4.13 1.5-4.13 4.24v2.04H7.4v3.03h2.7v7.7h3.4z"
      />
    </svg>
  );
}

/** Logo Zalo chính thức (chữ Zalo trắng trên nền xanh) */
function ZaloLogo() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-hidden focusable="false">
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontFamily="Arial Rounded MT Bold, Arial, Helvetica, sans-serif"
        fontSize="17"
        fontWeight="700"
        fill="#fff"
        letterSpacing="-0.5"
      >
        Zalo
      </text>
    </svg>
  );
}

const OFFICIAL_LOGO: Record<string, () => ReactElement> = {
  facebook: FacebookLogo,
  zalo: ZaloLogo,
};

function normalize(v: Partial<Cfg> | null | undefined): Cfg {
  const src = (v && typeof v === "object" ? v : {}) as Partial<Cfg>;
  return {
    enabled: src.enabled ?? true,
    zalo: { ...DEFAULT.zalo, ...(src.zalo ?? {}) },
    facebook: { ...DEFAULT.facebook, ...(src.facebook ?? {}) },
  };
}

/** Ripple mềm khi click */
function ripple(e: React.MouseEvent<HTMLElement>) {
  const host = e.currentTarget;
  const r = host.getBoundingClientRect();
  const span = document.createElement("span");
  span.className = "fabx__ripple";
  const size = Math.max(r.width, r.height) * 2;
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${e.clientX - r.left - size / 2}px`;
  span.style.top = `${e.clientY - r.top - size / 2}px`;
  host.appendChild(span);
  window.setTimeout(() => span.remove(), 620);
}

export function FloatingBubbles() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [open, setOpen] = useState(false);

  const fetchCfg = useCallback(async () => {
    try {
      const { data } = await (supabase as any).rpc("get_site_setting", { _key: "floating_bubbles" });
      setCfg(normalize(data));
    } catch {
      setCfg(DEFAULT);
    }
  }, []);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(LS_COLLAPSED) === "0");
    } catch { /* noop */ }
    void fetchCfg();
    const onChanged = () => { void fetchCfg(); };
    window.addEventListener("floating-bubbles:changed", onChanged);
    return () => window.removeEventListener("floating-bubbles:changed", onChanged);
  }, [fetchCfg]);

  const setOpenPersist = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(LS_COLLAPSED, next ? "0" : "1"); } catch { /* noop */ }
  };

  if (!cfg || !cfg.enabled) return null;

  const items = ([
    { key: "facebook", cfg: cfg.facebook },
    { key: "zalo", cfg: cfg.zalo },
  ] as const).filter((it) => it.cfg.enabled && it.cfg.url);
  if (!items.length) return null;

  return (
    <Portal>
      <div className={`fabx${open ? " is-open" : ""}`} aria-label="Liên kết nhanh">
        <button
          type="button"
          className="fabx__hide"
          onClick={(e) => { ripple(e); setOpenPersist(false); }}
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          aria-label="Thu gọn liên kết nhanh"
        >
          <ChevronDown size={13} strokeWidth={2.6} />
          Thu gọn
        </button>

        {items.map(({ key, cfg: b }, i) => {
          const isImg = /^https?:\/\//i.test(b.icon);
          const color = b.color || BUBBLE_DEFAULT_COLORS[key];
          const Logo = OFFICIAL_LOGO[key];
          return (
            <div
              key={key}
              className="fabx__item"
              style={{
                ["--fabx-color" as string]: color,
                transitionDelay: `${(open ? i : items.length - 1 - i) * 60}ms`,
              }}
            >
              <span className="fabx__label">{b.title}</span>
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fabx__btn"
                title={b.title}
                aria-label={b.title}
                tabIndex={open ? 0 : -1}
                onClick={ripple}
              >
                <span className="fabx__icon" aria-hidden>
                  {isImg ? <img loading="lazy" decoding="async" src={b.icon} alt="" /> : (Logo ? <Logo /> : <span>{b.icon || "🔗"}</span>)}
                </span>
                <span className="fabx__pulse" aria-hidden />
              </a>
            </div>
          );
        })}

        <button
          type="button"
          className="fabx__toggle"
          onClick={(e) => { ripple(e); setOpenPersist(!open); }}
          aria-expanded={open}
          aria-label={open ? "Thu gọn liên kết nhanh" : "Hiện liên kết nhanh"}
        >
          <Plus size={20} strokeWidth={2.6} />
        </button>
      </div>
    </Portal>
  );
}
