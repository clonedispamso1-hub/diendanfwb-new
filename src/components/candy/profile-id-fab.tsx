import { useState } from "react";
import { ProfileIdCardPopup } from "@/components/candy/profile-id-card-popup";

/**
 * ProfileIdFab — nút nổi cố định ở góc phải bên dưới, phía trên bottom-nav.
 *
 * Trên trang Hồ sơ thay icon Zalo 3D bằng duy nhất 1 icon "Thẻ hồ sơ thành viên":
 * icon thẻ ID màu tím, có hình người ở giữa, nhỏ gọn và premium.
 * Bấm → mở popup "THẺ HỒ SƠ THÀNH VIÊN" (ProfileIdCardPopup) tái sử dụng
 * component/data logic hiện có. Lấy dữ liệu thật của profile đang xem.
 * Không thay đổi chức năng Profile.
 */
interface ProfileIdFabProps {
  userId: string;
  /** Giữ thuộc tính để tương thích call-site hiện có; không còn dùng để hiển thị. */
  avatar?: string | null;
  alt?: string;
}

/** Thẻ ID 3D hoạt hình, không có khung tròn bao ngoài. */
function IdCardIcon() {
  return (
    <svg
      viewBox="0 0 72 60"
      width="64"
      height="54"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="pidfab-card"
          x1="10"
          y1="8"
          x2="64"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--profile-fab-pink)" />
          <stop offset="0.48" stopColor="var(--profile-fab-purple)" />
          <stop offset="1" stopColor="var(--profile-fab-deep)" />
        </linearGradient>
        <linearGradient
          id="pidfab-edge"
          x1="36"
          y1="12"
          x2="36"
          y2="55"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--profile-fab-purple)" />
          <stop offset="1" stopColor="var(--profile-fab-edge)" />
        </linearGradient>
        <linearGradient
          id="pidfab-photo"
          x1="17"
          y1="20"
          x2="38"
          y2="43"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--profile-fab-photo-top)" />
          <stop offset="1" stopColor="var(--profile-fab-photo-bottom)" />
        </linearGradient>
        <linearGradient
          id="pidfab-gloss"
          x1="16"
          y1="11"
          x2="50"
          y2="45"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--profile-fab-gloss)" stopOpacity=".72" />
          <stop offset="1" stopColor="var(--profile-fab-gloss)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Cạnh dưới tạo độ dày 3D */}
      <path
        d="M9 18 14 11h47c2.8 0 5 2.2 5 5v32c0 3-2.4 5.4-5.4 5.4H14.2A5.2 5.2 0 0 1 9 48.2V18Z"
        fill="url(#pidfab-edge)"
      />
      {/* Mặt thẻ nghiêng nhẹ */}
      <path
        d="M7 14.2A6.3 6.3 0 0 1 13.8 8l44 2.9a6.3 6.3 0 0 1 5.9 6.8l-1.9 26.7a6.3 6.3 0 0 1-6.8 5.9l-44-3A6.3 6.3 0 0 1 5.1 40.6L7 14.2Z"
        fill="url(#pidfab-card)"
      />
      <path
        d="M7 14.2A6.3 6.3 0 0 1 13.8 8l44 2.9a6.3 6.3 0 0 1 5.9 6.8L63 27 9.7 23.4 7 14.2Z"
        fill="url(#pidfab-gloss)"
      />
      <path
        d="M10.5 14.6a3.3 3.3 0 0 1 3.6-3.2l43.3 2.9c1 .1 1.8.5 2.4 1.2"
        stroke="var(--profile-fab-highlight)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity=".78"
      />
      {/* Kẹp thẻ */}
      <path
        d="M29 8.8V5.6A3.6 3.6 0 0 1 32.6 2h8.8A3.6 3.6 0 0 1 45 5.6v5.1"
        stroke="var(--profile-fab-clip)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="27.5" y="6" width="19" height="8" rx="4" fill="var(--profile-fab-clip)" />
      <rect x="31" y="8" width="12" height="3.5" rx="1.75" fill="var(--profile-fab-clip-slot)" />
      {/* Ảnh đại diện hoạt hình */}
      <rect x="11.5" y="18" width="23.5" height="23.5" rx="7" fill="url(#pidfab-photo)" />
      <circle cx="23.2" cy="26" r="4.5" fill="var(--profile-fab-portrait)" />
      <path d="M15.8 38c1-4.6 3.5-6.8 7.4-6.8s6.4 2.2 7.4 6.8" fill="var(--profile-fab-portrait)" />
      {/* Chi tiết thẻ */}
      <rect x="40" y="20.5" width="17" height="3.8" rx="1.9" fill="var(--profile-fab-detail)" />
      <rect
        x="40"
        y="28"
        width="13"
        height="3"
        rx="1.5"
        fill="var(--profile-fab-detail)"
        opacity=".72"
      />
      <rect
        x="40"
        y="34.5"
        width="10"
        height="3"
        rx="1.5"
        fill="var(--profile-fab-detail)"
        opacity=".52"
      />
      <circle cx="57" cy="41" r="4" fill="var(--profile-fab-badge)" />
      <path
        d="m55.2 41 1.2 1.2 2.3-2.5"
        stroke="var(--profile-fab-badge-mark)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m61 9.2.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2Z" fill="var(--profile-fab-sparkle)" />
    </svg>
  );
}

export function ProfileIdFab({ userId, avatar, alt = "" }: ProfileIdFabProps) {
  void avatar; // không dùng avatar cho hiển thị — chỉ icon thẻ ID tím.
  const [open, setOpen] = useState(false);
  const label = alt ? `Xem thẻ hồ sơ thành viên: ${alt}` : "Xem thẻ hồ sơ thành viên";

  return (
    <>
      <button
        type="button"
        className="profile-id-fab"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <span className="profile-id-fab__icon">
          <IdCardIcon />
        </span>
      </button>

      <ProfileIdCardPopup userId={userId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default ProfileIdFab;
