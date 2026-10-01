/**
 * ProfileUidBadge — dòng UID nhỏ gọn ngay dưới tên + hàng icon mạng xã hội.
 * - Copy icon sao chép UID thật; tại chỗ đổi thành "✓ Đã sao chép" ~1.7s,
 *   không toast, không đổi kích thước.
 * - 5 social icons luôn hiện; profile mình mở trình sửa, profile khác mở cổng VIP.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Users } from "lucide-react";
import { SocialLinkEditModal, type SocialKey } from "@/components/candy/social-link-edit-modal";
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";

interface ProfileUidBadgeProps {
  uid?: string | null;
  profile?: Record<string, any> | null;
  followers?: number;
  onFollowersClick?: () => void;
  /** true = đang xem profile của chính mình → icon mở popup sửa liên kết. */
  isOwn?: boolean;
  /** id của chính mình (chỉ dùng khi isOwn). */
  ownUserId?: string | null;
  /** Cập nhật profile tại chỗ sau khi lưu/xóa liên kết. */
  onSocialSaved?: (column: string, value: string) => void;
}

export function pickSocialValue(p: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = p?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function socialValueToHref(key: SocialKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  switch (key) {
    case "zalo": {
      const phone = value.replace(/[\s.-]/g, "");
      return /^\+?\d{8,15}$/.test(phone) ? `https://zalo.me/${encodeURIComponent(phone)}` : null;
    }
    case "facebook": {
      try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
        return url.protocol === "https:" && (hostname === "facebook.com" || hostname.endsWith(".facebook.com"))
          ? url.toString()
          : null;
      } catch {
        return null;
      }
    }
    case "telegram": {
      const username = value.replace(/^@/, "");
      return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? `https://t.me/${encodeURIComponent(username)}` : null;
    }
    case "instagram": {
      const username = value.replace(/^@/, "");
      return /^(?!.*\.\.)[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(username)
        ? `https://instagram.com/${encodeURIComponent(username)}`
        : null;
    }
    case "x": {
      const username = value.replace(/^@/, "");
      return /^[A-Za-z0-9_]{1,15}$/.test(username) ? `https://x.com/${encodeURIComponent(username)}` : null;
    }
  }
}

export function SocialGlyph({ k }: { k: SocialKey }) {
  switch (k) {
    case "zalo":
      return <span className="pg-social-zalo">Zalo</span>;
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9z" />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M20.7 4.3 3.5 11c-1.2.5-1.1 1.2-.2 1.5l4.4 1.4 1.7 5.2c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.1-2 4.4 3.2c.8.4 1.4.2 1.6-.8l2.9-13.6c.3-1.2-.4-1.7-1.4-1.3zM8.9 13.6l8.6-5.4c.4-.3.8-.1.5.2l-7.3 6.6-.3 3.1-1.5-4.5z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
        </svg>
      );
  }
}

export const SOCIAL_DEFS: { key: SocialKey; label: string; fields: string[] }[] = [
  { key: "zalo", label: "Zalo", fields: ["zalo_url", "zalo_link", "zalo"] },
  { key: "facebook", label: "Facebook", fields: ["facebook_url", "facebook_link", "facebook"] },
  { key: "telegram", label: "Telegram", fields: ["telegram_url", "telegram_link", "telegram"] },
  { key: "instagram", label: "Instagram", fields: ["instagram_url", "instagram_link", "instagram"] },
  { key: "x", label: "X", fields: ["x_url", "twitter_url", "x", "twitter"] },
];

export function ProfileUidBadge({
  uid,
  profile,
  followers,
  onFollowersClick,
  isOwn = false,
  ownUserId,
  onSocialSaved,
}: ProfileUidBadgeProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<SocialKey | null>(null);
  const [lockedSocial, setLockedSocial] = useState<SocialKey | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    const value = (uid ?? "").trim();
    if (!value) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (ok) {
      setCopied(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1700);
    }
  }, [uid]);

  const display = (uid ?? "").trim() || "------";
  const socials = SOCIAL_DEFS.map((d) => ({ ...d, value: pickSocialValue(profile ?? {}, d.fields) }));
  const canEdit = Boolean(isOwn && ownUserId);

  return (
    <div className="pg-uid-block">
      <div className="pg-uid-line" data-copied={copied || undefined}>
        <span className="pg-uid-slot">
          {copied ? (
            <span className="pg-uid-copied">
              <Check size={12} strokeWidth={2.6} aria-hidden="true" />
              Đã sao chép
            </span>
          ) : (
            <>
              <span className="pg-uid-label">UID</span>
              <span className="pg-uid-value">{display}</span>
            </>
          )}
        </span>
        <button
          type="button"
          className="pg-uid-copy"
          onClick={handleCopy}
          aria-label={copied ? "Đã sao chép UID" : "Sao chép UID"}
          title="Sao chép UID"
        >
          <Copy size={13} strokeWidth={1.9} />
        </button>
        {typeof followers === "number" ? (
          <>
            <span className="pg-uid-sep" aria-hidden="true">|</span>
            <button
              type="button"
              className="pg-uid-followers"
              onClick={onFollowersClick}
              aria-label={`${followers.toLocaleString("vi-VN")} người theo dõi`}
            >
              <Users size={13} strokeWidth={2.1} aria-hidden="true" />
              <span>{followers.toLocaleString("vi-VN")} Người theo dõi</span>
            </button>
          </>
        ) : null}
      </div>

      <div className="pg-social-row" role="list" aria-label="Mạng xã hội">
        {socials.map((s) => (
          <button
            key={s.key}
            type="button"
            role="listitem"
            className={`pg-social-btn pg-social-btn--${s.key}`}
            aria-label={isOwn ? (s.value ? `Sửa ${s.label}` : `Thêm ${s.label}`) : `Xem ${s.label}`}
            title={isOwn ? (s.value ? `${s.label} — sửa liên kết` : `${s.label} — thêm liên kết`) : s.label}
            onClick={() => {
              if (canEdit) setEditing(s.key);
              else setLockedSocial(s.key);
            }}
          >
            <SocialGlyph k={s.key} />
          </button>
        ))}
      </div>

      {editing && canEdit ? (
        <SocialLinkEditModal
          socialKey={editing}
          userId={ownUserId as string}
          currentValue={socials.find((s) => s.key === editing)?.value ?? ""}
          onClose={() => setEditing(null)}
          onSaved={(column, value) => onSocialSaved?.(column, value)}
        />
      ) : null}

      <VipUnlockModal
        open={Boolean(lockedSocial)}
        onClose={() => setLockedSocial(null)}
        featureName={lockedSocial ? `Mở liên kết ${SOCIAL_DEFS.find((s) => s.key === lockedSocial)?.label ?? "mạng xã hội"}` : undefined}
      />
    </div>
  );
}

export default ProfileUidBadge;
