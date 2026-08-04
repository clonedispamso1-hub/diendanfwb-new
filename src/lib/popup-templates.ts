/**
 * Popup templates — 6 mẫu popup thiết kế sẵn.
 * Mỗi mẫu có background riêng, icon riêng, animation riêng.
 * Không dùng nền đen/chữ đen, không bao giờ trong suốt.
 */

export type TemplateKey =
  | "announcement"
  | "tet"
  | "event"
  | "birthday"
  | "valentine"
  | "noel";

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
  {
    key: "tet",
    emoji: "🧧",
    name: "Popup Tết",
    hint: "Chúc mừng năm mới",
    background:
      "linear-gradient(160deg, #b91c1c 0%, #dc2626 40%, #f59e0b 100%)",
    textColor: "#fffbeb",
    mutedColor: "rgba(255,251,235,0.9)",
    buttonBg: "linear-gradient(135deg, #fde68a, #f59e0b)",
    buttonColor: "#7c2d12",
    ring: "rgba(253,230,138,0.6)",
    glow: "0 30px 80px -20px rgba(185,28,28,0.8)",
    animation: "zoom",
    decor: ["🧧", "🏮", "🌸", "🪙", "🎋"],
    defaults: {
      title: "Chúc Mừng Năm Mới",
      content:
        "Kính chúc quý thành viên một năm mới An Khang – Thịnh Vượng – Vạn Sự Như Ý!",
      buttonText: "Nhận lì xì",
    },
  },
  {
    key: "event",
    emoji: "🎉",
    name: "Popup Sự kiện",
    hint: "Sự kiện, minigame",
    background:
      "linear-gradient(150deg, #6d28d9 0%, #9333ea 45%, #ec4899 100%)",
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.88)",
    buttonBg: "linear-gradient(135deg, #fde047, #fb923c)",
    buttonColor: "#4c1d95",
    ring: "rgba(253,224,71,0.5)",
    glow: "0 30px 80px -20px rgba(147,51,234,0.8)",
    animation: "zoom",
    decor: ["🎉", "🎊", "⭐", "🎁", "✨"],
    defaults: {
      title: "Sự kiện đặc biệt",
      content:
        "Sự kiện lớn nhất tháng đã bắt đầu! Tham gia ngay để nhận những phần quà cực hấp dẫn.",
      buttonText: "Tham gia ngay",
    },
  },
  {
    key: "birthday",
    emoji: "🎂",
    name: "Popup Sinh nhật Website",
    hint: "Kỷ niệm thành lập",
    background:
      "linear-gradient(155deg, #0f766e 0%, #14b8a6 45%, #f472b6 100%)",
    textColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.9)",
    buttonBg: "linear-gradient(135deg, #ffffff, #ccfbf1)",
    buttonColor: "#0f766e",
    ring: "rgba(255,255,255,0.4)",
    glow: "0 30px 80px -20px rgba(15,118,110,0.75)",
    animation: "drop",
    decor: ["🎂", "🎈", "🎊", "🍰", "✨"],
    defaults: {
      title: "Sinh nhật Website",
      content:
        "Cảm ơn bạn đã đồng hành cùng chúng tôi! Cùng thổi nến và nhận quà kỷ niệm nhé.",
      buttonText: "Nhận quà sinh nhật",
    },
  },
  {
    key: "valentine",
    emoji: "❤️",
    name: "Popup Valentine",
    hint: "Ngày lễ tình nhân",
    background:
      "linear-gradient(150deg, #be123c 0%, #f43f5e 45%, #fb7185 100%)",
    textColor: "#fff1f2",
    mutedColor: "rgba(255,241,242,0.9)",
    buttonBg: "linear-gradient(135deg, #ffffff, #ffe4e6)",
    buttonColor: "#9f1239",
    ring: "rgba(255,228,230,0.55)",
    glow: "0 30px 80px -20px rgba(190,18,60,0.8)",
    animation: "fade",
    decor: ["❤️", "💘", "🌹", "💝", "💗"],
    defaults: {
      title: "Happy Valentine",
      content:
        "Chúc bạn một mùa Valentine thật ngọt ngào và ấm áp bên người thương!",
      buttonText: "Gửi lời yêu thương",
    },
  },
  {
    key: "noel",
    emoji: "🎄",
    name: "Popup Noel",
    hint: "Giáng sinh an lành",
    background:
      "linear-gradient(155deg, #064e3b 0%, #047857 45%, #b91c1c 100%)",
    textColor: "#ecfdf5",
    mutedColor: "rgba(236,253,245,0.9)",
    buttonBg: "linear-gradient(135deg, #fef3c7, #fbbf24)",
    buttonColor: "#7f1d1d",
    ring: "rgba(254,243,199,0.5)",
    glow: "0 30px 80px -20px rgba(6,78,59,0.85)",
    animation: "drop",
    decor: ["🎄", "❄️", "🎅", "🔔", "⛄"],
    defaults: {
      title: "Merry Christmas",
      content:
        "Giáng sinh an lành! Chúc bạn và gia đình một mùa Noel thật ấm áp và hạnh phúc.",
      buttonText: "Chúc mừng Giáng sinh",
    },
  },
];

export function getTemplate(key: string | null | undefined): PopupTemplate {
  return (
    POPUP_TEMPLATES.find((t) => t.key === key) ?? POPUP_TEMPLATES[0]
  );
}
