import { useLeaderboardRank } from "@/components/candy/leaderboard-badges-provider";
import type { PostRecord } from "@/lib/app-types";

export type FeedSurface = "home" | "admin-notice" | "following" | "none";

export type PostCategoryKind =
  | "notice"
  | "admin"
  | "top-stars"
  | "top-follow"
  | "new-member"
  | "member-age"
  | "member-official"
  | "home";

export interface PostCategoryInfo {
  kind: PostCategoryKind;
  label: string;
  subLabel: string | null;
}

function pickAdminNoticeLabel(post: PostRecord): string {
  const pri = (post as any).admin_priority as string | undefined;
  if (pri === "urgent") return "KHẨN CẤP";
  if (pri === "important") return "QUAN TRỌNG";
  return "THÔNG BÁO";
}

function daysSince(iso?: string | null): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 86_400_000;
}

/**
 * Resolve which classification applies to a post on a given feed surface.
 * Priority: notice > admin > TOP rank (stars → follow) > account-age labels.
 * Returns null when the card should NOT render a category label at all
 * (profile / post-detail / following feed).
 */
export function usePostCategoryInfo(
  post: PostRecord,
  surface: FeedSurface,
): PostCategoryInfo | null {
  const authorId = post.user_id;
  const { follow, stars } = useLeaderboardRank(authorId);

  if (surface === "none") return null;
  if (surface === "following") return null;

  const isNotice = Boolean((post as any).is_admin_post);
  const isAuthorAdmin = Boolean((post.profiles as any)?.is_admin);
  const memberDays = daysSince((post.profiles as any)?.created_at);

  if (surface === "admin-notice" || isNotice) {
    return {
      kind: "notice",
      label: pickAdminNoticeLabel(post),
      subLabel: isAuthorAdmin ? "ADMIN" : null,
    };
  }
  if (isAuthorAdmin) {
    return { kind: "admin", label: "THÔNG BÁO", subLabel: "ADMIN" };
  }
  if (stars) {
    return { kind: "top-stars", label: `TOP ${stars} NGÔI SAO`, subLabel: null };
  }
  if (follow) {
    return { kind: "top-follow", label: `TOP ${follow} FOLLOW`, subLabel: null };
  }

  // UI: không hiển thị nhãn phân loại theo tuổi tài khoản
  // ("THÀNH VIÊN MỚI" / "... NGÀY TUỔI" / "THÀNH VIÊN CHÍNH THỨC").
  void memberDays;
  return null;
}


/**
 * Outside-of-card classification label. Rendered ABOVE the PostCard as
 * a section marker (never inside .pc-card).
 */
export function PostCategoryLabel({ info }: { info: PostCategoryInfo }) {
  return (
    <div
      className={`pc-cat-label pc-cat-label--${info.kind}`}
      data-kind={info.kind}
    >
      <span className="pc-cat-label__text">{info.label}</span>
      {info.subLabel ? (
        <>
          <span className="pc-cat-label__dot" aria-hidden>·</span>
          <span className="pc-cat-label__sub">{info.subLabel}</span>
        </>
      ) : null}
    </div>
  );
}
