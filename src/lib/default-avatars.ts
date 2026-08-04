import nam1 from "@/assets/default-avatars/gioitinhnam1.jpg";
import nam2 from "@/assets/default-avatars/gioitinhnam2.jpg";
import nam3 from "@/assets/default-avatars/gioitinhnam3.jpg";
import nam4 from "@/assets/default-avatars/gioitinhnam4.jpg";
import nam5 from "@/assets/default-avatars/gioitinhnam5.jpg";
import nu1 from "@/assets/default-avatars/gioitinhnu1.jpg";
import nu2 from "@/assets/default-avatars/gioitinhnu2.jpg";
import nu3 from "@/assets/default-avatars/gioitinhnu3.jpg";
import nu4 from "@/assets/default-avatars/gioitinhnu4.jpg";
import nu5 from "@/assets/default-avatars/gioitinhnu5.jpg";

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
