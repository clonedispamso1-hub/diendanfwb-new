/**
 * Direct external navigation helper.
 *
 * iOS Safari shows a blank `about:blank` tab when `window.open()` /
 * `target="_blank"` is used (especially inside async handlers). We therefore
 * ALWAYS navigate the current tab with `location.assign()` so Facebook / Zalo
 * hand off to their native apps when installed, and fall back to the web
 * version when not.
 */

const FEEDBACK_MS = 170;

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (url.startsWith("/") || url.startsWith("#")) return url;
  return `https://${url}`;
}

/**
 * Navigate directly to an external URL in the SAME tab.
 * Never opens a new tab, so no `about:blank` intermediate page appears.
 */
export function openExternalLink(raw: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const url = normalizeUrl(raw ?? "");
  if (!url) return;
  window.location.href = url;
}

/**
 * Same as `openExternalLink` but waits a short beat so button press feedback
 * (scale / loading / ripple) is visible before the redirect happens.
 */
export function openExternalLinkWithFeedback(
  raw: string | null | undefined,
  delayMs: number = FEEDBACK_MS,
): void {
  if (typeof window === "undefined") return;
  const url = normalizeUrl(raw ?? "");
  if (!url) return;
  window.setTimeout(() => {
    window.location.assign(url);
  }, delayMs);
}

/** Props to spread on an <a> so it redirects in-tab instead of a new tab. */
export function externalLinkProps(raw: string | null | undefined) {
  const url = normalizeUrl(raw ?? "");
  return {
    href: url || undefined,
    rel: "noreferrer",
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      openExternalLinkWithFeedback(url);
    },
  };
}
