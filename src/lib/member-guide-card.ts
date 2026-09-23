/**
 * Member Guide Card — marker cho thẻ "Hướng dẫn thành viên" gửi trong chat.
 *
 * Admin bấm một mục trong sheet "Hướng dẫn thành viên" → một tin nhắn với
 * `content` dạng `[[guidecard:<id>]]` được gửi vào cuộc trò chuyện. Cả hai bên
 * đều thấy cùng một thẻ, bấm "Xem chi tiết" để mở popup nội dung đầy đủ.
 *
 * Giai đoạn này CHỈ hỗ trợ mục "FWB, ONS là gì" (id: fwb-ons).
 */

const RE = /\[\[guidecard:([a-z0-9-]+)\]\]/i;
const RE_G = /\[\[guidecard:[a-z0-9-]+\]\]/gi;

export type GuideCardId = "fwb-ons";

export interface GuideCardBlock {
  /** Tiêu đề nhóm nội dung */
  heading: string;
  /** Emoji/icon nhỏ trước tiêu đề */
  icon: string;
  /** Đoạn mở đầu của nhóm (không bắt buộc) */
  intro?: string;
  /** Các gạch đầu dòng */
  bullets?: string[];
}

export interface GuideCardContent {
  id: GuideCardId;
  /** Nhãn trên thẻ trong chat */
  title: string;
  /** Mô tả ngắn trên thẻ */
  subtitle: string;
  /** Nhãn nhỏ phía trên tiêu đề */
  eyebrow: string;
  /** Emoji lớn của thẻ */
  emoji: string;
  /** Các khối nội dung trong popup chi tiết */
  blocks: GuideCardBlock[];
  /** Ghi chú an toàn cuối popup */
  footnote: string;
}

export const GUIDE_CARDS: Record<GuideCardId, GuideCardContent> = {
  "fwb-ons": {
    id: "fwb-ons",
    title: "FWB, ONS là gì?",
    subtitle: "Giải thích nhanh hai khái niệm phổ biến trong cộng đồng.",
    eyebrow: "Hướng dẫn thành viên",
    emoji: "💞",
    blocks: [
      {
        icon: "🤝",
        heading: "FWB — Friends With Benefits",
        intro:
          "Là mối quan hệ giữa hai người bạn có thêm sự thân mật, nhưng không xem nhau là người yêu và không ràng buộc lâu dài.",
        bullets: [
          "Cả hai đồng thuận và hiểu rõ giới hạn của nhau.",
          "Không ghen tuông, không đòi hỏi thời gian hay cam kết.",
          "Tôn trọng sự riêng tư và danh tính của nhau.",
          "Có thể duy trì lâu dài nếu cả hai vẫn thoải mái.",
        ],
      },
      {
        icon: "🌙",
        heading: "ONS — One Night Stand",
        intro:
          "Là cuộc gặp mang tính khoảnh khắc, chỉ diễn ra một lần, hai bên đồng thuận và không có ràng buộc sau đó.",
        bullets: [
          "Đồng thuận tuyệt đối, không ép buộc, không lợi dụng lúc say.",
          "Nên gặp ở nơi công cộng trước khi quyết định.",
          "Không quay phim, chụp ảnh khi chưa được cho phép.",
          "Không phù hợp nếu bạn đang trong quan hệ nghiêm túc.",
        ],
      },
      {
        icon: "⚖️",
        heading: "Khác nhau ở đâu?",
        bullets: [
          "FWB: quen biết, gặp lại nhiều lần, có sự tin cậy.",
          "ONS: chỉ một lần, thường không hẹn gặp lại.",
          "FWB cần trao đổi rõ giới hạn ngay từ đầu.",
          "ONS cần cẩn trọng hơn về an toàn cá nhân.",
        ],
      },
      {
        icon: "🛡️",
        heading: "Nguyên tắc an toàn chung",
        bullets: [
          "Luôn ưu tiên sức khỏe và biện pháp bảo vệ.",
          "Chia sẻ lịch trình với một người bạn tin cậy.",
          "Không chuyển tiền, không cho vay cho người mới gặp.",
          "Nói rõ mong muốn, dừng lại khi thấy không thoải mái.",
        ],
      },
    ],
    footnote:
      "Nội dung chỉ mang tính tham khảo, đề cao sự đồng thuận, an toàn và tôn trọng lẫn nhau giữa người trưởng thành.",
  },
};

export function guideCardToken(id: GuideCardId): string {
  return `[[guidecard:${id}]]`;
}

export function parseGuideCard(content?: string | null): GuideCardContent | null {
  if (!content) return null;
  const m = RE.exec(content);
  const id = m?.[1]?.toLowerCase();
  if (!id) return null;
  return GUIDE_CARDS[id as GuideCardId] ?? null;
}

export function hasGuideCardToken(content?: string | null): boolean {
  return !!content && RE.test(content);
}

export function stripGuideCardTokens(content: string): string {
  return content.replace(RE_G, "").trim();
}

/** Preview an toàn cho danh sách chat / thông báo — không lộ marker. */
export function guideCardPreview(data: GuideCardContent, isSelf = false): string {
  return isSelf ? `📘 Bạn đã gửi: ${data.title}` : `📘 ${data.title}`;
}
