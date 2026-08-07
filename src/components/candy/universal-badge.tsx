/**
 * <UniversalBadge /> — COMPONENT BADGE DUY NHẤT của toàn bộ website.
 *
 * MỌI nơi có avatar / username (trang chủ, hồ sơ, bài viết, bình luận,
 * tin nhắn, thông báo, danh sách theo dõi, tìm kiếm, FWB, video...) đều
 * phải import component này. Không được tự render badge riêng ở màn hình
 * nào khác — 1 tài khoản = 1 badge, giống hệt nhau ở mọi nơi.
 *
 * Rules (product-locked):
 *   • Admin chính              → Crown 3D vàng.
 *   • Clone VIP (Admin Panel → Quản lý tài khoản thứ hai)
 *                              → CHỈ tick xanh VIP, không bao giờ badge động vật.
 *   • User thường              → 1 badge vector cố định (profiles.badge_id).
 *   • Không bao giờ hiển thị 2 badge chính cùng lúc.
 *   • Medal Top 1/2/3 hiển thị cạnh badge chính (không thay thế).
 */
import type React from "react";
import { useMemo, type CSSProperties } from "react";
import { toast } from "sonner";
import { useLeaderboardRank } from "@/components/candy/leaderboard-badges-provider";
import {
  GlyphCrown3D,
  GlyphMedal,
  GlyphTick,
} from "@/components/candy/badge-glyphs";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";

export interface UniversalBadgeProfile {
  id?: string | null;
  user_id?: string | null;
  is_admin?: boolean | null;
  role?: string | null;
  badge_id?: string | null;
  is_virtual?: boolean | null;
  is_seed_account?: boolean | null;
  is_clone?: boolean | null;
  province?: string | null;
  location?: string | null;
}

export interface UniversalBadgeProps {
  profile: UniversalBadgeProfile | null | undefined;
  /** Icon pixel size — mặc định 20px (nhỏ gọn, nét, cao bằng chữ). */
  size?: number;
  /** Khoảng cách giữa các icon (px). */
  gap?: number;
  /** Ẩn medal Top 1/2/3 (chỉ hiện badge chính). */
  hideMedal?: boolean;
  /** Ẩn Media VIP sau tên (chỉ dùng khi chỗ đó đã render riêng). */
  hideVipMedia?: boolean;
  className?: string;
  style?: CSSProperties;
}

/* -------------------------------------------------------------------- */
/*  Rank tier → avatar-border color (exported so <UserAvatar /> reuses)  */
/* -------------------------------------------------------------------- */

export type RankTier = "gold" | "silver" | "bronze" | "default";

export function tierFromRank(rank: number | null | undefined): RankTier {
  if (!rank || rank < 1) return "default";
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "default";
}

/** Best (lowest) rank across all leaderboards the user appears on. */
export function useBestRank(userId: string | null | undefined): number | null {
  const r = useLeaderboardRank(userId);
  const values = [r.follow, r.stars].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  if (values.length === 0) return null;
  return Math.min(...values);
}

/* -------------------------------------------------------------------- */
/*  Reusable tap-tooltip wiring                                          */
/* -------------------------------------------------------------------- */

function badgeButton(label: string, toastNode?: React.ReactNode) {
  const fire = () => toast(toastNode ?? label, { duration: 2800 });
  return {
    role: "button" as const,
    tabIndex: 0,
    title: label,
    "aria-label": label,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      fire();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fire();
      }
    },
  };
}

/* -------------------------------------------------------------------- */
/*  Main component                                                       */
/* -------------------------------------------------------------------- */

export function UniversalBadge({
  profile,
  size = 20,
  gap = 5,
  hideMedal = false,
  hideVipMedia = false,
  className,
  style,
}: UniversalBadgeProps) {
  const userId = profile?.id ?? profile?.user_id ?? null;
  const isAdmin = profile?.is_admin === true || profile?.role === "admin";
  const isCloneVip =
    !isAdmin &&
    (profile?.is_virtual === true ||
      profile?.is_seed_account === true ||
      profile?.is_clone === true);
  const rank = useLeaderboardRank(userId);

  const topMedal = useMemo(() => {
    if (isAdmin || hideMedal) return null; // admins never show medals
    const best = [rank.follow, rank.stars].filter(
      (v): v is number => typeof v === "number" && v > 0,
    );
    if (best.length === 0) return null;
    const r = Math.min(...best);
    if (r > 3) return null;
    const rgb = r === 1 ? "250 204 21" : r === 2 ? "203 213 225" : "217 119 6";
    return { rgb, label: `Top ${r}` };
  }, [isAdmin, hideMedal, rank.follow, rank.stars]);

  const area = (profile?.province || profile?.location || "").trim();

  if (!profile) return null;

  // Icon sau tên: tăng ~18% so với trước để cân với chữ, vẫn không quá to.
  const sizeVars = {
    "--ub-size": `${Math.min(Math.max(Math.round((size ?? 20) * 1.18), 19), 26)}px`,
  } as CSSProperties;


  return (
    <span
      className={`user-badges ${className || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        verticalAlign: "-0.12em",
        lineHeight: 1,
        flex: "0 0 auto",
        ...sizeVars,
        ...style,
      }}
    >

      {isAdmin ? (
        <span
          {...badgeButton(
            "Tài khoản ADMIN chính thức",
            <span className="ub-toast">
              <strong>Tài khoản ADMIN chính thức</strong>
              <span>Quản trị viên Diễn Đàn FWB</span>
            </span>,
          )}
          className="ub-badge ub-badge--crown"
        >
          <GlyphCrown3D className="ub-badge__svg" />
        </span>
      ) : isCloneVip ? (
        <span
          {...badgeButton(
            "Thành viên VIP",
            <span className="ub-toast">
              <strong>Thành viên VIP</strong>
              <span>Đã tham gia cộng đồng VIP Zalo</span>
              <span>Khu vực: VIP Zalo {area || "Toàn Quốc"}</span>
            </span>,
          )}
          className="ub-badge ub-badge--tick"
        >
          <GlyphTick className="ub-badge__svg" />
        </span>
      ) : null}



      {!hideVipMedia && userId ? <CloneVipNameMedia userId={userId} /> : null}

      {topMedal ? (
        <span
          {...badgeButton(topMedal.label)}
          className="ub-badge ub-badge--medal"
          style={{ "--ub-rgb": topMedal.rgb } as CSSProperties}
        >
          <GlyphMedal className="ub-badge__svg" />
        </span>
      ) : null}
    </span>
  );
}

export default UniversalBadge;
