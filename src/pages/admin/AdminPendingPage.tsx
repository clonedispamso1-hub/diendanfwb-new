import { useNavigate } from "react-router-dom";
import { Clock } from "lucide-react";
import {
  AdminAuthLayout,
  adminPrimaryBtnCls,
} from "./AdminAuthLayout";
import { adminPath } from "@/lib/admin-slug";

export default function AdminPendingPage() {
  const navigate = useNavigate();
  return (
    <AdminAuthLayout
      title="Đang Chờ Xét Duyệt"
      subtitle="Tài khoản quản trị của bạn đã được ghi nhận"
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 grid place-items-center text-amber-600 shrink-0">
            <Clock size={20} />
          </div>
          <div className="text-sm text-amber-800 leading-relaxed">
            Tài khoản của bạn đang chờ xét duyệt. Vui lòng liên hệ Admin cấp cao
            để được kích hoạt.
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">Trạng thái hiện tại</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            PENDING
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate(adminPath("/login") ?? "/", { replace: true })}
          className={adminPrimaryBtnCls}
        >
          Quay lại đăng nhập
        </button>
      </div>
    </AdminAuthLayout>
  );
}
