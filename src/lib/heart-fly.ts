/**
 * Hiệu ứng ❤️ bay vào avatar — CSS transform + opacity, không thư viện,
 * không setInterval, không ảnh hưởng Supabase/Vercel.
 *
 *  bấm ❤️ → tim nhỏ phóng nhẹ → bay vào avatar → avatar sáng nhẹ → "+1 ❤️" bay lên
 *  tổng ~600ms.
 */

const STYLE_ID = "heart-fly-style";

const CSS = `
.hf-fly{position:fixed;z-index:100000;pointer-events:none;font-size:20px;line-height:1;
  will-change:transform,opacity;transform:translate(-50%,-50%) scale(.6);opacity:0;
  transition:transform .62s cubic-bezier(.22,.68,.3,1),opacity .62s ease;
  filter:drop-shadow(0 2px 6px rgba(255,60,110,.45));}
.hf-fly.is-go{opacity:1;}
.hf-fly.is-end{opacity:0;}
.hf-pop{position:fixed;z-index:100000;pointer-events:none;font-size:14px;font-weight:800;
  color:#ff3b6b;text-shadow:0 1px 4px rgba(0,0,0,.35);will-change:transform,opacity;
  transform:translate(-50%,-50%) scale(.9);opacity:0;
  transition:transform .7s cubic-bezier(.2,.7,.3,1),opacity .7s ease;}
.hf-pop.is-go{opacity:1;transform:translate(-50%,-160%) scale(1.05);}
.hf-pop.is-end{opacity:0;transform:translate(-50%,-260%) scale(.95);}
.hf-glow{animation:hf-glow .5s ease-out;}
@keyframes hf-glow{
  0%{filter:none;transform:scale(1);}
  40%{filter:drop-shadow(0 0 10px rgba(255,70,120,.85));transform:scale(1.08);}
  100%{filter:none;transform:scale(1);}
}
@media (prefers-reduced-motion: reduce){
  .hf-fly,.hf-pop{transition-duration:.01ms;}
  .hf-glow{animation:none;}
}
`;

function ensureStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** "+1 ❤️" bay lên phía trên một phần tử (thường là avatar). */
export function spawnPlusOne(target: Element | null, text = "+1 ❤️") {
  if (typeof document === "undefined" || !target) return;
  ensureStyle();
  const { x, y } = centerOf(target);
  const el = document.createElement("div");
  el.className = "hf-pop";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y - target.getBoundingClientRect().height / 2}px`;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.add("is-go");
    window.setTimeout(() => {
      el.classList.add("is-end");
      window.setTimeout(() => el.remove(), 420);
    }, 420);
  });
}

/** Avatar phát sáng nhẹ 500ms. */
export function glowAvatar(target: Element | null) {
  if (!target) return;
  ensureStyle();
  target.classList.remove("hf-glow");
  // force reflow để animation chạy lại khi bấm liên tục
  void (target as HTMLElement).offsetWidth;
  target.classList.add("hf-glow");
  window.setTimeout(() => target.classList.remove("hf-glow"), 520);
}

/**
 * Tim bay từ vị trí bấm vào avatar rồi hiện "+1 ❤️".
 * @param from toạ độ chuột/chạm (clientX/clientY)
 */
export function flyHeartToAvatar(
  from: { x: number; y: number },
  target: Element | null,
  opts: { plusOne?: boolean } = {},
) {
  if (typeof document === "undefined" || !target) return;
  ensureStyle();
  const to = centerOf(target);
  const el = document.createElement("div");
  el.className = "hf-fly";
  el.textContent = "❤️";
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add("is-go");
    el.style.transform = "translate(-50%,-50%) scale(1.35)";
    requestAnimationFrame(() => {
      el.style.transform =
        `translate(${to.x - from.x}px, ${to.y - from.y}px) translate(-50%,-50%) scale(.35)`;
    });
  });

  window.setTimeout(() => {
    el.classList.add("is-end");
    glowAvatar(target);
    if (opts.plusOne !== false) spawnPlusOne(target);
    window.setTimeout(() => el.remove(), 300);
  }, 600);
}

/** Bỏ yêu thích: tim thu nhỏ rồi biến mất tại chỗ. */
export function shrinkHeart(from: { x: number; y: number }) {
  if (typeof document === "undefined") return;
  ensureStyle();
  const el = document.createElement("div");
  el.className = "hf-fly is-go";
  el.textContent = "🤍";
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  el.style.transform = "translate(-50%,-50%) scale(1.1)";
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transitionDuration = ".45s";
    el.style.transform = "translate(-50%,-50%) scale(.2)";
    el.classList.add("is-end");
  });
  window.setTimeout(() => el.remove(), 520);
}
