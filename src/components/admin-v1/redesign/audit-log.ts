/* ============================================================
   AUDIT LOG (Nhật ký kiểm duyệt) — lưu tạm trong localStorage
   ============================================================ */

const KEY = "ddx-audit-log";

export type AuditEntry = {
  id: string;
  admin: string;
  action: string;
  target: string;
  at: string; // ISO
};

export function pushAudit(entry: Omit<AuditEntry, "id" | "at">) {
  if (typeof window === "undefined") return;
  const list = getAudit();
  const full: AuditEntry = {
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    ...entry,
  };
  list.unshift(full);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  window.dispatchEvent(new CustomEvent("ddx:audit-change"));
}

export function getAudit(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

/* Notifications (đơn giản — lưu popup sau khi user "Đã hiểu") */
const NOTIF_KEY = "ddx-notifications";
export type NotifEntry = {
  id: string;
  title: string;
  body: string;
  at: string;
};
export function pushNotification(n: Omit<NotifEntry, "id" | "at">) {
  if (typeof window === "undefined") return;
  const list: NotifEntry[] = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
  list.unshift({
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    ...n,
  });
  localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, 100)));
}
