/**
 * Legacy admin reports tab, now backed by Reports V2 (3-table system).
 *
 * The `onSelectUser` prop is accepted for backwards compatibility but the
 * new manager surfaces user context directly inside its detail modal.
 */
import { ReportsManagerV2 } from "@/components/admin-v1/redesign/ReportsManagerV2";

interface AdminReportsTabProps {
  onSelectUser?: (userId: string) => void;
}

export function AdminReportsTab(_props: AdminReportsTabProps) {
  return <ReportsManagerV2 />;
}
