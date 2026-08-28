/**
 * chat-db — client dùng cho TOÀN BỘ luồng chat (messages, chat_partners,
 * message_reactions, conversation_clears).
 *
 * Sau bước migrate cuối: chat ĐỌC + GHI + Realtime đều nằm ở Supabase #3
 * (uaqsetfdciyzxpuhulux) → egress chat trên Supabase #1 = 0.
 *
 * Xác thực: người dùng vẫn đăng nhập ở #1. Vì #1 dùng khoá bất đối xứng
 * (ES256 + kid), #3 chưa thể verify token của #1 → #3 chạy bằng publishable
 * key với policy `*_anon_bridge` (xem supabase-sql/s3/020_chat_anon_bridge.sql).
 * Khi #3 được bật Third-Party Auth trỏ JWKS của #1: drop các policy bridge và
 * bật forward token — mọi call site không cần sửa vì đều đi qua `chatDb()`.
 */
import { db } from "@/lib/db/router";

/** Client chat (Supabase #3, qua Database Router). */
export const chatDb = () => db("chat") as any;
