/**
 * Moderation Center (Reports V2).
 *
 * The previous implementation queried the removed `user_reports` table.
 * All moderation work now flows through the 3-table Reports V2 system
 * (public.reports, discriminated by report_type) surfaced by
 * ReportsManagerV2, which also handles locks + admin logging + user
 * notifications end-to-end.
 */
import { ReportsManagerV2 } from "@/components/admin-v1/redesign/ReportsManagerV2";

export function ModerationCenter() {
  return <ReportsManagerV2 />;
}
