import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { memberIntel, type MemberIntelRow } from "@/lib/member-intel";

const LEVELS = [
  { level: 1 as const, title: "Mức 1 — Khóa tài khoản", desc: "Chỉ khóa nick này. Người dùng vẫn có thể tạo nick khác." },
  { level: 2 as const, title: "Mức 2 — Khóa tài khoản + Device", desc: "Khóa nick và chặn các thiết bị (mã riêng từng máy) đã dùng nick này." },
  { level: 3 as const, title: "Mức 3 — Cấm thiết bị", desc: "Cấm vĩnh viễn thiết bị đã dùng nick này: mở web bằng bất kỳ tài khoản nào hay đổi mạng đều bị chặn. Máy khác cùng đời iPhone/iOS không bị ảnh hưởng." },
];

export function BanLevelDialog({ member, onClose, onDone, initialLevel = 2 }:
  { member: MemberIntelRow; onClose: () => void; onDone: () => void; initialLevel?: 1 | 2 | 3 }) {
  const [level, setLevel] = useState<1 | 2 | 3>(initialLevel);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await memberIntel.banLevel(member.id, level, reason || undefined, days);
      toast.success(`Đã khóa mức ${level}`);
      onDone(); onClose();
    } catch (e: any) {
      const m = e?.message || String(e);
      toast.error(m.includes("level_3_requires_recorded_device_id") ? "Chưa ghi nhận mã thiết bị của tài khoản này (user cần mở web ít nhất 1 lần sau khi đăng nhập)." : m);
    } finally { setBusy(false); }
  };

  return (
    <div className="mi-modal" onClick={onClose}>
      <div className="mi-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal-head">
          <div className="mi-modal-title">Khóa · {member.full_name || member.username}</div>
          <button className="mi-btn ghost" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="mi-list">
          {LEVELS.map((l) => (
            <button key={l.level} className="mi-row" style={{ textAlign: "left", cursor: "pointer",
              borderColor: level === l.level ? "#2ea6ff" : undefined,
              background: level === l.level ? "#e8f4ff" : undefined }}
              onClick={() => setLevel(l.level)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{l.title}</div>
                <div className="mi-mini">{l.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mi-bar" style={{ marginTop: 12 }}>
          <div className="mi-search">
            <input placeholder="Lý do (tuỳ chọn)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="mi-search" style={{ maxWidth: 170, minWidth: 150 }}>
            <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} />
            <span className="mi-mini">ngày (0 = vĩnh viễn)</span>
          </div>
        </div>
        <div className="mi-actions">
          <button className="mi-btn danger" disabled={busy} onClick={submit}>Xác nhận khóa mức {level}</button>
          <button className="mi-btn ghost" onClick={onClose}>Huỷ</button>
        </div>
      </div>
    </div>
  );
}
