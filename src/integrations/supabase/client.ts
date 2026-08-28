// ⚠️ Đã chuyển sang Database Router trung tâm (src/lib/db/router.ts).
// File này chỉ còn là alias tương thích ngược — KHÔNG tạo client mới ở đây.
// Muốn đổi Supabase cho một module: sửa src/lib/db/config.ts
export { supabase, db, getInstanceClient } from "@/lib/db/router";
