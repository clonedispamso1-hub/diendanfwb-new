import { BangchuApprovalsPanel } from "@/components/admin-v3/members/BangchuApprovalsPanel";
import { AdminShell } from "./AdminShell";

/**
 * Trang độc lập duyệt tài khoản quản trị (bangchu) đang PENDING.
 * Nội dung dùng chung với mục "Duyệt Admin" trong Admin Panel.
 */
export default function AdminApprovalsPage() {
  return (
    <AdminShell title="📋 Duyệt tài khoản Admin">
      <BangchuApprovalsPanel />
    </AdminShell>
  );
}
