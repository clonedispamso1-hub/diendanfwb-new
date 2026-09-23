/**
 * FROM — gửi Card nội dung Hướng dẫn theo khu vực vào cuộc chat.
 *
 * KHÔNG tạo hệ thống CRM/Card mới: nội dung lấy đúng từ 8 mục hướng dẫn
 * theo khu vực (crm-guide-regions.ts), gửi qua hệ thống tin nhắn hiện có
 * dưới dạng marker nội bộ giống các card khác.
 */

/** Loại hành vi của từng mục FROM. */
export type FromItemKind = "card" | "preset" | "manual";

export interface FromCardItem {
  /** id mục trong menu FROM */
  id: string;
  kind: FromItemKind;
  /** mục hướng dẫn theo khu vực tương ứng (card + preset) */
  sectionId: string;
  /** nhãn hiển thị trong menu */
  menuLabel: string;
  /** tiêu đề Card gửi cho khách — {REGION_UPPER} sẽ được thay theo khu vực */
  cardTitle: string;
  icon: string;
}

export const FROM_CARD_ITEMS: readonly FromCardItem[] = [
  {
    id: "community-vip",
    kind: "card",
    sectionId: "rg-community-vip",
    menuLabel: "Community VIP CR",
    cardTitle: "CỘNG ĐỒNG VIP ZALO {REGION_UPPER}",
    icon: "👑",
  },
  {
    id: "quyen-loi",
    kind: "card",
    sectionId: "rg-quyen-loi",
    menuLabel: "Quyền Lợi Khi Vào CR",
    cardTitle: "QUYỀN LỢI KHI VÀO VIP ZALO",
    icon: "🎁",
  },
  {
    id: "moi",
    kind: "manual",
    sectionId: "",
    menuLabel: "mồi",
    cardTitle: "",
    icon: "💬",
  },
  {
    id: "noi-quy",
    kind: "card",
    sectionId: "rg-noi-quy",
    menuLabel: "Nội Quy CR",
    cardTitle: "NỘI QUY CỘNG ĐỒNG",
    icon: "📜",
  },
  {
    id: "moi-phi",
    kind: "preset",
    sectionId: "rg-moi-phi",
    menuLabel: "Mồi phí",
    cardTitle: "",
    icon: "💰",
  },
  {
    id: "phi-khong-cao",
    kind: "preset",
    sectionId: "rg-phi-khong-cao",
    menuLabel: "Phí không cao",
    cardTitle: "",
    icon: "💸",
  },
  {
    id: "phi",
    kind: "card",
    sectionId: "rg-so-tien",
    menuLabel: "Phí CR",
    cardTitle: "PHÍ VÀO CỘNG ĐỒNG ZALO",
    icon: "💳",
  },
  {
    id: "moi-thanh-cong",
    kind: "preset",
    sectionId: "rg-feedback",
    menuLabel: "Mồi thành công",
    cardTitle: "",
    icon: "🎉",
  },
] as const;

export function fromCardItem(id: string): FromCardItem | null {
  return FROM_CARD_ITEMS.find((i) => i.id === id) ?? null;
}


/** Nhóm Community VIP đính kèm trong Card (đọc lại từ bộ đã lưu, không random). */
export interface FromCardVipGroup {
  name: string;
  district: string;
  members: number;
  men: number;
  women: number;
  admins: number;
  gold_key: number;
  silver_key: number;
}

/** Một ô quyền lợi thành viên (Card "Quyền Lợi Khi Vào CR"). */
export interface FromCardBenefit {
  title: string;
  content: string;
}

/** Một mục Nội Quy đang bật, đã sắp thứ tự. */
export interface FromCardRule {
  title: string;
  content: string;
}

/** Nội dung cấu hình riêng của Card "Phí CR". */
export interface FromCardFee {
  eight_months: string;
  lifetime: string;
  notes: string[];
}

