import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, Eye, EyeOff, ArrowLeft, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  supabaseAdminSession,
  adminEmailFromUsername,
  validateUsername,
  validatePassword,
} from "@/integrations/supabase/admin-client";
import {
  AdminAuthLayout,
  AdminField,
  adminInputCls,
  adminPrimaryBtnCls,
} from "./AdminAuthLayout";
import { adminPath } from "@/lib/admin-slug";

/**
 * Đăng ký tài khoản quản trị (Bang Chủ).
 * - Mật khẩu CHỈ lưu ở Supabase Auth — bảng bangchu không có trường mật khẩu.
 * - KHÔNG cho tự chọn role: dòng bangchu luôn tạo ở status 'pending',
 *   is_active=false, role placeholder 'agent' (RLS "self register pending" ép).
 * - Xong thì signOut và đưa về trang /pending chờ admin_1 phê duyệt.
 */
export default function AdminRegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    const uErr = validateUsername(u);
    if (uErr) { setError(uErr); return; }
    const pErr = validatePassword(password);
    if (pErr) { setError(pErr); return; }
    if (password !== confirm) { setError("Mật khẩu nhập lại không khớp"); return; }

    setLoading(true);
    try {
      const email = adminEmailFromUsername(u);

      // 1) Tạo tài khoản Auth (mật khẩu chỉ nằm ở đây).
      let { data, error: signUpErr } = await supabaseAdminSession.auth.signUp({
        email,
        password,
      });
      if (signUpErr) {
        setError(
          /already registered|already been registered/i.test(signUpErr.message)
            ? "Username này đã được đăng ký"
            : signUpErr.message,
        );
        return;
      }

      // Nếu project bật "Confirm email" thì signUp không trả session —
      // thử đăng nhập ngay để lấy session phục vụ bước ghi hồ sơ.
      if (!data.session) {
        const signIn = await supabaseAdminSession.auth.signInWithPassword({ email, password });
        if (!signIn.data.session) {
          setError("Đăng ký thành công nhưng chưa thể kích hoạt hồ sơ — liên hệ Admin cấp cao.");
          return;
        }
        data = { ...data, user: signIn.data.user, session: signIn.data.session };
      }

      const userId = data.user?.id ?? data.session?.user?.id;
      if (!userId) {
        setError("Không tạo được tài khoản, vui lòng thử lại");
        return;
      }

      // 2) Ghi hồ sơ bangchu: KHÔNG mật khẩu, KHÔNG role — DB mặc định
      //    status='pending', is_active=false, role='agent' (RLS ép).
      const { error: insertErr } = await supabaseAdminSession
        .from("bangchu")
        .insert({ auth_user_id: userId, username: u });
      if (insertErr) {
        await supabaseAdminSession.auth.signOut();
        setError(
          insertErr.code === "23505"
            ? "Username này đã tồn tại trong hệ thống quản trị"
            : `Không ghi được hồ sơ: ${insertErr.message}`,
        );
        return;
      }

      // 3) Đăng xuất ngay → màn hình chờ duyệt.
      await supabaseAdminSession.auth.signOut();
      toast.success("Đăng ký thành công — tài khoản đang chờ phê duyệt");
      navigate(adminPath("/pending") ?? "/", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminAuthLayout
      title="Đăng Ký Quản Trị"
      subtitle="Tài khoản mới sẽ ở trạng thái chờ duyệt — Admin cấp cao sẽ phê duyệt và cấp quyền"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AdminField
          icon={<User size={18} />}
          hint="6-30 ký tự, chỉ chữ/số/_"
        >
          <input
            className={adminInputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username Admin"
            autoComplete="username"
            required
          />
        </AdminField>

        <AdminField
          icon={<Lock size={18} />}
          hint="≥10 ký tự, có chữ hoa, thường, số, ký tự đặc biệt"
        >
          <input
            className={adminInputCls}
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
            autoComplete="new-password"
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

        <AdminField icon={<Lock size={18} />}>
          <input
            className={adminInputCls}
            type={showPw ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Nhập lại mật khẩu"
            autoComplete="new-password"
            required
          />
        </AdminField>

        {error ? (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm px-3 py-2 backdrop-blur-sm">
            {error}
          </div>
        ) : null}

        <button type="submit" className={adminPrimaryBtnCls} disabled={loading}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="soc-spinner" /> Đang đăng ký…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <UserPlus size={16} /> Đăng ký
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate(adminPath("/login") ?? "/", { replace: true })}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-cyan-100/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition"
        >
          <ArrowLeft size={16} />
          Quay lại đăng nhập
        </button>
      </form>
    </AdminAuthLayout>
  );
}
