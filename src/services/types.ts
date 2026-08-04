/**
 * Shared domain types for the Admin Panel.
 *
 * These interfaces intentionally mirror the shape of the FUTURE Supabase
 * tables (see ./README.md). Today the services return mock data that
 * conforms to these types; tomorrow the same shapes will come back from
 * Supabase queries with zero UI changes.
 */

export type UUID = string;
export type ISODateString = string;

export type UserRole = "user" | "moderator" | "admin";
export type UserStatus = "active" | "muted" | "locked" | "banned";

export interface Profile {
  id: UUID;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  reputation: number;
  created_at: ISODateString;
}

export type PostStatus = "published" | "hidden" | "deleted" | "pinned";

export interface Post {
  id: UUID;
  author_id: UUID;
  author?: Pick<Profile, "id" | "username" | "avatar_url">;
  title: string | null;
  content: string;
  media_urls: string[];
  status: PostStatus;
  is_pinned: boolean;
  comments_locked: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface Comment {
  id: UUID;
  post_id: UUID;
  author_id: UUID;
  author?: Pick<Profile, "id" | "username" | "avatar_url">;
  content: string;
  is_hidden: boolean;
  created_at: ISODateString;
}

export type ReportTarget = "post" | "comment" | "user";
export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";

export interface Report {
  id: UUID;
  reporter_id: UUID;
  target_type: ReportTarget;
  target_id: UUID;
  reason: string;
  details: string | null;
  status: ReportStatus;
  handled_by: UUID | null;
  handled_at: ISODateString | null;
  created_at: ISODateString;
}

export type ReputationChangeReason =
  | "post_liked"
  | "post_removed"
  | "penalty_applied"
  | "admin_adjustment"
  | "comment_helpful";

export interface ReputationRecord {
  id: UUID;
  user_id: UUID;
  delta: number;
  reason: ReputationChangeReason;
  note: string | null;
  created_by: UUID | null;
  created_at: ISODateString;
}

export type NotificationType =
  | "report_update"
  | "penalty"
  | "mention"
  | "reply"
  | "system";

export interface Notification {
  id: UUID;
  user_id: UUID;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: ISODateString | null;
  created_at: ISODateString;
}

export type AdminAction =
  | "lock_user"
  | "unlock_user"
  | "mute_user"
  | "delete_post"
  | "pin_post"
  | "unpin_post"
  | "mute_comments"
  | "apply_penalty"
  | "delete_report"
  | "add_banned_word"
  | "remove_banned_word";

export interface AdminLog {
  id: UUID;
  admin_id: UUID;
  action: AdminAction;
  target_type: "user" | "post" | "comment" | "report" | "system";
  target_id: UUID | null;
  metadata: Record<string, unknown> | null;
  created_at: ISODateString;
}

export interface PinnedPost {
  post_id: UUID;
  pinned_by: UUID;
  pinned_at: ISODateString;
}

export interface BannedWord {
  id: UUID;
  word: string;
  severity: "soft" | "hard";
  created_by: UUID;
  created_at: ISODateString;
}

/** Generic result envelope returned by every service mutation. */
export interface ServiceResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}
