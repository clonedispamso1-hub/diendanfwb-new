import { useEffect } from "react";

/**
 * Global safety net for external links on iOS Safari.
 *
 * Any anchor that would open a new tab (`target="_blank"`) or point at an
 * external app/website is intercepted and navigated in the SAME tab, so Safari
 * never creates an `about:blank` placeholder tab. Adds a short press feedback
 * (scale 0.98 + ripple) before redirecting.
 */
const FEEDBACK_MS = 170;

function isExternal(href: string) {
  if (!href) return false;
  if (/^(mailto:|tel:|sms:)/i.test(href)) return false;
  if (/^(https?:)?\/\//i.test(href)) {
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch {
      return true;
    }
  }
  // App deep links: zalo://, fb://, intent://, etc.
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

export function ExternalLinkGuard() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      const wantsNewTab = anchor.target === "_blank";
      if (!wantsNewTab && !isExternal(href)) return;
      if (anchor.hasAttribute("download")) return;

      event.preventDefault();

      // Press feedback
      anchor.classList.add("ext-pressing");
      const rect = anchor.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ext-ripple";
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      anchor.appendChild(ripple);

      window.setTimeout(() => {
        window.location.assign(anchor.href || href);
      }, FEEDBACK_MS);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
