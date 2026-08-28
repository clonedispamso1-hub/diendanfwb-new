/**
 * CLIENT SUPABASE CÓ ĐỊNH TUYẾN (Database Router).
 *
 * Mọi component / page / hook PHẢI import `supabase` từ file này (hoặc dùng
 * `Database.*` trong `@/services/database`). KHÔNG import trực tiếp
 * `@/integrations/supabase/client`, `logs-client`, `secondary-client` hay gọi
 * `createClient()`.
 *
 * `supabase.from(table)` VÀ `supabase.channel(...).on("postgres_changes", ...)`
 * tự chọn database theo `TABLE_ROUTES` (`src/services/database/config.ts`).
 * Vì vậy khi chuyển một module sang Supabase khác chỉ cần sửa đúng file config
 * đó — không đụng vào component.
 *
 * Auth, storage, rpc vẫn đi qua Supabase 1 (core): tài khoản/mật khẩu, session
 * và danh sách chặn nằm ở "bàn thờ hệ thống" (Supabase 1).
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase as coreClient, db3 } from "@/lib/db/router";
import { targetForTable, type DbTarget } from "@/services/database/config";

/** Client thật ứng với một bảng, theo bảng định tuyến. */
export function clientForTable(table: string): SupabaseClient<any> {
  return targetForTable(table) === "social"
    ? (db3() as SupabaseClient<any>)
    : (coreClient as SupabaseClient<any>);
}

const clientForTarget = (target: DbTarget): SupabaseClient<any> =>
  target === "social" ? (db3() as SupabaseClient<any>) : (coreClient as SupabaseClient<any>);

/**
 * Channel "ảo" định tuyến từng listener `postgres_changes` sang đúng database
 * theo tên bảng. Presence / broadcast luôn chạy trên Supabase 1 (core) để mọi
 * client gặp nhau trên cùng một socket.
 *
 * Nhờ vậy khi một bảng được chuyển sang Supabase 3, realtime của bảng đó tự
 * chuyển theo — không phải sửa hàng chục component đang gọi `.channel()`.
 */
class RoutedChannel {
  private readonly parts = new Map<DbTarget, RealtimeChannel>();

  constructor(
    private readonly name: string,
    private readonly opts?: unknown,
  ) {}

  private part(target: DbTarget): RealtimeChannel {
    let ch = this.parts.get(target);
    if (!ch) {
      const client = clientForTarget(target) as any;
      ch = this.opts ? client.channel(this.name, this.opts) : client.channel(this.name);
      this.parts.set(target, ch!);
    }
    return ch!;
  }

  on(type: string, filter: any, callback?: any): this {
    const table = type === "postgres_changes" ? (filter?.table as string | undefined) : undefined;
    const target: DbTarget = table ? targetForTable(table) : "core";
    (this.part(target) as any).on(type, filter, callback);
    return this;
  }

  subscribe(callback?: any): this {
    // Nếu chưa có listener nào thì vẫn mở channel trên core (presence/broadcast).
    if (this.parts.size === 0) this.part("core");
    for (const ch of this.parts.values()) (ch as any).subscribe(callback);
    return this;
  }

  unsubscribe(): Promise<"ok" | "timed out" | "error"> {
    const all = [...this.parts.values()].map((ch) => (ch as any).unsubscribe());
    return Promise.all(all).then(() => "ok" as const);
  }

  send(payload: any, opts?: any) {
    return (this.part("core") as any).send(payload, opts);
  }

  track(payload: any, opts?: any) {
    return (this.part("core") as any).track(payload, opts);
  }

  untrack(opts?: any) {
    return (this.part("core") as any).untrack(opts);
  }

  presenceState() {
    return (this.part("core") as any).presenceState();
  }

  get topic(): string {
    return `realtime:${this.name}`;
  }

  /** Các channel thật bên dưới (dùng cho removeChannel). */
  __parts(): { client: SupabaseClient<any>; channel: RealtimeChannel }[] {
    return [...this.parts.entries()].map(([target, channel]) => ({
      client: clientForTarget(target),
      channel,
    }));
  }
}

const isRouted = (value: unknown): value is RoutedChannel => value instanceof RoutedChannel;

/**
 * Proxy mỏng quanh client core: ghi đè `from()` (định tuyến theo bảng) và
 * `channel()` / `removeChannel()` (định tuyến realtime theo bảng).
 * Tất cả thuộc tính khác (auth, storage, functions, rpc…) giữ nguyên tham
 * chiếu tới client core (Supabase 1).
 */
export const supabase = new Proxy(coreClient as SupabaseClient<any>, {
  get(target, prop, receiver) {
    if (prop === "from") {
      return (table: string) => clientForTable(table).from(table);
    }
    if (prop === "channel") {
      return (name: string, opts?: unknown) =>
        new RoutedChannel(name, opts) as unknown as RealtimeChannel;
    }
    if (prop === "removeChannel") {
      return (channel: RealtimeChannel) => {
        if (isRouted(channel)) {
          return Promise.all(
            channel.__parts().map(({ client, channel: real }) => client.removeChannel(real)),
          ).then(() => "ok" as const);
        }
        return coreClient.removeChannel(channel);
      };
    }
    if (prop === "removeAllChannels") {
      return () =>
        Promise.all([coreClient.removeAllChannels(), db3().removeAllChannels()]).then(
          ([a]) => a,
        );
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) as SupabaseClient<any>;

/** Client core thô — chỉ dành cho hạ tầng (auth provider, admin session). */
export { coreClient };
export default supabase;
