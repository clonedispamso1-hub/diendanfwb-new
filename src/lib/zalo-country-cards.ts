/**
 * 3 card quốc gia của popup "VIP Zalo" (Việt Nam → Đài Loan → Nhật Bản).
 * Subtitle + trạng thái Bật/Tắt lưu trên Supabase #4, bảng
 * `public.zalo_country_cards`. Admin Panel > Nhóm Zalo Mồi là nơi chỉnh.
 *
 * SQL khởi tạo: supabase-sql/SB4/2026-09-18b_zalo_country_cards.sql
 */
import { useEffect, useState } from "react";
import { sb4, sb4Admin } from "@/lib/supabase-v4";
import type { CountryFlagId } from "@/components/candy/zalo-country-flags";

export const ZALO_COUNTRY_CARDS_TABLE = "zalo_country_cards";
/** Phát khi Admin lưu → popup đang mở cập nhật ngay. */
export const ZALO_COUNTRY_CARDS_EVENT = "zalo-country-cards:changed";
const CACHE_KEY = "candy.zalo-country-cards.v1";

export interface ZaloCountryCard {
  id: CountryFlagId;
  title: string;
  subtitle: string;
  enabled: boolean;
  sort_order: number;
}

/** Thứ tự + tên mặc định (chỉ dùng khi bảng chưa có dòng tương ứng). */
export const ZALO_COUNTRY_DEFAULTS: ZaloCountryCard[] = [
  {
    id: "vn",
    title: "VIP ZALO VIỆT NAM",
    subtitle: "Các nhóm VIP Zalo ở Việt Nam",
    enabled: true,
    sort_order: 1,
  },
  {
    id: "tw",
    title: "VIP ZALO ĐÀI LOAN",
    subtitle: "Các nhóm VIP Zalo và LINE dành cho hội viên tại Đài Loan",
    enabled: true,
    sort_order: 2,
  },
  {
    id: "jp",
    title: "VIP ZALO NHẬT BẢN",
    subtitle: "Các nhóm VIP Zalo và LINE dành cho hội viên tại Nhật Bản",
    enabled: true,
    sort_order: 3,
  },
];

function normalize(rows: any[]): ZaloCountryCard[] {
  return ZALO_COUNTRY_DEFAULTS.map((fallback) => {
    const row = rows.find((r) => r?.id === fallback.id);
    if (!row) return { ...fallback };
    return {
      id: fallback.id,
      title: typeof row.title === "string" && row.title ? row.title : fallback.title,
      subtitle: typeof row.subtitle === "string" ? row.subtitle : fallback.subtitle,
      enabled: row.enabled !== false,
      sort_order: typeof row.sort_order === "number" ? row.sort_order : fallback.sort_order,
    };
  }).sort((a, b) => a.sort_order - b.sort_order);
}

function readCache(): ZaloCountryCard[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return normalize(parsed);
  } catch {
    return null;
  }
}

function writeCache(cards: ZaloCountryCard[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cards));
  } catch {
    /* noop */
  }
}

/** Đọc 3 card từ Supabase (dùng cho popup và Admin Panel). */
export async function getZaloCountryCards(): Promise<ZaloCountryCard[]> {
  const { data, error } = await sb4()
    .from(ZALO_COUNTRY_CARDS_TABLE)
    .select("id, title, subtitle, enabled, sort_order");
  if (error) throw new Error(error.message);
  const cards = normalize((data as any[]) ?? []);
  writeCache(cards);
  return cards;
}

/** Lưu 1 card (upsert theo id) + phát sự kiện cập nhật. */
export async function saveZaloCountryCard(
  id: CountryFlagId,
  patch: Partial<Pick<ZaloCountryCard, "subtitle" | "enabled" | "title">>,
): Promise<void> {
  const fallback = ZALO_COUNTRY_DEFAULTS.find((c) => c.id === id);
  const payload: Record<string, unknown> = {
    id,
    title: patch.title ?? fallback?.title ?? id,
    sort_order: fallback?.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };
  if ("subtitle" in patch) payload["subtitle"] = patch.subtitle ?? "";
  if ("enabled" in patch) payload["enabled"] = Boolean(patch.enabled);
  const { error } = await sb4Admin()
    .from(ZALO_COUNTRY_CARDS_TABLE)
    .upsert(payload as any, { onConflict: "id" });
  if (error) throw new Error(error.message);
  try {
    const fresh = await getZaloCountryCards();
    window.dispatchEvent(new CustomEvent(ZALO_COUNTRY_CARDS_EVENT, { detail: fresh }));
  } catch {
    /* noop */
  }
}

/**
 * Hook dùng chung: đọc từ Supabase khi mount, cập nhật ngay khi Admin lưu
 * và khi tab được focus lại. `ready` = false khi chưa biết dữ liệu.
 */
export function useZaloCountryCards(): { cards: ZaloCountryCard[]; ready: boolean } {
  const cached = readCache();
  const [cards, setCards] = useState<ZaloCountryCard[]>(cached ?? ZALO_COUNTRY_DEFAULTS);
  const [ready, setReady] = useState<boolean>(!!cached);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void getZaloCountryCards()
        .then((next) => {
          if (!alive) return;
          setCards(next);
          setReady(true);
        })
        .catch(() => {
          if (alive) setReady(true);
        });
    };
    refresh();
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ZaloCountryCard[]>).detail;
      if (Array.isArray(detail)) {
        setCards(normalize(detail));
        setReady(true);
      } else refresh();
    };
    const onFocus = () => refresh();
    window.addEventListener(ZALO_COUNTRY_CARDS_EVENT, onChanged as EventListener);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener(ZALO_COUNTRY_CARDS_EVENT, onChanged as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { cards, ready };
}
