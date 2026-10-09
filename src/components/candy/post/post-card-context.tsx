import { createContext, useContext } from "react";
import type { PostRecord } from "@/lib/app-types";
import type { SeedGroupOption } from "@/lib/seed-account-groups";

/** Popup Nhóm trên bài viết thuộc hồ sơ người khác — chỉ ProfilePage truyền xuống. */
export interface ProfileGroupsPopupData {
  groups: SeedGroupOption[];
  loading: boolean;
  error?: boolean;
  retry?: () => void;
  displayName: string;
}

export interface PostCardContextValue {
  post: PostRecord;
  meId?: string;
  isAnonymous: boolean;
  isPostOwner: boolean;
  canDelete: boolean;
  authorName: string;
  authorLocation: string;
  postTime: string;
  hasStory: boolean;
  following: boolean;
  followBusy: boolean;
  images: string[];
  compactMedia?: boolean;
  isEdited: boolean;
  pinnedActive: boolean;
  featuredActive: boolean;
  isLocked: boolean;
  lockedReason: string | null;
  categoryMeta: { label: string; emoji: string; className: string } | null;

  likes: number;
  botLikes: number;
  liked: boolean;
  likeBurst: number;
  autoLikeBump: number;
  autoLikeAmount: number;
  viewCount: number;
  likeCooldownUntil: number;

  editingCaption: boolean;
  editText: string;
  savingEdit: boolean;
  menuOpen: boolean;
  reportOpen: boolean;

  onViewProfile: (userId: string) => void;
  quickFollow: (e: React.MouseEvent | React.KeyboardEvent) => void;
  toggleLike: () => void;
  setEditText: (v: string) => void;
  setEditingCaption: (v: boolean) => void;
  saveEdit: () => Promise<void>;
  startEdit: () => void;
  removePost: () => Promise<void>;
  openReport: () => void;
  setReportOpen: (v: boolean) => void;
  copyUrl: () => Promise<void>;
  copyUid: () => Promise<void>;
  openPostMenu: (e: React.MouseEvent) => void;
  setMenuOpen: (v: boolean) => void;

  onRefresh: () => void;
  onRemoved?: (postId: string) => void;
  /** Có giá trị chỉ khi card nằm trong hồ sơ người khác: icon Nhóm mở popup thay vì điều hướng. */
  profileGroupsPopup?: ProfileGroupsPopupData | null;
  /** PHẦN 5: đánh dấu view thật khi card thực sự hiện trong viewport. */
  trackView: () => Promise<void>;

}

const Ctx = createContext<PostCardContextValue | null>(null);

export const PostCardProvider = Ctx.Provider;

export function usePostCard(): PostCardContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePostCard must be used inside <PostCard>");
  return v;
}
