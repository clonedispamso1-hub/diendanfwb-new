/** Link nhóm Zalo "Lấy Code" dùng chung cho module ⚡ Album ảnh. */
import { adminSetSiteSetting } from "@/lib/admin-db";
import { getSiteSetting, invalidateSiteSettings } from "@/lib/site-settings-cache";

export const FLASH_ZALO_KEY = "flash_album_zalo";

function normalize(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return typeof record.url === "string" ? record.url.trim() : "";
}

export async function fetchFlashZalo(): Promise<string> {
  try {
    return normalize(await getSiteSetting(FLASH_ZALO_KEY));
  } catch {
    return "";
  }
}

export async function saveFlashZalo(link: string): Promise<string> {
  invalidateSiteSettings(FLASH_ZALO_KEY);
  const clean = link.trim();
  await adminSetSiteSetting(FLASH_ZALO_KEY, { url: clean });
  invalidateSiteSettings(FLASH_ZALO_KEY);
  return clean;
}
