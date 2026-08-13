import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import {
  supabaseAdminSession,
  adminEmailFromUsername,
  fetchCurrentBangchu,
} from "@/integrations/supabase/admin-client";
import {
  AdminAuthLayout,
  AdminField,
  adminInputCls,
  adminPrimaryBtnCls,
} from "./AdminAuthLayout";
import { adminPath } from "@/lib/admin-slug";
import { securityGate } from "@/lib/access-guard";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const gate = await securityGate();
      if (gate.blocked) {
        await supabaseAdminSession.auth.signOut();
        setError(gate.message || "Thiết bị hoặc mạng của bạn đã bị khóa.");
        return;
      }
      const { error: signErr } = await supabaseAdminSession.auth.signInWithPassword({
        email: adminEmailFromUsername(username),
        password,
      });
      if (signErr) {
        setError("Sai tài khoản hoặc mật khẩu");
        return;
      }
      const bc = await fetchCurrentBangchu();
      if (!bc) {
        await supabaseAdminSession.auth.signOut();
        setError("Tài khoản chưa được cấp quyền truy cập hệ thống quản trị");
        return;
      }
      if (bc.status === "pending") {
        await supabaseAdminSession.auth.signOut();
        navigate(adminPath("/pending") ?? "/", { replace: true });
        return;
      }
      if (bc.status === "rejected") {
        await supabaseAdminSession.auth.signOut();
        setError("Tài khoản đã bị từ chối xét duyệt");
        return;
      }
      if (!bc.is_active) {
        await supabaseAdminSession.auth.signOut();
        setError("Tài khoản đang bị khóa");
        return;
      }
      navigate(adminPath() ?? "/", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminAuthLayout
      title="Đăng Nhập Admin"
      subtitle="Khu vực quản trị nội bộ — chỉ dành cho Admin và Kiểm duyệt viên được duyệt"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AdminField icon={<User size={18} />}>
          <input
            className={adminInputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username Admin"
            autoComplete="username"
            required
          />
        </AdminField>

        <AdminField icon={<Lock size={18} />}>
          <input
            className={adminInputCls}
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="text-slate-400 hover:text-violet-500 transition"
            aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </AdminField>

        {error ? (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm px-3 py-2 backdrop-blur-sm">
            {error}
          </div>
        ) : null}

        <button type="submit" className={adminPrimaryBtnCls} disabled={loading}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="soc-spinner" /> Authenticating…
            </span>
          ) : (
            "Đăng nhập Admin"
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/")}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-cyan-100/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition"
        >
          <ArrowLeft size={16} />
          Quay lại Website
        </button>
      </form>
    </AdminAuthLayout>
  );
}
