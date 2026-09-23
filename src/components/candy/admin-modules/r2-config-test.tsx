import { useState } from "react";
import { KeyRound, Play, Trash2 } from "lucide-react";
import { ModuleShell, StatusBadge } from "./module-shell";
import { supabase } from "@/lib/supabase";
import { setR2SessionConfig, hasR2SessionConfig } from "@/lib/media/r2-session-config";

/**
 * TEST-ONLY: nhập tạm cấu hình Cloudflare R2 để kiểm tra kết nối.
 * Giá trị chỉ nằm trong state của trang + gửi 1 lần tới server để test.
 * KHÔNG lưu Supabase / localStorage / file / bundle.
 */

type Fields = {
  endpoint: string;
  bucket: string;
  publicDomain: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const EMPTY: Fields = {
  endpoint: "",
  bucket: "",
  publicDomain: "",
  accessKeyId: "",
  secretAccessKey: "",
};

const LABELS: Record<keyof Fields, string> = {
  endpoint: "R2_ENDPOINT",
  bucket: "R2_BUCKET_NAME",
  publicDomain: "R2_PUBLIC_DOMAIN",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
};

const HINTS: Record<keyof Fields, string> = {
  endpoint: "https://<account-id>.r2.cloudflarestorage.com",
  bucket: "Tên bucket R2",
  publicDomain: "https://pub-xxxxxxxx.r2.dev",
  accessKeyId: "API Token ID (Object Read & Write)",
  secretAccessKey: "Secret — chỉ hiện 1 lần khi tạo token",
};

export function R2ConfigTest() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [active, setActive] = useState(hasR2SessionConfig());

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  async function handleTest() {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Cần đăng nhập.");
      const res = await fetch("/api/public/r2-test", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(fields),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        detail?: string;
      };
      if (res.ok && json.ok) {
        // Kích hoạt cho phiên test: mọi upload (avatar, bài đăng…) trong tab
        // này sẽ ký bằng 5 giá trị vừa nhập. Chỉ nằm trong RAM của tab.
        setR2SessionConfig({
          endpoint: fields.endpoint.trim(),
          bucket: fields.bucket.trim(),
          publicDomain: fields.publicDomain.trim().replace(/\/+$/, ""),
          accessKeyId: fields.accessKeyId.trim(),
          secretAccessKey: fields.secretAccessKey.trim(),
        });
        setActive(true);
        setResult({
          ok: true,
          text: `${json.message || "Kết nối thành công."} Đã áp dụng cho mọi upload trong phiên test này (tải lại trang là mất).`,
        });
      } else {
        setResult({
          ok: false,
          text: `${json.error || `Lỗi ${res.status}`}${json.detail ? ` — ${json.detail}` : ""}`,
        });
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    setFields(EMPTY);
    setResult(null);
    setR2SessionConfig(null);
    setActive(false);
  }

  return (
    <ModuleShell
      title="R2 Configuration (Test)"
      subtitle="Chỉ dùng để test — giá trị KHÔNG được lưu ở bất kỳ đâu, chỉ gửi server 1 lần để kiểm tra kết nối trong phiên hiện tại."
      actions={<StatusBadge status="test-only" />}
    >
      <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        {(Object.keys(LABELS) as (keyof Fields)[]).map((k) => (
          <label key={k} style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <KeyRound size={12} /> {LABELS[k]}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={fields[k]}
              onChange={set(k)}
              placeholder={HINTS[k]}
              className="adm-input"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)", background: "transparent",
                fontSize: 13, fontFamily: "monospace",
              }}
            />
          </label>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            className="icon-button"
            disabled={busy}
            onClick={handleTest}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <Play size={14} /> {busy ? "Đang test…" : "Lưu & Test kết nối"}
          </button>
          <button
            className="icon-button"
            onClick={handleClear}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <Trash2 size={14} /> Xoá ô nhập
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Trạng thái phiên test:{" "}
          {active ? (
            <strong style={{ color: "#34d399" }}>đang dùng cấu hình bạn vừa nhập</strong>
          ) : (
            <strong style={{ color: "#fbbf24" }}>đang dùng cấu hình mặc định của hệ thống</strong>
          )}
        </div>

        {result && (
          <div
            style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 13,
              border: `1px solid ${result.ok ? "rgba(52,211,153,0.4)" : "rgba(244,63,94,0.4)"}`,
              color: result.ok ? "#34d399" : "#fb7185",
            }}
          >
            {result.ok ? "✅ " : "❌ "}
            {result.text}
          </div>
        )}

        <p style={{ fontSize: 11, opacity: 0.6 }}>
          Lưu ý: nút “Lưu & Test” chỉ gửi cấu hình tới server để chạy thử ListObjects trên bucket —
          server không ghi lại giá trị. Để cấu hình thật, nhập 5 biến ở Project Settings → Secrets.
        </p>
      </div>
    </ModuleShell>
  );
}
