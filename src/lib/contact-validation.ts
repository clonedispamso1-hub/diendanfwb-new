/**
 * Validation + normalization for the Facebook / Zalo contact fields on posts.
 * An invalid value must never render a contact icon.
 */

const FB_HOSTS = /^(www\.|m\.|web\.|mbasic\.)?(facebook\.com|fb\.com|fb\.me|facebook\.me)$/i;

export function normalizeFacebookUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  if (!FB_HOSTS.test(url.hostname)) return null;
  // Needs an actual profile/page path, not just the bare domain.
  if (!url.pathname || url.pathname === "/") return null;
  return url.toString();
}

export function isValidFacebookUrl(raw: string | null | undefined): boolean {
  return normalizeFacebookUrl(raw) !== null;
}

/** Vietnamese phone number: 0xxxxxxxxx (10 digits) or +84xxxxxxxxx. */
export function normalizeZaloPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  // Accept a pasted zalo.me link but keep only the phone part.
  const m = value.match(/zalo\.me\/(\+?\d[\d\s.+()-]*)/i);
  if (m) value = m[1];
  const digits = value.replace(/[^\d+]/g, "");
  let local: string;
  if (/^\+84\d{9}$/.test(digits)) local = `0${digits.slice(3)}`;
  else if (/^84\d{9}$/.test(digits)) local = `0${digits.slice(2)}`;
  else if (/^0\d{9}$/.test(digits)) local = digits;
  else return null;
  if (!/^0(3|5|7|8|9)\d{8}$/.test(local)) return null;
  return local;
}

export function isValidZaloPhone(raw: string | null | undefined): boolean {
  return normalizeZaloPhone(raw) !== null;
}

export function zaloHrefFromPhone(raw: string | null | undefined): string | null {
  const phone = normalizeZaloPhone(raw);
  if (phone) return `https://zalo.me/${phone}`;
  // Chấp nhận link zalo.me dạng nhóm / username (vd: zalo.me/g/abcxyz) —
  // Clone và user thật render giống nhau 100%.
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const withProto = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withProto);
    if (!/^(www\.)?zalo\.me$/i.test(url.hostname)) return null;
    if (!url.pathname || url.pathname === "/") return null;
    return url.toString();
  } catch {
    return null;
  }
}


export const ADMIN_CONTACT_URL = "https://www.facebook.com/share/1BjMYa8H27/?mibextid=wwXIfr";
