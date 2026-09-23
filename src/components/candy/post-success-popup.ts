/**
 * post-success-popup — popup "Đăng bài thành công" kiểu Zalo.
 * UI-only: popup nhỏ, bo tròn, nền trắng, icon tròn xanh + tick trắng,
 * hiện gần upper-middle, tự mờ dần sau ~1.7s. Không logic, không nút bấm.
 * Gọi từ bất kỳ đâu: showPostSuccessPopup("Đã đăng thành công").
 */

let activeEl: HTMLElement | null = null;
let hideTimer: number | null = null;

const CSS = `
.psp-popup{
  position:fixed; left:50%; top:18vh; transform:translateX(-50%);
  z-index:99999; display:flex; flex-direction:column; align-items:center; gap:12px;
  width:max-content; max-width:min(320px,86vw); padding:22px 30px 20px;
  background:#ffffff; border-radius:22px; text-align:center;
  box-shadow:0 12px 40px -10px rgba(15,23,42,.22), 0 2px 10px rgba(15,23,42,.08);
  animation:psp-in .28s cubic-bezier(.2,.8,.3,1.1) both;
  -webkit-tap-highlight-color:transparent; pointer-events:none;
}
.psp-icon{
  width:60px; height:60px; border-radius:999px; display:grid; place-items:center;
  background:linear-gradient(135deg,#3fd06b,#22b14a);
  box-shadow:0 8px 20px -6px rgba(52,199,89,.55);
}
.psp-icon svg{ display:block; }
.psp-text{
  margin:0; font-size:14.5px; font-weight:600; line-height:1.45; color:#1c1e21;
}
.psp-hide{ animation:psp-out .26s ease-in both; }
@keyframes psp-in{
  from{ opacity:0; transform:translate(-50%,-12px) scale(.92); }
  to{ opacity:1; transform:translate(-50%,0) scale(1); }
}
@keyframes psp-out{
  from{ opacity:1; transform:translate(-50%,0) scale(1); }
  to{ opacity:0; transform:translate(-50%,-8px) scale(.95); }
}
@media (max-width:480px){ .psp-popup{ top:14vh; padding:20px 24px 18px; } }
@media (prefers-reduced-motion: reduce){ .psp-popup,.psp-hide{ animation:none; } }
`;

function ensureStyle() {
  if (document.getElementById("psp-style")) return;
  const tag = document.createElement("style");
  tag.id = "psp-style";
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

/** Hiện popup thành công (kiểu Zalo). Tự fade-out sau ~1.7s. */
export function showPostSuccessPopup(message: string) {
  if (typeof document === "undefined") return;
  ensureStyle();

  if (activeEl) {
    activeEl.remove();
    activeEl = null;
  }
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }

  const el = document.createElement("div");
  el.className = "psp-popup";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  const icon = document.createElement("div");
  icon.className = "psp-icon";
  icon.innerHTML =
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  const text = document.createElement("p");
  text.className = "psp-text";
  text.textContent = message;

  el.appendChild(icon);
  el.appendChild(text);
  document.body.appendChild(el);
  activeEl = el;

  hideTimer = window.setTimeout(() => {
    el.classList.add("psp-hide");
    window.setTimeout(() => {
      el.remove();
      if (activeEl === el) activeEl = null;
    }, 280);
  }, 1700);
}
