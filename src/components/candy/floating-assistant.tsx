/**
 * V5.5 — Bong bóng Trợ lý (Mini Chat).
 * - Kéo thả mượt (motion values) + snap mép, GIỚI HẠN trong vùng an toàn
 *   (không đè / không bị che bởi Header và Bottom Navigation).
 * - Thiết kế: trái tim 3D, glass, gradient hồng-tím, glow nhẹ,
 *   idle animation (thở) + ripple khi bấm — thuần CSS/Motion, không Lottie.
 * - Menu chỉ có chữ: Vào Nhóm VIP · Rút tiền · Chuyển xu · Liên hệ Admin · Đóng.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";

import { Portal } from "@/components/candy/portal";
import { useAdminContactUrl } from "@/lib/use-admin-contact";
import { useAssistantConfig } from "@/lib/assistant-config";
import { TransferCoinModal } from "@/components/candy/transfer-coin-modal";

const LS_POS = "fwbvn.assistant.pos.v4";
/** Kích thước panel để tính auto-positioning (không che bong bóng, không bị cắt). */
const PANEL_W = 232;
const PANEL_H = 320;
const PANEL_GAP = 10;
const SIZE = 58;
/** Khoảng cách an toàn bắt buộc so với Header / Bottom Nav / mép màn hình. */
const GAP = 20;

type Pos = { x: number; y: number };

function measure(selector: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  return r.height > 0 ? r.height : fallback;
}

/** Vùng kéo hợp lệ: Header + 20px, Bottom Nav + 20px, hai bên 20px. */
function bounds() {
  const headerH = measure(".app-header", 60);
  const dockH = measure(".ios-dock", 70);
  const top = headerH + GAP;
  const bottom = Math.max(top, window.innerHeight - dockH - GAP - SIZE);
  return {
    minX: GAP,
    maxX: Math.max(GAP, window.innerWidth - SIZE - GAP),
    minY: top,
    maxY: bottom,
  };
}

function clampPos(p: Pos): Pos {
  const b = bounds();
  return {
    x: Math.min(Math.max(p.x, b.minX), b.maxX),
    y: Math.min(Math.max(p.y, b.minY), b.maxY),
  };
}

/**
 * V6 — Auto positioning: popup mở lên trên / xuống dưới / sang cạnh bong bóng,
 * tuyệt đối không che bong bóng và không bị cắt bởi viewport.
 * Trả về offset TƯƠNG ĐỐI so với bong bóng (bong bóng là gốc 0,0).
 */
function panelOffset(bx: number, by: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const headerH = measure(".app-header", 60);
  const dockH = measure(".ios-dock", 70);
  const safeTop = headerH + GAP / 2;
  const safeBottom = vh - dockH - GAP / 2;

  const spaceBelow = safeBottom - (by + SIZE) - PANEL_GAP;
  const spaceAbove = by - safeTop - PANEL_GAP;

  let left: number;
  let top: number;

  if (spaceBelow >= PANEL_H) {
    top = by + SIZE + PANEL_GAP; // mở xuống
  } else if (spaceAbove >= PANEL_H) {
    top = by - PANEL_H - PANEL_GAP; // gần đáy → mở lên
  } else {
    // Không đủ chỗ trên/dưới → mở sang cạnh, canh dọc trong vùng an toàn.
    top = Math.min(Math.max(by + SIZE / 2 - PANEL_H / 2, safeTop), Math.max(safeTop, safeBottom - PANEL_H));
    const spaceRight = vw - (bx + SIZE) - PANEL_GAP - GAP;
    if (spaceRight >= PANEL_W) left = bx + SIZE + PANEL_GAP;
    else left = bx - PANEL_W - PANEL_GAP;
    left = Math.min(Math.max(left, GAP), Math.max(GAP, vw - PANEL_W - GAP));
    return { left: left - bx, top: top - by };
  }

  // Mở trên/dưới: canh ngang theo bong bóng, gần mép phải thì tự lật sang trái.
  if (vw - (bx + SIZE) >= PANEL_W - SIZE + GAP) left = bx; // canh mép trái bong bóng
  else left = bx + SIZE - PANEL_W; // canh mép phải bong bóng
  left = Math.min(Math.max(left, GAP), Math.max(GAP, vw - PANEL_W - GAP));
  top = Math.min(Math.max(top, safeTop), Math.max(safeTop, safeBottom - PANEL_H));

  return { left: left - bx, top: top - by };
}

