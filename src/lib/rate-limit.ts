// Global anti-spam / rate limiting helper.
//
// The backend (see supabase/migrations/20260719120000_global_rate_limiting.sql)
// is the source of truth: it owns a `rate_limit_hits` table and a
// `check_rate_limit(action, max?, window?)` SQL function that raises a
// friendly Vietnamese error when the caller exceeds the configured limit.
//
// This module wraps that RPC with an in-memory client-side throttle so the UI
// gives immediate feedback (toast + rejected action) without waiting for a
// round trip, while still relying on the DB as the authoritative check.
//
// Usage:
//   import { guardAction } from "@/lib/rate-limit";
//   const ok = await guardAction("chat");
//   if (!ok) return; // toast already shown
//   // ... perform the sensitive action ...
//
// To add a new action, just call `guardAction("<name>")` from your code —
// the backend will fall back to a sane global default and you can later add
// tuned defaults in `rate_limit_defaults()` in the SQL migration.

import { supabase } from "@/lib/db/router";
import { toast } from "sonner";

export type RateLimitAction =
  | "chat"
  | "bet"
  | "like"
  | "reaction"
  | "follow"
  | "post"
  | "comment"
  | "friend_request"
  | "notification"
  | "lucky_money"
  | "facebook"
  | "zalo"
  | "message"
  | string; // future features can pass any string

interface RateLimitConfig {
  /** Max actions allowed inside the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/**
 * Configurable defaults, mirrored from `public.rate_limit_defaults()` in SQL.
 * Backend enforcement is authoritative; these values only drive the local
 * fast-path throttle so the UI can react instantly.
 */
const DEFAULTS: Record<string, RateLimitConfig> = {
  chat:           { max: 5,  windowMs: 5_000 },
  message:        { max: 5,  windowMs: 5_000 },
  bet:            { max: 3,  windowMs: 5_000 },
  like:           { max: 5,  windowMs: 5_000 },
  reaction:       { max: 5,  windowMs: 5_000 },
  follow:         { max: 10, windowMs: 60_000 },
  post:           { max: 3,  windowMs: 30_000 },
  comment:        { max: 3,  windowMs: 10_000 },
  friend_request: { max: 5,  windowMs: 60_000 },
  notification:   { max: 10, windowMs: 30_000 },
  lucky_money:    { max: 2,  windowMs: 10_000 },
  facebook:       { max: 3,  windowMs: 10_000 },
  zalo:           { max: 3,  windowMs: 10_000 },
};

const GLOBAL_FALLBACK: RateLimitConfig = { max: 5, windowMs: 10_000 };

// Per-action ring buffers of recent hit timestamps (client-side throttle).
const hits = new Map<string, number[]>();

function configFor(action: string): RateLimitConfig {
  return DEFAULTS[action] ?? GLOBAL_FALLBACK;
}

/** Seconds until the earliest recorded hit falls out of the window. */
export function secondsUntilAllowed(action: string): number {
  const cfg = configFor(action);
  const arr = hits.get(action) ?? [];
  if (arr.length < cfg.max) return 0;
  const oldest = arr[arr.length - cfg.max];
  const remainingMs = oldest + cfg.windowMs - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function clientAllows(action: string): boolean {
  const cfg = configFor(action);
  const now = Date.now();
  const cutoff = now - cfg.windowMs;
  const arr = (hits.get(action) ?? []).filter((t) => t > cutoff);
  if (arr.length >= cfg.max) {
    hits.set(action, arr);
    return false;
  }
  arr.push(now);
  hits.set(action, arr);
  return true;
}

let lastToastAt = 0;
function showToast(action: string): void {
  const now = Date.now();
  if (now - lastToastAt < 1500) return; // don't spam toasts
  lastToastAt = now;
  const remaining = secondsUntilAllowed(action) || 5;
  const msg = `Bạn thao tác quá nhanh. Vui lòng đợi ${remaining}s rồi thử lại.`;
  try {
    toast.error(msg);
  } catch {
    /* ignore */
  }
}

/**
 * Ask the server + local throttle whether `action` is allowed for the current
 * user right now. Returns TRUE when the action may proceed, FALSE when it was
 * rate-limited (a toast is shown automatically in that case).
 *
 * Never throws — call sites can treat FALSE as "silently drop this action".
 */
export async function guardAction(
  action: RateLimitAction,
  opts?: { silent?: boolean },
): Promise<boolean> {
  // 1) Fast client throttle so obvious spam never hits the DB.
  if (!clientAllows(action)) {
    if (!opts?.silent) showToast(action);
    return false;
  }

  // 2) Backend source of truth. Not signed in → skip (RLS handles it).
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return true;
  } catch {
    return true;
  }

  try {
    const { error } = await (supabase as any).rpc("check_rate_limit", {
      _action: action,
    });
    if (error) {
      // P0001 = our raise exception. Any other error (missing function on an
      // older DB, network hiccup) should not block the user — we already
      // enforced client-side, so degrade gracefully.
      const code = (error as any).code ?? "";
      const msg = String((error as any).message ?? "").toLowerCase();
      const isLimit =
        code === "P0001" ||
        msg.includes("quá nhanh") ||
        msg.includes("rate limit");
      if (isLimit) {
        if (!opts?.silent) showToast(action);
        return false;
      }
      // Function missing (e.g. migration not applied yet) → allow.
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Wrap an async action with rate limiting. Returns the wrapped function's
 * result, or `undefined` when the action was rate-limited.
 */
export async function withRateLimit<T>(
  action: RateLimitAction,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const ok = await guardAction(action);
  if (!ok) return undefined;
  return fn();
}

/** Test helper — clears client-side throttle state. */
export function __resetRateLimitState(): void {
  hits.clear();
}
