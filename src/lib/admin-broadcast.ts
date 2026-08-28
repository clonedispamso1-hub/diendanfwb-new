// Kênh realtime broadcast dùng chung cho các thao tác "dọn dữ liệu" của Admin.
//
// Khi Admin xóa toàn bộ bài viết / toàn bộ tài khoản, mọi client đang online
// phải xoá sạch cache (React Query + state cục bộ) NGAY LẬP TỨC, không đợi
// người dùng tương tác hay F5.
import { supabase } from "@/lib/db/router";

export type PurgeKind = "posts" | "accounts";

const CHANNEL_NAME = "admin-purge";
const EVENT = "purge";

type Handler = (kind: PurgeKind) => void;

const handlers = new Set<Handler>();
let channel: ReturnType<typeof supabase.channel> | null = null;

function ensureChannel() {
  if (channel) return channel;
  channel = supabase
    .channel(CHANNEL_NAME, { config: { broadcast: { self: true } } })
    .on("broadcast", { event: EVENT }, (msg: any) => {
      const kind = msg?.payload?.kind as PurgeKind | undefined;
      if (!kind) return;
      handlers.forEach((h) => {
        try {
          h(kind);
        } catch {
          /* noop */
        }
      });
    })
    .subscribe();
  return channel;
}

/** Lắng nghe sự kiện purge (realtime + trong cùng tab). Trả về hàm huỷ. */
export function onAdminPurge(handler: Handler): () => void {
  ensureChannel();
  handlers.add(handler);
  const local = (e: Event) => {
    const kind = (e as CustomEvent).detail?.kind as PurgeKind | undefined;
    if (kind) handler(kind);
  };
  if (typeof window !== "undefined") window.addEventListener("admin:purge", local);
  return () => {
    handlers.delete(handler);
    if (typeof window !== "undefined") window.removeEventListener("admin:purge", local);
    if (handlers.size === 0 && channel) {
      const staleChannel = channel;
      channel = null;
      void supabase.removeChannel(staleChannel);
    }
  };
}

/** Phát sự kiện purge tới toàn bộ client đang online + tab hiện tại. */
export async function broadcastAdminPurge(kind: PurgeKind): Promise<void> {
  try {
    await ensureChannel().send({ type: "broadcast", event: EVENT, payload: { kind } });
  } catch {
    /* noop — vẫn phát sự kiện cục bộ bên dưới */
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("admin:purge", { detail: { kind } }));
    } catch {
      /* noop */
    }
  }
}
