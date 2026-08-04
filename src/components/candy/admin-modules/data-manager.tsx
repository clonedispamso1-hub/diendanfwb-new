import { useState } from "react";
import { AlertTriangle, Download, Upload, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleShell, EmptyHint } from "./module-shell";

/* ================= AES-GCM helpers (Web Crypto) =================
 * File backup được mã hoá bằng AES-GCM 256 với khoá dẫn xuất từ mật khẩu
 * qua PBKDF2. Nội dung không đọc được bằng Notepad — không phải JSON/SQL
 * dạng rõ. Header nhị phân: "CDBK1" + salt(16) + iv(12) + ciphertext.
 */
const MAGIC = new Uint8Array([0x43, 0x44, 0x42, 0x4b, 0x31]); // "CDBK1"

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: 200_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptBlob(plain: string, password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
      key,
      new TextEncoder().encode(plain),
    ),
  );
  const out = new Uint8Array(MAGIC.length + salt.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(salt, MAGIC.length);
  out.set(iv, MAGIC.length + salt.length);
  out.set(cipher, MAGIC.length + salt.length + iv.length);
  return new Blob([out], { type: "application/octet-stream" });
}

async function decryptBlob(file: File, password: string): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) throw new Error("File backup không hợp lệ.");
  }
  const salt = buf.slice(MAGIC.length, MAGIC.length + 16);
  const iv = buf.slice(MAGIC.length + 16, MAGIC.length + 16 + 12);
  const cipher = buf.slice(MAGIC.length + 16 + 12);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    cipher as unknown as ArrayBuffer,
  );
  return new TextDecoder().decode(plain);
}

export function DataManager() {
  const sb = supabase as any;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportBackup = async () => {
    const password = window.prompt("Đặt mật khẩu để mã hoá file backup:");
    if (!password || password.length < 4) { setMsg("Mật khẩu quá ngắn."); return; }
    setBusy("export"); setMsg(null);
    try {
      const { data, error } = await sb.rpc("admin_export_all_data");
      if (error) throw error;
      const blob = await encryptBlob(JSON.stringify(data), password);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url; a.download = `backup-${stamp}.cdbk`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setMsg("Đã xuất file backup mã hoá.");
    } catch (e: any) {
      setMsg("Lỗi export: " + (e?.message || "unknown"));
    } finally { setBusy(null); }
  };

  const importBackup = async (file: File) => {
    const password = window.prompt("Nhập mật khẩu đã dùng khi export:");
    if (!password) return;
    if (!window.confirm("Import sẽ XOÁ dữ liệu hiện tại rồi khôi phục. Tiếp tục?")) return;
    setBusy("import"); setMsg(null);
    try {
      const plain = await decryptBlob(file, password);
      const payload = JSON.parse(plain);
      const { data, error } = await sb.rpc("admin_import_all_data", { _payload: payload });
      if (error) throw error;
      setMsg("Đã khôi phục: " + JSON.stringify((data as any)?.restored ?? []));
    } catch (e: any) {
      setMsg("Lỗi import: " + (e?.message || "sai mật khẩu hoặc file hỏng"));
    } finally { setBusy(null); }
  };

  const factoryReset = async () => {
    const c1 = window.prompt('Gõ đúng chữ "XOA TAT CA" để xác nhận Factory Reset Data:');
    if (c1 !== "XOA TAT CA") { setMsg("Đã huỷ."); return; }
    if (!window.confirm("BẠN CHẮC CHẮN? Toàn bộ dữ liệu người dùng sẽ bị xoá (bảng/RPC giữ nguyên).")) return;
    setBusy("reset"); setMsg(null);
    try {
      const { data, error } = await sb.rpc("admin_factory_reset_data");
      if (error) throw error;
      setMsg("Đã xoá: " + JSON.stringify((data as any)?.cleared ?? []));
    } catch (e: any) {
      setMsg("Lỗi: " + (e?.message || "unknown"));
    } finally { setBusy(null); }
  };

  return (
    <ModuleShell title="Sao lưu & Khôi phục dữ liệu" subtitle="Export mã hoá · Import · Factory Reset">
      <div style={{ display: "grid", gap: 12 }}>
        <div className="adm-row">
          <div className="adm-row-main">
            <div className="adm-row-title"><Download size={14} /> Export Backup (mã hoá)</div>
            <div className="adm-row-meta">
              <span>Xuất toàn bộ dữ liệu, mã hoá AES-GCM. File .cdbk không đọc được bằng Notepad.</span>
            </div>
          </div>
          <button className="primary-cta" disabled={!!busy} onClick={() => void exportBackup()}>
            {busy === "export" ? "Đang xuất…" : "Export"}
          </button>
        </div>

        <div className="adm-row">
          <div className="adm-row-main">
            <div className="adm-row-title"><Upload size={14} /> Import Backup</div>
            <div className="adm-row-meta">
              <span>Khôi phục 100% dữ liệu. UID / SĐT / mật khẩu (auth) giữ nguyên.</span>
            </div>
          </div>
          <label className="secondary-cta compact" style={{ cursor: "pointer" }}>
            {busy === "import" ? "Đang khôi phục…" : "Chọn file .cdbk"}
            <input
              type="file"
              accept=".cdbk,application/octet-stream"
              style={{ display: "none" }}
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (f) void importBackup(f);
              }}
            />
          </label>
        </div>

        <div className="adm-row" style={{ borderColor: "#ef444455" }}>
          <div className="adm-row-main">
            <div className="adm-row-title" style={{ color: "#f87171" }}>
              <AlertTriangle size={14} /> Factory Reset Data
            </div>
            <div className="adm-row-meta">
              <span>Xoá sạch dữ liệu người dùng (profiles, posts, comments, messages, notifications, follows, likes, gems, logs…). GIỮ NGUYÊN bảng, RPC, function, trigger, schema.</span>
            </div>
          </div>
          <button
            className="secondary-cta compact danger-button"
            disabled={!!busy}
            onClick={() => void factoryReset()}
          >
            <RefreshCw size={14} /> {busy === "reset" ? "Đang xoá…" : "Reset"}
          </button>
        </div>

        {msg ? (
          <div className="adm-row"><div className="adm-row-main"><div className="adm-row-meta"><span>{msg}</span></div></div></div>
        ) : (
          <EmptyHint>Sẵn sàng. Chọn một hành động phía trên.</EmptyHint>
        )}
      </div>
    </ModuleShell>
  );
}
