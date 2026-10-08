import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, Eye, EyeOff, ArrowLeft, UserPlus } from "lucide-react";
import {
  supabaseAdminSession,
  adminEmailCandidates,
  adminEmailFromUsername,
  fetchCurrentBangchu,
  fetchBangchuByUsername,
  describeAdminSession,
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
  const [sessionInfo, setSessionInfo] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSessionInfo(null);
    setLoading(true);
    try {
      // Xoá sạch phiên Admin cũ (có thể là session nhầm tài khoản) trước khi
      // đăng nhập, để auth.uid() luôn đúng tài khoản vừa nhập.
      await supabaseAdminSession.auth.signOut().catch(() => {});

      // Một username có thể tương ứng nhiều auth user (đăng ký ở các phiên bản
      // domain email khác nhau). Thử lần lượt và CHỈ giữ phiên nào khớp
      // bangchu.auth_user_id của chính username đó. Không hard-code UID.
      const candidates = adminEmailCandidates(username);
      let signedEmail: string | null = null;
      let uid: string | null = null;
      let bc: Awaited<ReturnType<typeof fetchCurrentBangchu>> = null;
      let expectedUid: string | null = null;
      let wrongMapping: { id: string; email: string } | null = null;

      for (const email of candidates) {
        const { error: signErr } = await supabaseAdminSession.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr) continue;

        const info = await describeAdminSession();
        // Log UID + email THỰC TẾ ngay sau login.
        console.info("[AdminLogin] session sau khi đăng nhập:", info);
        if (!info) {
          await supabaseAdminSession.auth.signOut();
          continue;
        }

        const byUsername = await fetchBangchuByUsername(username);
        if (byUsername && byUsername.auth_user_id !== info.id) {
          // Đăng nhập đúng mật khẩu nhưng SAI auth user (email mapping cũ).
          expectedUid = byUsername.auth_user_id;
          wrongMapping = info;
          await supabaseAdminSession.auth.signOut();
          continue;
        }

        signedEmail = email;
        uid = info.id;
        setSessionInfo(info);
        bc = byUsername ?? (await fetchCurrentBangchu());
        break;
      }

      if (!uid || !signedEmail) {
        if (wrongMapping && expectedUid) {
          setSessionInfo(wrongMapping);
          setError(
            `Mật khẩu đúng nhưng tài khoản Auth không khớp hồ sơ Bang Chủ.\n` +
              `Session đăng nhập: ${wrongMapping.email} (uid ${wrongMapping.id})\n` +
              `Hồ sơ "${username}" yêu cầu uid ${expectedUid}.\n` +
              `Hãy đăng nhập bằng email thật của tài khoản Bang Chủ (nhập trực tiếp email vào ô trên).`,
          );
          return;
        }
        setError(
          `Sai tài khoản hoặc mật khẩu (đã thử: ${candidates.join(", ") || adminEmailFromUsername(username)})`,
        );
        return;
      }

      if (!bc) {
        const gate = await securityGate();
        if (gate.blocked && !gate.admin) {
          await supabaseAdminSession.auth.signOut();
          if (typeof window !== "undefined") window.location.replace("/blocked");
          return;
        }
        await supabaseAdminSession.auth.signOut();
        setError(
          `Tài khoản chưa được cấp quyền quản trị (đăng nhập: ${signedEmail} — uid ${uid})`,
        );
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
            placeholder="Username Admin (hoặc email tài khoản)"
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

        {sessionInfo ? (
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-100 text-xs px-3 py-2 break-all">
            <div>Email session: {sessionInfo.email || "(không có)"}</div>
            <div>auth.uid: {sessionInfo.id}</div>
          </div>
        ) : null}

        {error ? (
          <div className="whitespace-pre-line rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm px-3 py-2 backdrop-blur-sm">

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
          onClick={() => navigate(adminPath("/register") ?? "/")}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-violet-100 hover:text-white bg-violet-500/15 hover:bg-violet-500/25 border border-violet-400/40 transition"
        >
          <UserPlus size={16} />
          Đăng ký BangChu
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
