// Wraps React.lazy with retry-on-chunk-load-failure.
//
// Vite emits hashed chunks. After a deploy, an old tab still holds hashes
// that no longer exist on the CDN. The first click on a lazy route throws
// "Failed to fetch dynamically imported module" and the whole subtree
// crashes (e.g. the Follow button on the Notifications page).
//
// This helper retries the import a few times (usually enough to catch a
// transient network blip) and, on final failure, reloads the page once so
// the browser picks up the new asset manifest.

import { lazy, type ComponentType } from "react";

type Factory<T> = () => Promise<{ default: T }>;

const RELOAD_KEY = "nfwb:lazy-reload-once";

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk")
  );
}

async function retryImport<T>(factory: Factory<T>, attempts = 3, delayMs = 400): Promise<{ default: T }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await factory();
    } catch (err) {
      lastErr = err;
      if (!isChunkLoadError(err)) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  // Final fallback: reload once so the SW / manifest refreshes.
  if (
    typeof window !== "undefined" &&
    isChunkLoadError(lastErr) &&
    !sessionStorage.getItem(RELOAD_KEY)
  ) {
    sessionStorage.setItem(RELOAD_KEY, "1");
    window.location.reload();
    // Give the reload a chance before rejecting.
    return new Promise(() => {});
  }
  throw lastErr;
}

export function lazyWithRetry<T extends ComponentType<any>>(factory: Factory<T>) {
  return lazy(() => retryImport(factory));
}
