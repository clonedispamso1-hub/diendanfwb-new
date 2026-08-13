// Feed-scope realtime — nay uỷ quyền hoàn toàn cho `realtime-registry`.
//
// Trước đây file này tự quản một registry riêng (ref-count + removeChannel).
// Việc có 2 registry song song khiến Feed có thể mở channel riêng trong khi
// các tính năng khác dùng registry chung. Giờ Feed dùng ĐÚNG một channel
// `feed-posts` do registry chung cấp phát:
//   - Cùng key → không bao giờ tạo channel trùng.
//   - Subscriber cuối unmount → registry tự `removeChannel` (không rò rỉ).
//   - API công khai (subscribeFeedRealtime / useFeedRealtime) giữ nguyên.

import { useEffect } from "react";
import {
  subscribeRealtime,
  pickNew,
  pickOld,
  type ChangePayload,
  type Row,
} from "@/lib/realtime-registry";

export type { Row };

export interface FeedRealtimeHandlers {
  onPostInsert?: (row: Row | undefined) => void;
  onPostUpdate?: (row: Row | undefined) => void;
  onPostDelete?: (row: Row | undefined) => void;
  onVideoChange?: (row: Row | undefined) => void;
  onStatus?: (status: string) => void;
}

/** Thứ tự topic phải khớp với `topicIndex` trả về từ registry. */
const FEED_TOPICS = [
  { table: "posts", event: "INSERT" as const },
  { table: "posts", event: "UPDATE" as const },
  { table: "posts", event: "DELETE" as const },
  { table: "videos_social", event: "*" as const },
];

/** Subscribe vào channel feed dùng chung. Trả về hàm huỷ đăng ký. */
export function subscribeFeedRealtime(
  handlers: FeedRealtimeHandlers,
  channelKey = "feed-posts",
): () => void {
  return subscribeRealtime({
    key: channelKey,
    topics: FEED_TOPICS,
    onChange: (payload: ChangePayload, topicIndex: number) => {
      switch (topicIndex) {
        case 0:
          handlers.onPostInsert?.(pickNew(payload));
          break;
        case 1:
          handlers.onPostUpdate?.(pickNew(payload));
          break;
        case 2:
          handlers.onPostDelete?.(pickOld(payload));
          break;
        default:
          handlers.onVideoChange?.(pickNew(payload) ?? pickOld(payload));
      }
    },
    onStatus: (status) => handlers.onStatus?.(status),
  });
}

/** React hook wrapper. Handlers nên là object ref-stable. */
export function useFeedRealtime(handlers: FeedRealtimeHandlers, channelKey = "feed-posts") {
  useEffect(() => {
    const off = subscribeFeedRealtime(handlers, channelKey);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);
}
