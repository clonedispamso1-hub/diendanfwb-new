import { useEffect } from "react";

/**
 * HeartCursorEffect
 *
 * Click/tap-only heart burst. No mousemove. Uses pointerdown so a single
 * listener covers mouse, touch, and pen consistently across desktop, tablet
 * and mobile.
 */
export function HeartCursorEffect() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = [
      "position:fixed",
      "inset:0",
      "pointer-events:none",
      "z-index:2147483000",
      "overflow:hidden",
      "contain:strict",
    ].join(";");
    document.body.appendChild(layer);

    if (!document.getElementById("heart-cursor-kf")) {
      const style = document.createElement("style");
      style.id = "heart-cursor-kf";
      style.textContent = `
        @keyframes heart-cursor-float {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(.8) rotate(var(--r,0deg)); }
          20%  { opacity: 1; transform: translate(-50%, calc(-50% - 8px)) scale(1.2) rotate(var(--r,0deg)); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--dx,0px)), calc(-50% - 35px)) scale(1) rotate(var(--r,0deg)); }
        }
        .heart-cursor-item {
          position: absolute;
          will-change: transform, opacity;
          line-height: 1;
          user-select: none;
          filter: drop-shadow(0 1px 2px rgba(236,72,153,.35));
          animation: heart-cursor-float var(--dur,750ms) cubic-bezier(.22,.61,.36,1) forwards;
        }
      `;
      document.head.appendChild(style);
    }

    const MAX_ACTIVE = 20;
    const active: HTMLSpanElement[] = [];

    const spawn = (x: number, y: number) => {
      while (active.length >= MAX_ACTIVE) {
        const old = active.shift();
        old?.remove();
      }
      const el = document.createElement("span");
      el.className = "heart-cursor-item";
      el.textContent = "❤";
      const size = 14 + Math.random() * 8;
      const angle = (Math.random() - 0.5) * 40; // -20°..20°
      const dx = (Math.random() - 0.5) * 40;
      const dur = 600 + Math.random() * 200;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.color = Math.random() < 0.35 ? "#f43f5e" : "#ec4899";
      el.style.fontSize = `${size}px`;
      el.style.setProperty("--r", `${angle}deg`);
      el.style.setProperty("--dx", `${dx}px`);
      el.style.setProperty("--dur", `${dur}ms`);
      layer.appendChild(el);
      active.push(el);
      const cleanup = () => {
        el.remove();
        const i = active.indexOf(el);
        if (i >= 0) active.splice(i, 1);
      };
      el.addEventListener("animationend", cleanup, { once: true });
      setTimeout(cleanup, dur + 300);
    };

    const burst = (x: number, y: number) => {
      const count = 1 + Math.floor(Math.random() * 3); // 1..3
      for (let i = 0; i < count; i++) {
        const jx = x + (Math.random() - 0.5) * 14;
        const jy = y + (Math.random() - 0.5) * 14;
        spawn(jx, jy);
      }
    };

    // Dedupe: pointerdown fires for touch too; skip synthetic click after touch.
    let lastAt = 0;
    const onPointerDown = (e: PointerEvent) => {
      lastAt = performance.now();
      burst(e.clientX, e.clientY);
    };
    const onClick = (e: MouseEvent) => {
      if (performance.now() - lastAt < 500) return;
      burst(e.clientX, e.clientY);
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("click", onClick, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("click", onClick);
      layer.remove();
    };
  }, []);

  return null;
}

export default HeartCursorEffect;
