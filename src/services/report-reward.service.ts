import { sb4 } from "@/lib/supabase-v4";

export type RewardReportKind = "post" | "message" | "profile";

export interface SubmitRewardReportInput {
  reporterId: string;
  reporterName?: string | null;
  targetUid: string;
  targetName?: string | null;
  targetAvatar?: string | null;
  kind: RewardReportKind;
  reason: string;
  proofUrl?: string | null;
}

/** Shared submission path for the existing reward-report system. */
export async function submitRewardReport(input: SubmitRewardReportInput) {
  const { error } = await sb4().from("reports").insert({
    reporter_id: input.reporterId,
    reporter_name: input.reporterName ?? null,
    target_uid: input.targetUid,
    target_name: input.targetName ?? null,
    target_avatar: input.targetAvatar ?? null,
    kind: input.kind,
    reason: input.reason.trim(),
    proof_url: input.proofUrl ?? null,
    status: "pending",
  });
  if (error) throw error;
}