export function FloatingAssistant({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const cfg = useAssistantConfig();
  const fallbackAdminUrl = useAdminContactUrl();
  const adminUrl = cfg.admin_url || fallbackAdminUrl;
  /** Kênh liên hệ — lấy từ Admin Panel → Trợ lý Mini Chat (không hardcode). */
  const contactChannels = [
    { label: "Facebook", url: cfg.facebook_url },
    { label: "Zalo", url: cfg.zalo_url || adminUrl },
    { label: "Telegram", url: cfg.telegram_url },
  ].filter((c) => Boolean(c.url && c.url.trim()));

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const [offset, setOffset] = useState<{ left: number; top: number }>({ left: 0, top: SIZE + PANEL_GAP });
  const [ripple, setRipple] = useState(0);
  const draggedRef = useRef(false);

  useEffect(() => {
    let start: Pos = { x: window.innerWidth - SIZE - GAP, y: window.innerHeight - 240 };
    try {
      const raw = localStorage.getItem(LS_POS);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") start = saved;
    } catch { /* ignore */ }
    const p = clampPos(start);
    x.set(p.x);
    y.set(p.y);
    setSide(p.x > window.innerWidth / 2 ? "right" : "left");
    setOffset(panelOffset(p.x, p.y));
    setMounted(true);

    const onResize = () => {
      const c = clampPos({ x: x.get(), y: y.get() });
      x.set(c.x);
      y.set(c.y);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [x, y]);

  const settle = useCallback(() => {
    const cur = clampPos({ x: x.get(), y: y.get() });
    const b = bounds();
    const snapRight = cur.x + SIZE / 2 > window.innerWidth / 2;
    const target: Pos = { x: snapRight ? b.maxX : b.minX, y: cur.y };
    setSide(snapRight ? "right" : "left");
    setOffset(panelOffset(target.x, target.y));
    animate(x, target.x, { type: "spring", stiffness: 420, damping: 34, mass: 0.7 });
    animate(y, target.y, { type: "spring", stiffness: 420, damping: 34, mass: 0.7 });
    try { localStorage.setItem(LS_POS, JSON.stringify(target)); } catch { /* ignore */ }
  }, [x, y]);

  if (!mounted || !cfg.enabled) return null;

  const go = (path: string) => {
    setOpen(false);
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    if (onNavigate) onNavigate(path);
    else window.location.href = path;
  };


  const panelPosition: React.CSSProperties = {
    left: offset.left,
    top: offset.top,
    maxHeight: PANEL_H,
    overflowY: "auto",
  };

  return (
    <Portal>
      <style>{`
        @keyframes fa-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes fa-glow { 0%,100% { opacity: .45; transform: scale(1); } 50% { opacity: .85; transform: scale(1.25); } }
        @keyframes fa-ripple { from { opacity: .55; transform: scale(.7); } to { opacity: 0; transform: scale(2.1); } }
        @keyframes fa-shine { 0%,100% { opacity: .55; } 50% { opacity: .95; } }
      `}</style>

      <motion.div
        drag
        dragMomentum
        dragElastic={0.1}
        dragTransition={{ power: 0.18, timeConstant: 200, bounceStiffness: 400, bounceDamping: 36 }}
        onDragStart={() => { draggedRef.current = true; setOpen(false); }}
        onDrag={() => {
          const c = clampPos({ x: x.get(), y: y.get() });
          if (c.x !== x.get()) x.set(c.x);
          if (c.y !== y.get()) y.set(c.y);
        }}
        onDragEnd={() => {
          settle();
          window.setTimeout(() => { draggedRef.current = false; }, 80);
        }}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          x,
          y,
          zIndex: 2147483647,
          touchAction: "none",
          willChange: "transform",
        }}
      >
        {/* Glow nền */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: -10,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(236,72,153,0.55), rgba(139,92,246,0.15) 60%, transparent 70%)",
            filter: "blur(8px)",
            animation: "fa-glow 3.4s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <button
          type="button"
          aria-label="Trợ lý"
          onClick={() => {
            if (draggedRef.current) return;
            setRipple((r) => r + 1);
            setOffset(panelOffset(x.get(), y.get()));
            setOpen((v) => !v);
          }}
          style={{
            position: "relative",
            width: SIZE,
            height: SIZE,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.45)",
            cursor: "grab",
            display: "grid",
            placeItems: "center",
            padding: 0,
            color: "#fff",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.35), rgba(255,255,255,0.05) 42%), linear-gradient(135deg,#a855f7,#ec4899 70%,#f472b6)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow:
              "0 12px 28px -10px rgba(168,85,247,0.85), inset 0 2px 6px rgba(255,255,255,0.55), inset 0 -6px 12px rgba(88,28,135,0.35)",
            animation: "fa-breathe 3.2s ease-in-out infinite",
            overflow: "hidden",
          }}
        >
          {/* Highlight kính */}
          <span
            aria-hidden
            style={{
              position: "absolute", top: 5, left: 10, width: 26, height: 14, borderRadius: "50%",
              background: "rgba(255,255,255,0.6)", filter: "blur(4px)", animation: "fa-shine 3.2s ease-in-out infinite",
            }}
          />
          {/* Trái tim 3D */}
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden style={{ position: "relative", filter: "drop-shadow(0 2px 3px rgba(88,28,135,0.55))" }}>
            <defs>
              <linearGradient id="fa-heart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#ffd6ec" />
                <stop offset="100%" stopColor="#ff5fa2" />
              </linearGradient>
            </defs>
            <path
              fill="url(#fa-heart)"
              d="M12 20.5s-7.5-4.7-9.3-9.1C1.3 7.9 3.4 4.5 6.9 4.5c2 0 3.6 1.1 4.5 2.6.9-1.5 2.5-2.6 4.5-2.6 3.5 0 5.6 3.4 4.2 6.9C19.5 15.8 12 20.5 12 20.5z"
            />
          </svg>
          {/* Ripple khi bấm */}
          {ripple > 0 ? (
            <span
              key={ripple}
              aria-hidden
              style={{
                position: "absolute", inset: 0, borderRadius: 999,
                background: "rgba(255,255,255,0.55)",
                animation: "fa-ripple 620ms ease-out forwards",
                pointerEvents: "none",
              }}
            />
          ) : null}
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 340, damping: 26 }}
              style={{
                position: "absolute",
                ...panelPosition,
                width: PANEL_W,
                borderRadius: 22,
                padding: 14,
                background: "rgba(255,255,255,0.94)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,0.7)",
                boxShadow: "0 22px 52px -18px rgba(15,15,30,0.5)",
                transformOrigin: `${offset.top < 0 ? "bottom" : "top"} ${side === "right" ? "right" : "left"}`,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: "#222" }}>{cfg.title}</div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>{cfg.subtitle}</div>
              <Item label="Vào Nhóm VIP" onClick={() => go("/vip-community")} />
              <Item label="Rút tiền" onClick={() => go("/wallet/withdraw")} />
              <Item label="Chuyển xu" onClick={() => { setOpen(false); setTransferOpen(true); }} />
              <Item
                label={contactOpen ? "Liên hệ Admin ▾" : "Liên hệ Admin"}
                onClick={() => setContactOpen((v) => !v)}
              />
              {contactOpen ? (
                <div style={{ paddingLeft: 10 }}>
                  {contactChannels.length ? (
                    contactChannels.map((c) => (
                      <Item key={c.label} label={c.label} onClick={() => go(c.url)} />
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "#888", padding: "8px 4px" }}>
                      Chưa cấu hình link trong Admin Panel.
                    </div>
                  )}
                </div>
              ) : null}
              <Item label="Đóng" onClick={() => setOpen(false)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <TransferCoinModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </Portal>
  );
}

function Item({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "11px 14px",
        marginTop: 6,
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.06)",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 700,
        color: hover ? "#7c3aed" : "#222",
        background: hover ? "rgba(139,92,246,0.12)" : "#f6f5fa",
        transform: hover ? "translateX(2px)" : "none",
        transition: "background 160ms ease, color 160ms ease, transform 160ms ease",
      }}
    >
      {label}
    </button>
  );
}

export default FloatingAssistant;
