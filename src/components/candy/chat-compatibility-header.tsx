import { resolveUserName } from "@/lib/user-name";
import { MapPin, Mars, Venus } from "lucide-react";
import type { Profile } from "@/lib/app-types";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";

interface Props {
  me: Partial<Profile> | null;
  partner: Partial<Profile> | null;
  partnerId: string;
  onOpenProfile: (userId: string) => void;
}

/**
 * Slim sticky user info card rendered under the chat action bar.
 * Replaces the previous compatibility band per UX directive:
 * shows the partner's avatar, name, area and gender in a low
 * profile, dark-mode friendly strip.
 */
export function ChatCompatibilityHeader({ partner, partnerId, onOpenProfile }: Props) {
  const name = resolveUserName(partner as any, "Thành viên");
  const area =
    (partner as any)?.city ||
    (partner as any)?.province ||
    (partner as any)?.location ||
    "";
  const gender = String((partner as any)?.gender || "").toLowerCase();
  const isMale = gender.startsWith("m") || gender.includes("nam");
  const isFemale = gender.startsWith("f") || gender.includes("nữ") || gender.includes("nu");
  const genderLabel = isMale ? "Nam" : isFemale ? "Nữ" : "";

  const open = () => onOpenProfile(partnerId);

  return (
    <button
      type="button"
      className="chat-user-card"
      onClick={open}
      aria-label={`Xem hồ sơ ${name}`}
    >
      <span className="chat-user-avatar">
        <img loading="lazy" decoding="async"
          src={getValidAvatarUrl(partner?.avatar)}
          onError={handleAvatarError}
          alt={name}
        />
      </span>
      <span className="chat-user-info">
        <span className="chat-user-name">{name}</span>
        <span className="chat-user-meta">
          {area ? (
            <span className="chat-user-meta-item">
              <MapPin size={11} aria-hidden />
              {area}
            </span>
          ) : null}
          {genderLabel ? (
            <span
              className={`chat-user-meta-item chat-user-gender is-${isMale ? "male" : "female"}`}
            >
              {isMale ? <Mars size={11} aria-hidden /> : <Venus size={11} aria-hidden />}
              {genderLabel}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
