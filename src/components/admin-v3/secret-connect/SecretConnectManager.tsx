/**
 * ❤️ Kết Nối Bí Mật — Admin module (V2).
 * KHO CLONE RIÊNG: clone được tạo ngay tại đây (giống Tài khoản thứ hai).
 * Tài khoản tạo ra là tài khoản thật nên vẫn dùng được ở "Tài khoản thứ hai"
 * (đăng bài / comment / nhắn tin / live). Ngược lại, tài khoản có sẵn ở
 * "Tài khoản thứ hai" KHÔNG tự trở thành clone ghép đôi.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CloneMessagesTab } from "@/components/admin-v3/secret-connect/CloneMessagesTab";
import { BulkAccountCreator } from "@/components/admin-v3/second-accounts/BulkAccountCreator";
import {
  DEFAULT_SETTINGS,
  loadConnectLogs,
  loadSecretAccounts,
  loadSecretConnectSettings,
  registerSecretAccountsByUsername,
  releaseWeekPool,
  saveSecretConnectSettings,
  setSecretAccountInPool,
  shuffleSecretPool,
  type ConnectLogRow,
  type SecretAccountRow,
  type SecretConnectSettings,
} from "@/lib/secret-connect";

type Tab = "clones" | "messages" | "settings" | "logs";

const RESULT_LABEL: Record<string, string> = {
  matched: "Ghép thành công",
  busy: "Đang bận",
  left: "Đã thoát",
  declined: "Từ chối",
  no_reply: "Không phản hồi",
  skipped: "Bỏ qua",
};

export function SecretConnectManager() {
  const [tab, setTab] = useState<Tab>("clones");
  const [settings, setSettings] = useState<SecretConnectSettings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<SecretAccountRow[]>([]);
  const [logs, setLogs] = useState<ConnectLogRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const [s, acc, lg] = await Promise.all([
      loadSecretConnectSettings(),
      loadSecretAccounts(),
      loadConnectLogs(120),
    ]);
    setSettings(s);
    setAccounts(acc);
    setLogs(lg);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const poolCount = accounts.filter((a) => a.in_pool).length;
  const usedCount = accounts.filter((a) => a.in_pool && a.used).length;
  const matchedCount = accounts.filter((a) => a.in_pool && a.matched).length;

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return accounts;
    return accounts.filter((c) =>
      `${c.name || ""} ${c.username || ""} ${c.region || ""}`.toLowerCase().includes(key),
    );
  }, [accounts, q]);

  const togglePool = async (row: SecretAccountRow, next: boolean) => {
    const ok = await setSecretAccountInPool(row.account_id, next);
    if (!ok) {
      toast.error("Chưa chạy migration RUN_NOW_secret_connect_v4_own_pool.sql");
      return;
    }
    setAccounts((prev) =>
      prev.map((p) => (p.account_id === row.account_id ? { ...p, in_pool: next } : p)),
    );
  };

  const patch = async (p: Partial<SecretConnectSettings>) => {
    setSettings((s) => ({ ...s, ...p }));
    const ok = await saveSecretConnectSettings({ ...settings, ...p });
    if (!ok) toast.error("Không lưu được cấu hình (kiểm tra migration).");
  };

  return (
    <div className="admv3-card" style={{ padding: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Kết Nối Bí Mật</h2>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
        <b>Kho clone riêng</b> của Kết Nối Bí Mật. Clone tạo tại đây là tài khoản thật nên vẫn xuất
        hiện ở <b>Tài khoản thứ hai</b> để đăng bài / comment / nhắn tin / live. Tài khoản có sẵn ở
        Tài khoản thứ hai <b>không</b> tự trở thành clone ghép đôi.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
        <Stat label="Clone trong tuần" value={poolCount} />
        <Stat label="Đã dùng" value={usedCount} />
        <Stat label="Ghép thành công" value={matchedCount} />
        <Stat label="Tổng kho clone" value={accounts.length} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {(["clones", "messages", "settings", "logs"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`admv3-btn ${tab === t ? "" : "admv3-btn-ghost"}`}
            onClick={() => setTab(t)}
          >
            {t === "clones" ? "Kho clone" : t === "messages" ? "Tin nhắn Clone" : t === "settings" ? "Cấu hình" : "Nhật ký"}
          </button>
        ))}
        <button className="admv3-btn" onClick={() => setCreating(true)}>
          Tạo clone hàng loạt
        </button>
        <button
          className="admv3-btn admv3-btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await shuffleSecretPool();
            await reload();
            setBusy(false);
            toast.success("Đã shuffle kho clone tuần này");
          }}
        >
          Shuffle
        </button>
        <button
          className="admv3-btn admv3-btn-ghost"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Gỡ toàn bộ clone khỏi danh sách ghép đôi? Tài khoản KHÔNG bị xoá."))
              return;
            setBusy(true);
            const n = await releaseWeekPool();
            await reload();
            setBusy(false);
            toast.success(`Đã làm mới tuần — gỡ ${n} clone khỏi ghép đôi (tài khoản vẫn giữ nguyên)`);
          }}
        >
          Làm mới tuần
        </button>
      </div>

      {creating && (
        <BulkAccountCreator
          title="Tạo clone cho Kết Nối Bí Mật"
          subtitle="Tài khoản thật, tự động vào kho clone riêng — đồng thời dùng được ở Tài khoản thứ hai."
          onClose={() => setCreating(false)}
          onDone={() => setCreating(false)}
          onCreatedUsernames={async (usernames) => {
            const n = await registerSecretAccountsByUsername(usernames);
            if (n > 0) toast.success(`Đã thêm ${n} clone vào kho Kết Nối Bí Mật`);
            else toast.error("Tạo được tài khoản nhưng chưa thêm được vào kho clone");
            await reload();
          }}
        />
      )}

      {tab === "clones" && (
        <>
          <input
            className="admv3-input"
            placeholder="Tìm clone theo tên / username / khu vực…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: "100%", height: 40, borderRadius: 12, padding: "0 12px", marginBottom: 12 }}
          />
          <div style={{ display: "grid", gap: 8 }}>
            {filtered.length === 0 && (
              <div style={{ opacity: 0.6, fontSize: 13 }}>
                Kho clone đang trống. Bấm <b>Tạo clone hàng loạt</b> để tạo đợt clone cho tuần này.
              </div>
            )}
            {filtered.map((c) => (
              <label
                key={c.account_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(127,127,127,.22)",
                  cursor: "pointer",
                  opacity: c.in_pool ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={c.in_pool}
                  onChange={(e) => void togglePool(c, e.target.checked)}
                />
                <img
                  src={c.avatar || ""}
                  alt=""
                  loading="lazy"
                  style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", background: "rgba(127,127,127,.2)" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name || c.username}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {c.region || "Linh hoạt"} · {c.age ?? "?"} tuổi · {c.gender || "?"} · đợt{" "}
                    {c.batch_week}
                  </div>
                </div>
                {c.matched && <Badge text="Đã ghép" color="#22c55e" />}
                {c.used && !c.matched && <Badge text="Đã dùng" color="#f59e0b" />}
                {!c.in_pool && <Badge text="Ngoài tuần" color="#94a3b8" />}
              </label>
            ))}
          </div>
        </>
      )}

      {tab === "messages" && <CloneMessagesTab accounts={accounts} />}

      {tab === "settings" && (
        <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <Toggle label="Bật tính năng" value={settings.enabled} onChange={(v) => patch({ enabled: v })} />
          <NumRow label="Thời gian tìm kiếm tối thiểu (giây)" value={settings.search_min_sec} onChange={(v) => patch({ search_min_sec: v })} />
          <NumRow label="Thời gian tìm kiếm tối đa (giây)" value={settings.search_max_sec} onChange={(v) => patch({ search_max_sec: v })} />
          <NumRow label="Chờ phản hồi tối thiểu (giây)" value={settings.wait_min_sec} onChange={(v) => patch({ wait_min_sec: v })} />
          <NumRow label="Chờ phản hồi tối đa (giây)" value={settings.wait_max_sec} onChange={(v) => patch({ wait_max_sec: v })} />
          <NumRow
            label="Tỷ lệ đồng ý (%) — tham khảo"
            value={Math.round(settings.accept_rate * 100)}
            onChange={(v) => patch({ accept_rate: Math.min(100, Math.max(0, v)) / 100 })}
          />
          <NumRow
            label="Thành công sau tối thiểu N lần thất bại"
            value={settings.success_after_min}
            onChange={(v) => patch({ success_after_min: Math.max(0, v) })}
          />
          <NumRow
            label="Thành công sau tối đa N lần thất bại"
            value={settings.success_after_max}
            onChange={(v) => patch({ success_after_max: Math.max(0, v) })}
          />
          <NumRow label="Số clone mỗi tuần" value={settings.weekly_clone_count} onChange={(v) => patch({ weekly_clone_count: v })} />
          <NumRow label="Lượt miễn phí / tuần" value={settings.free_weekly_limit} onChange={(v) => patch({ free_weekly_limit: v })} />
          <Toggle label="VIP không giới hạn lượt" value={settings.vip_unlimited} onChange={(v) => patch({ vip_unlimited: v })} />
          <Toggle label="Hiệu ứng trái tim" value={settings.hearts_enabled} onChange={(v) => patch({ hearts_enabled: v })} />
          <Toggle label="Cho xem hồ sơ sau ghép" value={settings.allow_profile_view} onChange={(v) => patch({ allow_profile_view: v })} />
          <Toggle label="Cho nhắn tin sau ghép" value={settings.allow_message} onChange={(v) => patch({ allow_message: v })} />
          <div style={{ fontWeight: 800, fontSize: 13, opacity: 0.7, marginTop: 8 }}>Hiển thị khu vực</div>
          <Toggle label='Hiện "Khu vực đã xác minh" trước khi ghép' value={settings.show_area_before} onChange={(v) => patch({ show_area_before: v })} />
          <Toggle label="Hiện khu vực thật sau khi ghép thành công" value={settings.show_real_area_after} onChange={(v) => patch({ show_real_area_after: v })} />
          <Toggle label="Hiển thị Quận/Huyện + Tỉnh/Thành" value={settings.show_district} onChange={(v) => patch({ show_district: v })} />
          <Toggle label="Bật hiệu ứng lật thông tin" value={settings.flip_enabled} onChange={(v) => patch({ flip_enabled: v })} />
          <NumRow label="Thời gian lật thông tin (giây)" value={Math.round((settings.flip_ms || 2000) / 100) / 10} onChange={(v) => patch({ flip_ms: Math.max(0, v) * 1000 })} />
        </div>
      )}

      {tab === "logs" && (
        <div style={{ display: "grid", gap: 6 }}>
          {logs.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>Chưa có lượt ghép nào.</div>}
          {logs.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(127,127,127,.18)",
                fontSize: 13,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                {RESULT_LABEL[l.result] || l.result} · {l.area || "—"}
              </span>
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {new Date(l.created_at).toLocaleString("vi-VN")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: "1px solid rgba(127,127,127,.22)",
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.65 }}>{label}</div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        color,
        background: `${color}22`,
      }}
    >
      {text}
    </span>
  );
}

function NumRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
      <span style={{ flex: 1 }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        style={{
          width: 100,
          height: 36,
          borderRadius: 10,
          padding: "0 10px",
          border: "1px solid rgba(127,127,127,.3)",
          background: "transparent",
        }}
      />
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
      <span style={{ flex: 1 }}>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default SecretConnectManager;