export interface FromCardPayload {
  itemId: string;
  icon: string;
  title: string;
  region: string;
  text: string;
  /** Logo Zalo hiện có trong Kho ảnh, dùng chung cho bộ Card CRM. */
  logo_url?: string | null;
  /** Chỉ có với Card "Community VIP CR". */
  vip?: {
    avatar_url: string | null;
    groups: FromCardVipGroup[];
    /** Nội dung phía trên do Admin cấu hình (đã thay {location}). */
    intro?: string;
    /** Các mục Lưu ý đang bật (đã sắp thứ tự, đã thay {location}). */
    notes?: string[];
  };
  /** Chỉ có với Card "Quyền Lợi Khi Vào CR" — đã thay {location}. */
  benefits?: FromCardBenefit[];
  /** Chỉ có với Card "Nội Quy CR"; chữ CR không hiển thị phía User. */
  rules?: FromCardRule[];
  /** Chỉ có với Card "Phí CR" — nội dung dùng chung, khu vực chỉ dùng cho tiêu đề. */
  fee?: FromCardFee;
}

const RE = /\[\[fromcard:([A-Za-z0-9+/=_-]+)\]\]/;

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function decode(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function fromCardToken(payload: FromCardPayload): string {
  return `[[fromcard:${encode(JSON.stringify(payload))}]]`;
}

export function parseFromCard(content?: string | null): FromCardPayload | null {
  if (!content) return null;
  const m = RE.exec(content);
  if (!m) return null;
  try {
    const p = JSON.parse(decode(m[1])) as Partial<FromCardPayload>;
    const vipGroups = Array.isArray(p.vip?.groups) ? (p.vip!.groups as FromCardVipGroup[]) : [];
    const benefits = (Array.isArray(p.benefits) ? p.benefits : [])
      .map((b) => ({
        title: String((b as FromCardBenefit)?.title ?? "").trim(),
        content: String((b as FromCardBenefit)?.content ?? "").trim(),
      }))
      .filter((b) => b.title || b.content);
    const rules = (Array.isArray(p.rules) ? p.rules : [])
      .map((rule) => ({
        title: String((rule as FromCardRule)?.title ?? "").trim(),
        content: String((rule as FromCardRule)?.content ?? "").trim(),
      }))
      .filter((rule) => rule.title || rule.content);
    const rawFee = p.fee as Partial<FromCardFee> | undefined;
    const fee = rawFee
      ? {
          eight_months: String(rawFee.eight_months ?? "").trim(),
          lifetime: String(rawFee.lifetime ?? "").trim(),
          notes: Array.isArray(rawFee.notes) ? rawFee.notes.map((note) => String(note).trim()).filter(Boolean) : [],
        }
      : null;
    const hasFee = Boolean(fee && (fee.eight_months || fee.lifetime || fee.notes.length));
    if (!p.title || (!p.text && !vipGroups.length && !benefits.length && !rules.length && !hasFee)) return null;
    return {
      itemId: String(p.itemId ?? ""),
      icon: String(p.icon ?? "📘"),
      title: String(p.title),
      region: String(p.region ?? ""),
      text: String(p.text ?? ""),
      logo_url: p.logo_url ? String(p.logo_url) : null,
      ...(vipGroups.length
        ? {
            vip: {
              avatar_url: p.vip?.avatar_url ?? null,
              groups: vipGroups,
              intro: String(p.vip?.intro ?? ""),
              notes: Array.isArray(p.vip?.notes)
                ? p.vip!.notes!.map((n) => String(n)).filter(Boolean)
                : [],
            },
          }
        : {}),
      ...(benefits.length ? { benefits } : {}),
      ...(rules.length ? { rules } : {}),
      ...(hasFee && fee ? { fee } : {}),
    };
  } catch {
    return null;
  }
}

export function hasFromCardToken(content?: string | null): boolean {
  return Boolean(content && RE.test(content));
}

export function stripFromCardTokens(content: string): string {
  return content.replace(new RegExp(RE.source, "g"), "").trim();
}
