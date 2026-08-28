/**
 * Popup "Cách Nhận 500K" — Tố cáo vi phạm nhận thưởng.
 * Dữ liệu đơn tố cáo + ảnh bằng chứng lưu ở Supabase #4 (bảng `reports`,
 * bucket `report-proofs`). Xem SQL: supabase-sql/SB4/2026-08-28_reports.sql
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, Upload, ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sb4 } from "@/lib/supabase-v4";
import { useAuth } from "@/components/candy/auth-provider";

type Kind = "post" | "message" | "profile";

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: "post", label: "Bài viết" },
  { value: "message", label: "Tin nhắn" },
  { value: "profile", label: "Profile" },
];

interface TargetInfo {
  id: string;
  name: string;
  avatar: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReportRewardModalProps {
  open: boolean;
  onClose: () => void;
  /** UID người bị tố cáo — khi có sẽ điền sẵn & khoá ô nhập. */
  targetUid?: string | null;
  targetName?: string | null;
  targetAvatar?: string | null;
  /** Loại vi phạm điền sẵn & khoá. */
  initialKind?: Kind;
  /** Khoá không cho đổi UID / loại vi phạm (mặc định bật khi có targetUid). */
  lockTarget?: boolean;
}

export function ReportRewardModal({
  open,
  onClose,
  targetUid = null,
  targetName = null,
  targetAvatar = null,
  initialKind = "post",
  lockTarget,
}: ReportRewardModalProps) {
  const { me } = useAuth();
  const locked = lockTarget ?? Boolean(targetUid);
  const [uid, setUid] = useState(targetUid ?? "");
  const [target, setTarget] = useState<TargetInfo | null>(
    targetUid ? { id: targetUid, name: targetName || "Người dùng", avatar: targetAvatar ?? null } : null,
  );
  const [looking, setLooking] = useState(false);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Tự tra cứu người bị tố cáo khi nhập UID (debounce nhẹ).
  useEffect(() => {
    const key = uid.trim();
    if (locked && targetName) { setLooking(false); return; }
    if (!key) { setTarget(null); return; }
    let alive = true;
    setLooking(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          let q = (supabase as any).from("profiles").select("id, full_name, username, avatar, public_id").limit(1);
          q = UUID_RE.test(key) ? q.eq("id", key) : q.or(`public_id.eq.${key},username.eq.${key}`);
          const { data } = await q;
          if (!alive) return;
          const row = Array.isArray(data) ? data[0] : null;
          setTarget(
            row
              ? { id: row.id, name: row.full_name || row.username || "Người dùng", avatar: row.avatar ?? null }
              : null,
          );
        } catch {
          if (alive) setTarget(null);
        } finally {
          if (alive) setLooking(false);
        }
      })();
    }, 400);
    return () => { alive = false; window.clearTimeout(t); };
  }, [uid]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    setUid(targetUid ?? "");
    setTarget(targetUid ? { id: targetUid, name: targetName || "Người dùng", avatar: targetAvatar ?? null } : null);
    setKind(initialKind);
    setReason("");
    setFile(null);
  }, [open, targetUid, targetName, targetAvatar, initialKind]);

  if (!open) return null;

  const submit = async () => {
    if (!me?.id) { toast.error("Bạn cần đăng nhập."); return; }
    if (!uid.trim()) { toast.error("Vui lòng nhập UID người vi phạm!"); return; }
    if (!reason.trim()) { toast.error("Vui lòng nhập lý do vi phạm!"); return; }
    setSubmitting(true);
    try {
      let proofUrl: string | null = null;
      if (file) {
        // Bắt buộc nén ảnh bằng chứng xuống dưới 500KB trước khi đẩy lên Storage.
        const { default: imageCompression } = await import("browser-image-compression");
        let proof: File = file;
        try {
          const out = await imageCompression(file, {
            maxSizeMB: 0.45,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
            initialQuality: 0.82,
            fileType: "image/webp",
          });
          proof = new File([out], file.name.replace(/\.[^./\\]+$/, "") + ".webp", {
            type: "image/webp",
          });
        } catch {
          if (file.size > 500 * 1024) {
            toast.error("Ảnh quá lớn (>500KB) và không nén được. Vui lòng chọn ảnh nhỏ hơn.");
            setSubmitting(false);
            return;
          }
        }
        const ext = (proof.name.split(".").pop() || "webp").toLowerCase();
        const path = `${me.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb4().storage.from("report-proofs").upload(path, proof, {
          upsert: true,
          contentType: proof.type || "image/webp",
        });
        if (upErr) throw upErr;
        proofUrl = sb4().storage.from("report-proofs").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await sb4().from("reports").insert({
        reporter_id: me.id,
        reporter_name: (me as any).full_name || (me as any).username || null,
        target_uid: uid.trim(),
        target_name: target?.name ?? null,
        target_avatar: target?.avatar ?? null,
        kind,
        reason: reason.trim(),
        proof_url: proofUrl,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Đã gửi tố cáo! Admin sẽ duyệt và thưởng 500.000 xu nếu hợp lệ.");
      onClose();
    } catch (e: any) {
      toast.error("Gửi tố cáo thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSubmitting(false);
    }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, opacity: 0.75, marginBottom: 5, display: "block" };
  const field: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 12,
    border: "1px solid rgba(120,120,140,0.3)", background: "rgba(255,255,255,0.6)",
    color: "inherit", fontSize: 14, outline: "none",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tố cáo vi phạm nhận thưởng"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10060, display: "grid", placeItems: "center",
        padding: 14, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)", maxHeight: "88vh", overflowY: "auto",
          borderRadius: 20, background: "#fff", color: "#111",
          boxShadow: "0 24px 70px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
            background: "linear-gradient(135deg,#ef4444,#f97316)", color: "#fff",
            borderRadius: "20px 20px 0 0",
          }}
        >
          <ShieldAlert size={20} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Cách Nhận 500K</div>
            <div style={{ fontSize: 11.5, opacity: 0.9 }}>Tố cáo vi phạm hợp lệ — nhận ngay 500.000 xu</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            style={{ border: 0, background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 999, padding: 6, cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 14, padding: 16 }}>
          <div>
            <label style={label} htmlFor="rp-uid">Bước 1 — UID người vi phạm</label>
            <input id="rp-uid" style={{ ...field, opacity: locked ? 0.7 : 1 }} value={uid} maxLength={80}
              readOnly={locked} disabled={locked}
              onChange={(e) => setUid(e.target.value)} placeholder="Dán UID / username người vi phạm" />
            <div style={{ marginTop: 8, minHeight: 44 }}>
              {looking ? (
                <span style={{ fontSize: 12, opacity: 0.6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Loader2 size={13} className="animate-spin" /> Đang tìm…
                </span>
              ) : target ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, background: "rgba(0,0,0,0.04)" }}>
                  <img src={target.avatar || "/placeholder.svg"} alt={target.name}
                    style={{ width: 36, height: 36, borderRadius: 999, objectFit: "cover" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{target.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{target.id}</div>
                  </div>
                </div>
              ) : uid.trim() ? (
                <span style={{ fontSize: 12, color: "#dc2626" }}>Không tìm thấy người dùng với UID này.</span>
              ) : null}
            </div>
          </div>

          <div>
            <span style={label}>Bước 2 — Loại tố cáo</span>
            <div style={{ display: "flex", gap: 8 }}>
              {KINDS.map((k) => (
                <button key={k.value} type="button" disabled={locked} onClick={() => setKind(k.value)}
                  style={{
                    flex: 1, padding: "9px 6px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                    cursor: locked ? "not-allowed" : "pointer",
                    opacity: locked && kind !== k.value ? 0.45 : 1,
                    border: kind === k.value ? "1px solid #ef4444" : "1px solid rgba(120,120,140,0.3)",
                    background: kind === k.value ? "rgba(239,68,68,0.1)" : "transparent",
                    color: kind === k.value ? "#dc2626" : "inherit",
                  }}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={label} htmlFor="rp-reason">Bước 3 — Lý do vi phạm</label>
            <textarea id="rp-reason" rows={4} maxLength={1000} value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ ...field, resize: "vertical" }} placeholder="Mô tả chi tiết hành vi vi phạm…" />
          </div>

          <div>
            <span style={label}>Bước 4 — Ảnh bằng chứng</span>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 12,
                border: "1px dashed rgba(120,120,140,0.5)", background: "transparent", cursor: "pointer",
                fontSize: 13, fontWeight: 700, color: "inherit",
              }}>
              <Upload size={15} /> {file ? "Đổi ảnh khác" : "Tải ảnh bằng chứng"}
            </button>
            {preview ? (
              <img src={preview} alt="Bằng chứng"
                style={{ marginTop: 10, width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12, background: "rgba(0,0,0,0.04)" }} />
            ) : null}
          </div>

          <button type="button" disabled={submitting} onClick={() => void submit()}
            style={{
              border: 0, borderRadius: 14, padding: "12px 16px", fontWeight: 900, fontSize: 14.5,
              color: "#fff", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1,
              background: "linear-gradient(135deg,#ef4444,#f97316)",
            }}>
            {submitting ? "Đang gửi…" : "Gửi Tố Cáo"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ReportRewardModal;
