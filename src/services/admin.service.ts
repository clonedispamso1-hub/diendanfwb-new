/**
 * Admin actions.
 *
 * Each function is a THIN PLACEHOLDER that currently returns a mocked
 * success. When Supabase is wired up, replace each body with the actual
 * mutation + an `admin_logs` insert. The signatures MUST NOT change so
 * that the UI keeps working.
 *
 * TODO(supabase): every function should end with:
 *   await supabase.from("admin_logs").insert({ admin_id, action, target_type, target_id, metadata })
 */
import type { ServiceResult, UUID } from "./types";
import { delay } from "./_mock";

async function ok<T = void>(data?: T): Promise<ServiceResult<T>> {
  await delay();
  return { ok: true, data };
}

export const adminService = {
  lockUser: (userId: UUID, reason?: string) =>
    ok({ userId, reason: reason ?? null }),

  unlockUser: (userId: UUID) => ok({ userId }),

  muteUser: (userId: UUID, minutes: number) => ok({ userId, minutes }),

  deletePost: (postId: UUID) => ok({ postId }),

  pinPost: (postId: UUID) => ok({ postId }),

  unpinPost: (postId: UUID) => ok({ postId }),

  muteComments: (postId: UUID, muted: boolean) => ok({ postId, muted }),

  applyPenalty: (input: {
    userId: UUID;
    delta: number;
    reason: string;
  }) => ok(input),

  deleteReport: (reportId: UUID) => ok({ reportId }),

  addBannedWord: (word: string, severity: "soft" | "hard" = "soft") =>
    ok({ word, severity }),

  removeBannedWord: (id: UUID) => ok({ id }),
};

export type AdminService = typeof adminService;
