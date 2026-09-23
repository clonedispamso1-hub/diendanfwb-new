export type CrmCardStatus = "pending" | "submitted";

export interface CrmChatCardPayload {
  cardId: string;
  location: string;
  status: CrmCardStatus;
  submittedAt?: string;
  /** Thông tin khách hàng đã gửi (chỉ để hiển thị lại trên chính card này). */
  name?: string;
  phone?: string;
  region?: string;
  district?: string;
}

const CRM_CARD_RE = /\[\[crmcard:([A-Za-z0-9+/=_-]+)\]\]/;

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function crmCardToken(payload: CrmChatCardPayload): string {
  return `[[crmcard:${encode(JSON.stringify(payload))}]]`;
}

export function parseCrmCard(content?: string | null): CrmChatCardPayload | null {
  if (!content) return null;
  const match = CRM_CARD_RE.exec(content);
  if (!match) return null;
  try {
    const payload = JSON.parse(decode(match[1])) as Partial<CrmChatCardPayload>;
    if (!payload.cardId || !payload.location) return null;
    return {
      cardId: String(payload.cardId),
      location: String(payload.location),
      status: payload.status === "submitted" ? "submitted" : "pending",
      submittedAt: payload.submittedAt ? String(payload.submittedAt) : undefined,
      name: payload.name ? String(payload.name) : undefined,
      phone: payload.phone ? String(payload.phone) : undefined,
      region: payload.region ? String(payload.region) : undefined,
      district: payload.district ? String(payload.district) : undefined,
    };
  } catch {
    return null;
  }
}

export function hasCrmCardToken(content?: string | null): boolean {
  return Boolean(content && CRM_CARD_RE.test(content));
}

export function stripCrmCardTokens(content: string): string {
  return content.replace(new RegExp(CRM_CARD_RE.source, "g"), "").trim();
}