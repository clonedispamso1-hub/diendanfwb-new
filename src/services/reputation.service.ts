/**
 * Reputation service.
 *
 * TODO(supabase): read from `public.reputation_history`; the current score
 * on `profiles.reputation` is maintained by a Postgres trigger.
 */
import type {
  ReputationChangeReason,
  ReputationRecord,
  ServiceResult,
  UUID,
} from "./types";
import { delay, nowIso, uid } from "./_mock";

const mockHistory: ReputationRecord[] = [];

export const reputationService = {
  async history(userId: UUID): Promise<ReputationRecord[]> {
    await delay();
    return mockHistory.filter((r) => r.user_id === userId);
  },

  async score(userId: UUID): Promise<number> {
    await delay();
    return mockHistory
      .filter((r) => r.user_id === userId)
      .reduce((sum, r) => sum + r.delta, 0);
  },

  async adjust(input: {
    user_id: UUID;
    delta: number;
    reason: ReputationChangeReason;
    note?: string;
    created_by?: UUID;
  }): Promise<ServiceResult<ReputationRecord>> {
    await delay();
    const record: ReputationRecord = {
      id: uid(),
      user_id: input.user_id,
      delta: input.delta,
      reason: input.reason,
      note: input.note ?? null,
      created_by: input.created_by ?? null,
      created_at: nowIso(),
    };
    mockHistory.push(record);
    return { ok: true, data: record };
  },
};
