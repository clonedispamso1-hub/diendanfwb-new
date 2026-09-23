/**
 * Snowfall — tuyết rơi cực nhẹ cho tab "Vip Zalo Tham Gia".
 * CSS + JS thuần: một lần tạo N <span> hạt tuyết, animation hoàn toàn bằng CSS
 * (transform/opacity → chạy trên compositor, không reflow, không tốn CPU).
 * Không ảnh, không GIF, không thư viện. pointer-events: none → không chặn click/cuộn.
 *
 * Lưu ý quan trọng:
 * - Layer được render qua portal vào <body> để không bị ancestor có transform /
 *   overflow:hidden làm mất position:fixed hoặc bị cắt.
 * - Nền app là TRẮNG nên hạt tuyết dùng màu xanh-xám nhạt (không phải #fff)
 *   để thực sự nhìn thấy được, kèm viền mờ rất nhẹ.
 * - Component chỉ được mount khi tab active; unmount là dừng toàn bộ animation.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const CSS = `
.sf-layer{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:60;}
.sf-flake{position:absolute;top:-10px;border-radius:999px;
  background:radial-gradient(circle at 35% 35%, #ffffff 0%, #bcd4ee 45%, #7ba0cc 100%);
  box-shadow:0 0 4px rgba(90,125,170,.6);
  opacity:var(--o,.8);width:var(--s,5px);height:var(--s,5px);
  animation:sf-fall var(--d,12s) linear var(--dl,0s) infinite;
  will-change:transform;}
@keyframes sf-fall{
  0%{transform:translate3d(0,-10px,0)}
  25%{transform:translate3d(var(--sw,14px),25vh,0)}
  50%{transform:translate3d(calc(var(--sw,14px)*-1),50vh,0)}
  75%{transform:translate3d(var(--sw,14px),75vh,0)}
  100%{transform:translate3d(0,103vh,0)}}
@media (prefers-reduced-motion: reduce){.sf-flake{animation:none;display:none}}
`;

/** Số hạt tuyết tối thiểu, tự giảm trên máy yếu / màn hình nhỏ. */
function flakeCount(): number {
  if (typeof navigator === "undefined") return 24;
  const cores = navigator.hardwareConcurrency || 4;
  const small = typeof window !== "undefined" && window.innerWidth < 480;
  if (cores <= 2) return 12;
  if (small || cores <= 4) return 18;
  return 28;
}

export function Snowfall() {
  // Chỉ render sau khi hydrate (portal cần document) → tránh lệch SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const flakes = useMemo(
    () =>
      Array.from({ length: flakeCount() }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 3 + Math.random() * 4, // 3–7px
        duration: 9 + Math.random() * 8, // 9–17s, rơi chậm
        delay: -Math.random() * 17, // rải đều ngay khi mount
        opacity: 0.5 + Math.random() * 0.45,
        sway: 8 + Math.random() * 16,
      })),
    [],
  );

  if (!mounted) return null;

  return createPortal(
    <div className="sf-layer" aria-hidden="true" data-snowfall="on">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="sf-flake"
          style={{
            left: `${f.left}%`,
            ["--s" as string]: `${f.size}px`,
            ["--d" as string]: `${f.duration}s`,
            ["--dl" as string]: `${f.delay}s`,
            ["--o" as string]: f.opacity,
            ["--sw" as string]: `${f.sway}px`,
          }}
        />
      ))}
      <style>{CSS}</style>
    </div>,
    document.body,
  );
}

export default Snowfall;
