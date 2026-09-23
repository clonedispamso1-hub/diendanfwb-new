import giftIconsUrl from "@/assets/gifts/gift-icons.svg";

const PREMIUM_GIFT_KEYS = new Set([
  "rose",
  "tulip",
  "bouquet",
  "giftbox",
  "chocolate",
  "bear",
  "heart",
  "ring",
  "diamond",
]);

interface GiftIconProps {
  giftKey: string;
  fallback: string;
}

export function GiftIcon({ giftKey, fallback }: GiftIconProps) {
  if (!PREMIUM_GIFT_KEYS.has(giftKey)) {
    return <span className="gs-item-emoji-fallback">{fallback}</span>;
  }

  return (
    <svg className="gs-item-icon" viewBox="0 0 88 88" aria-hidden="true" focusable="false">
      <use href={`${giftIconsUrl}#${giftKey}`} />
    </svg>
  );
}