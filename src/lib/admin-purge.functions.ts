/**
 * 🔐 SERVER FUNCTIONS cho "Xóa tất cả" — ĐẾM và XOÁ đều chạy phía máy chủ.
 *
 * Trình duyệt chỉ gửi: module + access token của phiên admin + cụm từ "XOA".
 * Server tự xác thực admin (bangchu / profiles.is_admin) rồi mới thao tác.
 * Service Role Key không bao giờ rời khỏi máy chủ.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DbId } from "@/lib/admin-purge.server";

export type ServerCountRow = { label: string; count: number | null; note?: string };
export type ServerPurgeLine = { label: string; deleted: number | null; kept?: number; error?: string };

export type CountResponse =
  | { ok: true; rows: ServerCountRow[] }
  | { ok: false; error: string; missingEnv?: string[] };

export type PurgeResponse =
  | { ok: true; lines: ServerPurgeLine[]; blocked: string[] }
  | { ok: false; error: string; missingEnv?: string[] };

const Input = z.object({
  module: z.enum(["fish", "posts", "reports"]),
  token: z.string().min(10),
});

const PurgeInput = Input.extend({
  /** Cụm từ người dùng gõ trong hộp xác nhận — server kiểm tra lại. */
  confirm: z.string(),
});

/* ------------------------------ ĐẾM (read-only) --------------------------- */

export const purgeCountFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<CountResponse> => {
    const S = await import("@/lib/admin-purge.server");

    const dbs: DbId[] =
      data.module === "fish" ? ["sb1"] : data.module === "posts" ? ["sb1", "sb3"] : ["sb1", "sb4"];
    const missing = S.missingServiceKeys(dbs);
    if (missing.length) {
      return { ok: false, error: `Thiếu khoá máy chủ: ${missing.join(", ")}`, missingEnv: missing };
    }

    const admin = await S.verifyAdmin(data.token);
    if (!admin.ok) return { ok: false, error: admin.reason };

    if (data.module === "fish") {
      const [transfers, giftsClaimed, giftsUnclaimed, wdFinished, wdProtected] = await Promise.all([
        S.countRows("sb1", "transfer_transactions"),
        S.countRows("sb1", "post_gifts", "claimed=eq.true"),
        S.countRows("sb1", "post_gifts", "claimed=eq.false"),
        S.countRows("sb1", "withdrawal_requests", `status=in.(${S.WITHDRAW_FINISHED.join(",")})`),
        S.countRows("sb1", "withdrawal_requests", `status=in.(${S.WITHDRAW_PROTECTED.join(",")})`),
      ]);
      const gemTx = await S.countRows("sb1", "gem_transactions");
      return {
        ok: true,
        rows: [
          { label: "Chuyển tiền + Nhận tiền", count: transfers, note: "transfer_transactions — xoá hết" },
          { label: "Tặng quà + Nhận quà (đã nhận)", count: giftsClaimed, note: "post_gifts · claimed = true — xoá" },
          { label: "Quà CHƯA nhận", count: giftsUnclaimed, note: "GIỮ LẠI — tiền chưa vào ví" },
          { label: "Rút tiền (đã xử lý xong)", count: wdFinished, note: "approved/rejected/refunded/paid/cancelled — xoá" },
          { label: "Rút tiền ĐANG CHỜ", count: wdProtected, note: "GIỮ LẠI — pending/processing/reviewing" },
          { label: "Sổ ví (gem_transactions)", count: gemTx, note: "CHỈ ĐỌC — không bao giờ xoá" },
        ],
      };
    }

    if (data.module === "posts") {
      const [posts, comments, likes, commentLikes, views] = await Promise.all([
        S.countRows("sb3", "posts"),
        S.countRows("sb3", "comments"),
        S.countRows("sb3", "likes"),
        S.countRows("sb3", "comment_likes"),
        S.countRows("sb3", "post_views"),
      ]);
      return {
        ok: true,
        rows: [
          { label: "Bài viết", count: posts },
          { label: "Bình luận", count: comments },
          { label: "Lượt thích bài", count: likes },
          { label: "Lượt thích bình luận", count: commentLikes },
          { label: "Lượt xem", count: views },
        ],
      };
    }

    const [total, pending, approved, rejected] = await Promise.all([
      S.countRows("sb4", "reports"),
      S.countRows("sb4", "reports", "status=eq.pending"),
      S.countRows("sb4", "reports", "status=eq.approved"),
      S.countRows("sb4", "reports", "status=eq.rejected"),
    ]);
    return {
      ok: true,
      rows: [
        { label: "Tổng đơn tố cáo", count: total, note: "xoá hết" },
        { label: "Chờ duyệt", count: pending, note: "chưa quyết định thưởng" },
        { label: "Đã thưởng", count: approved, note: "xu đã cộng vẫn giữ nguyên trong ví" },
        { label: "Từ chối", count: rejected },
      ],
    };
  });

/* --------------------------------- XOÁ ----------------------------------- */

export const purgeExecuteFn = createServerFn({ method: "POST" })
  .inputValidator((d) => PurgeInput.parse(d))
  .handler(async ({ data }): Promise<PurgeResponse> => {
    if (data.confirm.trim().toUpperCase() !== "XOA") {
      return { ok: false, error: 'Thiếu xác nhận: phải gõ đúng "XOA".' };
    }

    const S = await import("@/lib/admin-purge.server");
    const plan = S.PURGE_PLAN[data.module];

    const missing = S.missingServiceKeys(["sb1", plan.db]);
    if (missing.length) {
      return { ok: false, error: `Thiếu khoá máy chủ: ${missing.join(", ")}`, missingEnv: missing };
    }

    const admin = await S.verifyAdmin(data.token);
    if (!admin.ok) return { ok: false, error: admin.reason };

    const blocked: string[] = [];
    const lines: ServerPurgeLine[] = [];

    if (data.module === "fish") {
      const unclaimed = await S.countRows("sb1", "post_gifts", "claimed=eq.false");
      const pending = await S.countRows(
        "sb1",
        "withdrawal_requests",
        `status=in.(${S.WITHDRAW_PROTECTED.join(",")})`,
      );
      if ((unclaimed ?? 0) > 0) blocked.push(`${unclaimed} quà chưa nhận được GIỮ LẠI (tiền chưa vào ví).`);
      if ((pending ?? 0) > 0)
        blocked.push(`${pending} đơn rút đang chờ được GIỮ LẠI — hãy duyệt hoặc từ chối trước.`);
      blocked.push("Không chạm gem_transactions, profiles.gem_balance, tài khoản/auth.");
    } else if (data.module === "posts") {
      blocked.push("Không xoá tài khoản / hồ sơ / ví và không xoá file ảnh, video trong kho lưu trữ.");
      blocked.push("Đơn tố cáo nằm ở Supabase #4 → xử lý riêng, không xoá kèm.");
    } else {
      blocked.push("Ảnh bằng chứng trong kho lưu trữ KHÔNG bị xoá; xu đã thưởng vẫn nằm trong ví.");
    }

    for (const step of plan.steps) {
      const r = await S.deleteRows(plan.db, step.table, step.filter);
      lines.push({ label: step.label, ...r });
    }

    return { ok: true, lines, blocked };
  });
