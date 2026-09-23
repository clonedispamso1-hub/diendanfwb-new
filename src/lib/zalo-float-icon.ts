/**
 * "Icon Zalo nổi" — ảnh + trạng thái Bật/Tắt của icon Zalo nổi ở Trang Chủ.
 * Lưu trên Supabase #4, bảng `public.zalo_float_icon` (1 dòng id = 'main'),
 * ảnh lưu ở bucket công khai `zalo-float-icon`.
 *
 * SQL khởi tạo: supabase-sql/SB4/2026-09-18_zalo_float_icon.sql
 */
import { useEffect, useState } from "react";
import { sb4, sb4Admin } from "@/lib/supabase-v4";

export const ZALO_FLOAT_ICON_TABLE = "zalo_float_icon";
export const ZALO_FLOAT_ICON_BUCKET = "zalo-float-icon";
export const ZALO_FLOAT_ICON_ROW_ID = "main";
/** Phát khi Admin lưu → mọi icon nổi đang mở cập nhật ngay. */
export const ZALO_FLOAT_ICON_EVENT = "zalo-float-icon:changed";
const CACHE_KEY = "candy.zalo-float-icon.v1";

export interface ZaloFloatIconSettings {
  image_url: string | null;
  enabled: boolean;
}

export const DEFAULT_ZALO_FLOAT_ICON: ZaloFloatIconSettings = {
  image_url: null,
  enabled: true,
};

function readCache(): ZaloFloatIconSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ZaloFloatIconSettings>;
    return {
      image_url: typeof p.image_url === "string" ? p.image_url : null,
      enabled: p.enabled !== false,
    };
  } catch {
    return null;
  }
}

function writeCache(s: ZaloFloatIconSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

/** Đọc cấu hình (dùng cho cả Trang Chủ và Admin Panel). */
export async function getZaloFloatIcon(): Promise<ZaloFloatIconSettings> {
  const { data, error } = await sb4()
    .from(ZALO_FLOAT_ICON_TABLE)
    .select("image_url, enabled")
    .eq("id", ZALO_FLOAT_ICON_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const s: ZaloFloatIconSettings = !data
    ? { ...DEFAULT_ZALO_FLOAT_ICON }
    : {
        image_url: (data as any).image_url ?? null,
        enabled: (data as any).enabled !== false,
      };
  writeCache(s);
  return s;
}

/** Lưu cấu hình (upsert dòng 'main') + phát sự kiện cập nhật. */
export async function saveZaloFloatIcon(patch: Partial<ZaloFloatIconSettings>): Promise<void> {
  const payload: Record<string, unknown> = {
    id: ZALO_FLOAT_ICON_ROW_ID,
    updated_at: new Date().toISOString(),
  };
  if ("image_url" in patch) payload["image_url"] = patch.image_url ?? null;
  if ("enabled" in patch) payload["enabled"] = Boolean(patch.enabled);
  const { error } = await sb4Admin()
    .from(ZALO_FLOAT_ICON_TABLE)
    .upsert(payload as any, { onConflict: "id" });
  if (error) throw new Error(error.message);
  try {
    const fresh = await getZaloFloatIcon();
    window.dispatchEvent(new CustomEvent(ZALO_FLOAT_ICON_EVENT, { detail: fresh }));
  } catch {
    /* noop */
  }
}

/** Tải ảnh icon lên bucket công khai, trả về public URL. */
export async function uploadZaloFloatIcon(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = `icon-${Date.now()}.${ext || "png"}`;
  const client = sb4Admin();
  const { error } = await client.storage.from(ZALO_FLOAT_ICON_BUCKET).upload(key, file, {
    upsert: true,
    contentType: file.type || "image/png",
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(ZALO_FLOAT_ICON_BUCKET).getPublicUrl(key);
  if (!data?.publicUrl) throw new Error("Không lấy được đường dẫn ảnh.");
  return data.publicUrl;
}

/**
 * Hook dùng chung cho mọi icon Zalo nổi: đọc từ Supabase khi mount, cập nhật
 * ngay khi Admin lưu (sự kiện) và khi tab được focus lại.
 * `ready` = false khi chưa biết cấu hình (tránh nháy icon mặc định rồi ẩn).
 */
export function useZaloFloatIcon(): { settings: ZaloFloatIconSettings; ready: boolean } {
  const cached = readCache();
  const [settings, setSettings] = useState<ZaloFloatIconSettings>(
    cached ?? DEFAULT_ZALO_FLOAT_ICON,
  );
  const [ready, setReady] = useState<boolean>(!!cached);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void getZaloFloatIcon()
        .then((s) => {
          if (!alive) return;
          setSettings(s);
          setReady(true);
        })
        .catch(() => {
          if (alive) setReady(true);
        });
    };
    refresh();
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<ZaloFloatIconSettings>).detail;
      if (detail && typeof detail === "object") {
        setSettings({ image_url: detail.image_url ?? null, enabled: detail.enabled !== false });
        setReady(true);
      } else refresh();
    };
    const onFocus = () => refresh();
    window.addEventListener(ZALO_FLOAT_ICON_EVENT, onChanged as EventListener);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener(ZALO_FLOAT_ICON_EVENT, onChanged as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { settings, ready };
}
