const PING_RE = /^\[\[profile-ping:([^\]\s]+)\]\]$/;
const CARD_RE = /^\[\[profile-card:([^\]\s]+)\]\]$/;

export type ProfileShareKind = "ping" | "card";

export interface ProfileShareToken {
  kind: ProfileShareKind;
  userId: string;
}

export function profilePingToken(userId: string): string {
  return `[[profile-ping:${userId}]]`;
}

export function profileCardToken(userId: string): string {
  return `[[profile-card:${userId}]]`;
}

export function parseProfileShare(content?: string | null): ProfileShareToken | null {
  const value = (content ?? "").trim();
  const ping = PING_RE.exec(value);
  if (ping?.[1]) return { kind: "ping", userId: ping[1] };
  const card = CARD_RE.exec(value);
  if (card?.[1]) return { kind: "card", userId: card[1] };
  return null;
}
