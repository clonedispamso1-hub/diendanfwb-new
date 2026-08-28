/**
 * Nội dung trang "Vào Cộng Đồng" — Admin tự quản lý toàn bộ.
 *
 * Lưu trên Supabase #2 (Database phụ), bảng `community_page` (id = 1),
 * cột JSONB `content`. Database chính không bị đụng tới.
 *
 * Hiệu năng: 1 query duy nhất, cache trong phiên. Không polling, không realtime.
 */
import { db2 } from "@/lib/db/router";

export const COMMUNITY_PAGE_KEY = "__community_page";

export interface CommunityPageContent {
  title: string;
  /** Nội dung dạng text nhiều dòng (mỗi dòng trống = đoạn mới) */
  body: string;
  banner_url: string;
  image_urls: string[];
  video_url: string;
  zalo_url: string;
  facebook_url: string;
  telegram_url: string;
  admin_url: string;
  /** Link trang cá nhân Admin (VD: /profile/xxxxx) — dùng cho nút "Liên hệ Admin". */
  admin_profile_link: string;
  show_zalo: boolean;
  show_facebook: boolean;
  show_telegram: boolean;
  show_admin: boolean;
}

export const DEFAULT_COMMUNITY_PAGE: CommunityPageContent = {
  title: "Cộng Đồng VIP",
  body:
    "Chào mừng bạn đến với Cộng Đồng VIP!\n\n" +
    "QUYỀN LỢI KHI THAM GIA\n" +
    "• Kết nối cùng thành viên đã xác thực trong khu vực của bạn.\n" +
    "• Nhận thông báo sớm về các hoạt động và sự kiện.\n" +
    "• Được Admin hỗ trợ trực tiếp khi cần.\n\n" +
    "CÁCH THAM GIA\n" +
    "Bấm nút liên hệ ở cuối trang, Admin sẽ hướng dẫn bạn từng bước.\n\n" +
    "QUY ĐỊNH\n" +
    "• Tôn trọng mọi thành viên, không spam, không quảng cáo.\n" +
    "• Vi phạm sẽ bị mời ra khỏi nhóm.",
  banner_url: "",
  image_urls: [],
  video_url: "",
  zalo_url: "",
  facebook_url: "",
  telegram_url: "",
  admin_url: "",
  admin_profile_link: "",
  show_zalo: true,
  show_facebook: false,
  show_telegram: false,
  show_admin: true,
};

function normalize(raw: unknown): CommunityPageContent {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: keyof CommunityPageContent, fb = "") =>
    typeof o[k] === "string" ? (o[k] as string) : fb;
  const bool = (k: keyof CommunityPageContent, fb: boolean) =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : fb;
  return {
    title: str("title", DEFAULT_COMMUNITY_PAGE.title) || DEFAULT_COMMUNITY_PAGE.title,
    body: str("body", DEFAULT_COMMUNITY_PAGE.body) || DEFAULT_COMMUNITY_PAGE.body,
    banner_url: str("banner_url"),
    image_urls: Array.isArray(o.image_urls)
      ? (o.image_urls as unknown[]).filter((x): x is string => typeof x === "string" && !!x)
      : [],
    video_url: str("video_url"),
    zalo_url: str("zalo_url"),
    facebook_url: str("facebook_url"),
    telegram_url: str("telegram_url"),
    admin_url: str("admin_url"),
    admin_profile_link: str("admin_profile_link"),
    show_zalo: bool("show_zalo", true),
    show_facebook: bool("show_facebook", false),
    show_telegram: bool("show_telegram", false),
    show_admin: bool("show_admin", true),
  };
}

let cache: CommunityPageContent | null = null;

/**
 * Đọc nội dung trang Cộng Đồng — luôn lấy trực tiếp từ Supabase #2
 * (không dùng cache cũ) để Admin lưu xong là frontend thấy ngay.
 * `cache` chỉ dùng làm dự phòng khi mạng lỗi.
 */
export async function fetchCommunityPage(): Promise<CommunityPageContent> {
  try {
    const { data, error } = await db2()
      .from("community_page")
      .select("content")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    cache = normalize((data as any)?.content ?? null);
  } catch {
    cache = cache ?? { ...DEFAULT_COMMUNITY_PAGE };
  }
  return cache;
}

export function clearCommunityPageCache(): void {
  cache = null;
}


/** Lưu nội dung (Admin Panel). Chỉ ghi đúng 1 khoá, không đụng link khu vực. */
export async function saveCommunityPage(next: CommunityPageContent): Promise<void> {
  const { error } = await db2()
    .from("community_page")
    .upsert({ id: 1, content: normalize(next), updated_at: new Date().toISOString() } as any);
  if (error) throw new Error(error.message);
  clearCommunityPageCache();
}
