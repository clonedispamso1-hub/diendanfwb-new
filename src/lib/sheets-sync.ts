// Client-side sheet sync wrapper with offline retry queue (localStorage).
// All functions return immediately and run in the background — they never throw
// and they never block app flow even if Google Sheets is down.

import {
  sheetsUpsertMemberFn,
  sheetsAppendGiftFn,
  sheetsAppendGemFn,
  sheetsAppendLoginFn,
  sheetsSetLogoutFn,
} from "./sheets-sync.functions";

type Op =
  | { kind: "upsertMember"; payload: Parameters<typeof sheetsUpsertMemberFn>[0]["data"] }
  | { kind: "appendGift"; payload: Parameters<typeof sheetsAppendGiftFn>[0]["data"] }
  | { kind: "appendGem"; payload: Parameters<typeof sheetsAppendGemFn>[0]["data"] }
  | { kind: "appendLogin"; payload: Parameters<typeof sheetsAppendLoginFn>[0]["data"] }
  | { kind: "setLogout"; payload: Parameters<typeof sheetsSetLogoutFn>[0]["data"] };

const QUEUE_KEY = "fwb_sheets_sync_queue_v2";
const LOGIN_KEY_PREFIX = "fwb_sheets_login_rowkey:";

function readQueue(): Op[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: Op[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500)));
  } catch { /* quota — drop */ }
}
function enqueue(op: Op) {
  const q = readQueue();
  q.push(op);
  writeQueue(q);
}

async function runOp(op: Op): Promise<boolean> {
  try {
    let res: { ok: boolean; rowKey?: string };
    switch (op.kind) {
      case "upsertMember": res = await sheetsUpsertMemberFn({ data: op.payload }); break;
      case "appendGift":   res = await sheetsAppendGiftFn({ data: op.payload }); break;
      case "appendGem":    res = await sheetsAppendGemFn({ data: op.payload }); break;
      case "appendLogin":  {
        res = await sheetsAppendLoginFn({ data: op.payload });
        if (res?.ok && res.rowKey && typeof window !== "undefined") {
          window.localStorage.setItem(LOGIN_KEY_PREFIX + op.payload.uid, res.rowKey);
        }
        break;
      }
      case "setLogout":    res = await sheetsSetLogoutFn({ data: op.payload }); break;
    }
    return !!res?.ok;
  } catch (e) {
    console.warn("[sheets-sync] op failed", op.kind, e);
    return false;
  }
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const q = readQueue();
    const remaining: Op[] = [];
    for (const op of q) {
      const ok = await runOp(op);
      if (!ok) remaining.push(op);
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

function schedule(op: Op) {
  void runOp(op).then((ok) => {
    if (!ok) enqueue(op);
  });
}

function getDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.userAgent ?? "unknown";
}

let cachedIp: string | null = null;
async function fetchIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    cachedIp = String(j?.ip ?? "");
    return cachedIp;
  } catch {
    return "";
  }
}

export const sheetsSync = {
  upsertMember(payload: any) {
    schedule({ kind: "upsertMember", payload });
  },
  appendGift(payload: any) {
    schedule({ kind: "appendGift", payload });
  },
  appendGem(payload: any) {
    schedule({ kind: "appendGem", payload });
  },
  async recordLogin(uid: string, username?: string | null) {
    const ip = await fetchIp();
    schedule({
      kind: "appendLogin",
      payload: {
        uid,
        username: username ?? null,
        ip,
        device: getDevice(),
        loginTime: new Date().toISOString(),
      },
    });
  },
  recordLogout(uid: string) {
    if (typeof window === "undefined") return;
    const rowKey = window.localStorage.getItem(LOGIN_KEY_PREFIX + uid);
    if (!rowKey) return;
    schedule({ kind: "setLogout", payload: { rowKey, logoutTime: new Date().toISOString() } });
    window.localStorage.removeItem(LOGIN_KEY_PREFIX + uid);
  },
};

if (typeof window !== "undefined") {
  const tick = () => { void flushQueue(); };
  const onVisibility = () => {
    if (document.visibilityState === "visible") tick();
  };
  window.addEventListener("online", tick);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", onVisibility);
  setTimeout(tick, 3_000);
}

// Helper to map a profile row to MemberRow shape.
export function profileToMember(p: any): any {
  if (!p) return null;
  const interestsArr: string[] | undefined = Array.isArray(p.interests) ? p.interests : undefined;
  const suspended = p.is_suspended ?? p.suspended ?? false;
  return {
    uid: p.id,
    username: p.username ?? null,
    displayName: p.full_name ?? p.display_name ?? null,
    region: p.province ?? p.region ?? null,
    currentGem: typeof p.gem === "number" ? p.gem : typeof p.gems === "number" ? p.gems : typeof p.current_gem === "number" ? p.current_gem : null,
    registrationDate: p.created_at ?? null,
    gender: p.gender ?? null,
    phone: p.phone ?? p.phone_number ?? null,
    email: p.email ?? null,
    interests: interestsArr ? interestsArr.join(", ") : (typeof p.interests === "string" ? p.interests : null),
    profileCompleted: p.profile_completed ?? p.fwb_completed ?? null,
    accountStatus: suspended ? "Khóa" : "Hoạt động",
    lastLoginAt: p.last_sign_in_at ?? p.last_login_at ?? null,
    onlineStatus: p.is_online ? "Online" : (p.is_online === false ? "Offline" : null),
  };
}
