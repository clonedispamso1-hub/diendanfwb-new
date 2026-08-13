import { createContext, useContext } from "react";
import type { PostRecord } from "@/lib/app-types";

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
  commentsDisabled: boolean;
  categoryMeta: { label: string; emoji: string; className: string } | null;

  likes: number;
  botLikes: number;
  comments: number;
  liked: boolean;
  likeBurst: number;
  autoLikeBump: number;
  autoLikeAmount: number;
  commentBurst: number;
  viewCount: number;
  likeCooldownUntil: number;
  totalGifted: number;
  showGiftBurst: boolean;

  editingCaption: boolean;
  editText: string;
  savingEdit: boolean;
  menuOpen: boolean;
  reportOpen: boolean;
  giftMenuOpen: boolean;
  giftHistoryOpen: boolean;
  openComments: boolean;

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
  setCommentBurst: React.Dispatch<React.SetStateAction<number>>;
  setOpenComments: (v: boolean) => void;
  setGiftMenuOpen: (v: boolean) => void;
  setGiftHistoryOpen: (v: boolean) => void;
  setTotalGifted: React.Dispatch<React.SetStateAction<number>>;
  setShowGiftBurst: (v: boolean) => void;

  onRefresh: () => void;
  onRemoved?: (postId: string) => void;
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
