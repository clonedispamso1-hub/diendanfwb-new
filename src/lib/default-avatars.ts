import nam1Asset from "@/assets/default-avatars/gioitinhnam1.jpg.asset.json";
const nam1 = nam1Asset.url;
import nam2Asset from "@/assets/default-avatars/gioitinhnam2.jpg.asset.json";
const nam2 = nam2Asset.url;
import nam3Asset from "@/assets/default-avatars/gioitinhnam3.jpg.asset.json";
const nam3 = nam3Asset.url;
import nam4Asset from "@/assets/default-avatars/gioitinhnam4.jpg.asset.json";
const nam4 = nam4Asset.url;
import nam5Asset from "@/assets/default-avatars/gioitinhnam5.jpg.asset.json";
const nam5 = nam5Asset.url;
import nu1Asset from "@/assets/default-avatars/gioitinhnu1.jpg.asset.json";
const nu1 = nu1Asset.url;
import nu2Asset from "@/assets/default-avatars/gioitinhnu2.jpg.asset.json";
const nu2 = nu2Asset.url;
import nu3Asset from "@/assets/default-avatars/gioitinhnu3.jpg.asset.json";
const nu3 = nu3Asset.url;
import nu4Asset from "@/assets/default-avatars/gioitinhnu4.jpg.asset.json";
const nu4 = nu4Asset.url;
import nu5Asset from "@/assets/default-avatars/gioitinhnu5.jpg.asset.json";
const nu5 = nu5Asset.url;

export const MALE_AVATARS: string[] = [nam1, nam2, nam3, nam4, nam5];
export const FEMALE_AVATARS: string[] = [nu1, nu2, nu3, nu4, nu5];

/** Return an absolute URL for one of the bundled default avatars based on gender. */
export function pickDefaultAvatar(gender: "male" | "female"): string {
  const pool = gender === "male" ? MALE_AVATARS : FEMALE_AVATARS;
  const idx = Math.floor(Math.random() * pool.length);
  const path = pool[idx];
  // Convert relative bundle path to absolute URL so it works when stored in DB.
  if (typeof window !== "undefined") {
    try { return new URL(path, window.location.origin).toString(); } catch { /* */ }
  }
  return path;
}

/** True when the stored avatar is empty / placeholder. */
export function isPlaceholderAvatar(url?: string | null): boolean {
  if (!url) return true;
  const v = url.trim().toLowerCase();
  if (!v) return true;
  return v.endsWith("/placeholder.svg") || v === "placeholder.svg";
}
