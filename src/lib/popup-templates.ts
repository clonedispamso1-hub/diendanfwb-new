/**
 * Popup template — chỉ còn duy nhất 1 mẫu "Popup Thông báo".
 * Mỗi mẫu có background riêng, icon riêng, animation riêng.
 * Không dùng nền đen/chữ đen, không bao giờ trong suốt.
 */

export type TemplateKey = "announcement";

export type PopupAnimation = "fade" | "zoom" | "slide-up" | "drop";

export interface PopupTemplate {
  key: TemplateKey;
  emoji: string;
  name: string;
  hint: string;
  /** Nền card — luôn đặc (opaque) */
  background: string;
  /** Màu chữ mặc định (luôn tương phản cao với nền) */
  textColor: string;
  /** Màu chữ phụ */
  mutedColor: string;
  /** Nền nút chính */
  buttonBg: string;
  buttonColor: string;
  /** Viền sáng quanh card */
  ring: string;
  glow: string;
  animation: PopupAnimation;
  /** Hoa văn trang trí bay lơ lửng */
  decor: string[];
  defaults: {
    title: string;
    content: string;
    buttonText: string;
  };
}

export const POPUP_TEMPLATES: PopupTemplate[] = [
  {
    key: "announcement",
    emoji: "📢",
    name: "Popup Thông báo",
    hint: "Tin tức, cập nhật chung",
    background:
      "linear-gradient(150deg, #1d4ed8 0%, #3b82f6 45%, #60a5fa 100%)",
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.88)",
    buttonBg: "linear-gradient(135deg, #ffffff, #e0f2fe)",
    buttonColor: "#1e3a8a",
    ring: "rgba(255,255,255,0.35)",
    glow: "0 30px 80px -20px rgba(29,78,216,0.75)",
    animation: "slide-up",
    decor: ["📣", "✨", "💬", "🔔"],
    defaults: {
      title: "Thông báo quan trọng",
      content:
        "Chúng tôi vừa cập nhật một số thay đổi mới. Hãy xem ngay để không bỏ lỡ nhé!",
      buttonText: "Xem ngay",
    },
  },
];

export function getTemplate(key: string | null | undefined): PopupTemplate {
  return (
    POPUP_TEMPLATES.find((t) => t.key === key) ?? POPUP_TEMPLATES[0]
  );
}
