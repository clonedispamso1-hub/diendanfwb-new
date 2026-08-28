/**
 * ĐÃ VÔ HIỆU HOÁ sau cutover 100% sang Supabase #3.
 *
 * Trước đây: GHI ở Supabase #1 → write-through sang #3 để phần ĐỌC (#3) không
 * bị trễ. Nay Feed / Chat / Follows GHI trực tiếp vào Supabase #3 (định tuyến
 * trong `src/services/database/config.ts`), nên việc kéo dữ liệu từ #1 sang #3
 * sẽ làm sống lại bản ghi cũ / đã xoá.
 *
 * Giữ nguyên chữ ký hàm để không phải sửa hàng chục call site; thân hàm là no-op.
 */

type Table = "posts" | "comments" | "likes" | "follows";

export function syncToS3(
  _table: Table,
  _ident: {
    id?: string | null;
    follower_id?: string | null;
    following_id?: string | null;
    post_id?: string | null;
    user_id?: string | null;
  },
  _op: "upsert" | "delete" = "upsert",
): void {
  /* no-op: đã ghi trực tiếp vào Supabase #3 */
}

/** Tim: khoá là cặp (post_id, user_id). */
export function syncLikeRowToS3(
  _postId: string,
  _userId: string,
  _op: "upsert" | "delete",
): void {
  /* no-op */
}

/** Sau khi thêm bình luận. */
export function syncRecentCommentsForPost(_postId: string): void {
  /* no-op */
}
