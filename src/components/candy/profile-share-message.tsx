import { useState } from "react";
import { Check } from "lucide-react";
import type { Profile } from "@/lib/app-types";
import { ProfileIdCardPopup } from "@/components/candy/profile-id-card-popup";
import type { ProfileShareKind } from "@/lib/profile-share";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { PingFlameIcon, ProfileCardIcon } from "@/components/candy/chat-share-icons";
import { isVipProfile, useHasVipNameIcon, type VipProfileLike } from "@/lib/vip-status";

interface ProfileShareMessageProps {
  kind: ProfileShareKind;
  profile: Partial<Profile> | null;
  onOpenProfile: () => void;
}

export function ProfileShareMessage({ kind, profile, onOpenProfile }: ProfileShareMessageProps) {
  const name = profile?.full_name || profile?.username || "Thành viên FWB";
  const avatar = getValidAvatarUrl(profile?.avatar);
  // Dòng dưới tên: VIP Zalo + có icon/GIF VIP sau tên → "Đã xác minh", ngược lại "Chưa xác minh".
  const hasVipNameIcon = useHasVipNameIcon((profile as any)?.id ?? null);
  const isVerified = isVipProfile(profile as VipProfileLike) && hasVipNameIcon;
  const sharedUserId = ((profile as any)?.id ?? null) as string | null;
  const [idCardOpen, setIdCardOpen] = useState(false);


  return (
    <div className={`chat-profile-message chat-profile-message--${kind}`}>
      <button type="button" className="chat-profile-message-sender" onClick={onOpenProfile}>
        <img src={avatar} alt="" onError={handleAvatarError} />
        <strong>{name}</strong>
      </button>

      {kind === "ping" ? (
        <button type="button" className="chat-profile-share chat-profile-share--ping" onClick={onOpenProfile}>
          <span className="chat-profile-share-ping-icon" aria-hidden>
            <span className="chat-profile-share-ping-glow" />
            <PingFlameIcon className="chat-profile-share-flame" />
          </span>
          <span className="chat-profile-share-copy">
            <span className="chat-profile-share-kicker">PING PROFILE</span>
            <strong>{name} đang gọi bạn</strong>
            <span>Chạm để xem hồ sơ</span>
          </span>
          <span className="chat-profile-share-arrow" aria-hidden>→</span>
        </button>
      ) : (
        <button
          type="button"
          className="chat-profile-share chat-profile-share--card"
          onClick={() => (sharedUserId ? setIdCardOpen(true) : onOpenProfile())}
        >

          <span className="chat-profile-card-avatar-wrap">
            <img src={avatar} alt="" className="chat-profile-card-avatar" onError={handleAvatarError} />
            <span className="chat-profile-card-status" aria-hidden />
          </span>
          <span className="chat-profile-share-copy">
            <span className="chat-profile-share-kicker">PROFILE CARD</span>
            <strong>{name}</strong>
            <span
              className={`chat-profile-share-verify ${isVerified ? "is-verified" : "is-unverified"}`}
            >
              {isVerified ? "Đã xác minh" : "Chưa xác minh"}
              <Check size={12} strokeWidth={3} aria-hidden="true" />
            </span>
          </span>
          <ProfileCardIcon className="chat-profile-share-card-mark" />
        </button>
      )}

      <ProfileIdCardPopup
        userId={sharedUserId}
        open={idCardOpen}
        onClose={() => setIdCardOpen(false)}
      />
    </div>
  );
}
