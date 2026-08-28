/**
 * 🎁 GIÁ QUÀ HIỆN TẠI CỦA WEBSITE — MỘT NGUỒN DUY NHẤT.
 *
 * Nguồn thật = ĐÚNG danh sách quà popup của user thường đang hiển thị
 * (`FALLBACK_ITEMS` trong gift-system-modal). KHÔNG đọc bảng `gift_items`
 * (Supabase #1 không có bảng này → truy vấn chỉ tạo request lỗi vô ích).
 *
 * Mọi nơi cần giá quà (kể cả clone tặng quà trong Admin Panel) PHẢI dùng
 * hàm này — không hard-code giá riêng, không catalog riêng cho clone.
 */
import { FALLBACK_ITEMS } from "@/components/candy/gift/gift-system-modal";
import type { GiftItem } from "@/components/candy/gift/gift-catalog";

/** Danh sách quà + giá đang áp dụng trên website (đơn vị: xu/gem). */
const WEBSITE_CATALOG: GiftItem[] = FALLBACK_ITEMS.map((g) => ({
  key: g.key,
  name: g.name,
  emoji: g.emoji,
  amount: g.min_amount,
  gradient: g.gradient,
  glow: g.glow,
})).filter((g) => g.amount > 0);

export async function fetchWebsiteGiftCatalog(): Promise<GiftItem[]> {
  return WEBSITE_CATALOG;
}

export type { GiftItem };
