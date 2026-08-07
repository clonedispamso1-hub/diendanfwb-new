// Thanh công cụ hàng loạt cho "Tài khoản thứ hai".
// Hiện khi có ít nhất 1 tài khoản được chọn (tick hoặc vuốt chọn).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FileText, MessagesSquare, MessageSquare, Sparkles, Type, Image as ImageIcon,
  Users as UsersIcon, MapPin, Lock, Trash2, X, Save, Shuffle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchVipIconFolders } from "@/lib/vip-assets";
import { randomizeCloneVipMedia, setCloneVipMedia } from "@/lib/clone-vip-media";
import { VipMediaPickerPanel } from "@/components/admin-v3/vip/VipMediaPickerPanel";


const sb = supabase as any;

export type BulkField = "icon" | "full_name" | "avatar" | "gender" | "province";



const FIELD_LABEL: Record<BulkField, string> = {
  icon: "Gán Media VIP (Icon / GIF sau tên)",
  full_name: "Đổi tên hiển thị",
  avatar: "Đổi avatar (URL)",
  gender: "Đổi giới tính",
  province: "Đổi khu vực",
};

/** Bỏ icon cũ ở cuối tên (emoji / ký tự đặc biệt) trước khi gắn icon mới. */
function stripTrailingIcon(name: string): string {
  return name.replace(/[\s\u200d]*[\p{Extended_Pictographic}\u2600-\u27BF\uFE0F]+\s*$/gu, "").trim();
}

export type BulkTarget = { id: string; username: string; full_name: string | null };

export function BulkSelectionToolbar({
  targets, busy, provinces, onOpenTab, onClear, onLock, onUnlock, onDelete, onApplied,
}: {
  targets: BulkTarget[];
  busy: boolean;
  provinces: string[];
  onOpenTab: (tab: "post" | "comments" | "messages") => void;
  onClear: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onDelete: () => void;
  onApplied: () => void;
}) {
  const [field, setField] = useState<BulkField | null>(null);
  const count = targets.length;

  if (!count) return null;

  const Btn = ({ icon, label, onClick, danger }: {
    icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
  }) => (
    <button
      type="button"
      className={`admv3-btn admv3-btn-ghost ${danger ? "text-red-500" : ""}`}
      disabled={busy}
      onClick={onClick}
    >
      {icon} {label}
    </button>
  );

  return (
    <>
      <div className="sticky top-2 z-30 mb-3 rounded-xl border bg-background/95 backdrop-blur px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold mr-1">
            Đã chọn {count} tài khoản
          </span>
          <Btn icon={<FileText size={14} />} label="Đăng bài" onClick={() => onOpenTab("post")} />
          <Btn icon={<MessagesSquare size={14} />} label="Bình luận" onClick={() => onOpenTab("comments")} />
          <Btn icon={<MessageSquare size={14} />} label="Nhắn tin" onClick={() => onOpenTab("messages")} />
          <Btn icon={<Sparkles size={14} />} label="Gán Media VIP" onClick={() => setField("icon")} />
          <Btn icon={<Type size={14} />} label="Đổi tên" onClick={() => setField("full_name")} />
          <Btn icon={<ImageIcon size={14} />} label="Đổi avatar" onClick={() => setField("avatar")} />
          <Btn icon={<UsersIcon size={14} />} label="Đổi giới tính" onClick={() => setField("gender")} />
          <Btn icon={<MapPin size={14} />} label="Đổi khu vực" onClick={() => setField("province")} />
          <Btn icon={<Lock size={14} />} label="Khóa" onClick={onLock} />
          <Btn icon={<Trash2 size={14} />} label="Xóa" danger onClick={onDelete} />
          <button type="button" className="admv3-btn admv3-btn-ghost ml-auto" onClick={onClear}>
            <X size={14} /> Bỏ chọn
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Mẹo: giữ chuột trái rồi kéo lên/xuống để quét chọn • Ctrl để cộng thêm • Shift để chọn từ A tới B •{" "}
          <button type="button" className="underline" onClick={onUnlock} disabled={busy}>mở khóa các tài khoản đã chọn</button>
        </div>
      </div>

      {field && (
        <BulkEditModal
          field={field}
          targets={targets}
          provinces={provinces}
          onClose={() => setField(null)}
          onDone={() => { setField(null); onApplied(); }}
        />
      )}
    </>
  );
}

/** Modal áp dụng 1 thuộc tính cho toàn bộ tài khoản đã chọn. */
function BulkEditModal({
  field, targets, provinces, onClose, onDone,
}: {
  field: BulkField; targets: BulkTarget[]; provinces: string[];
  onClose: () => void; onDone: () => void;
}) {
  const count = targets.length;
  const [value, setValue] = useState("");
  const [numbering, setNumbering] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // HỆ THỐNG 2 — Gán Media VIP (Icon/GIF sau tên), chọn không giới hạn.
  const [vipMedia, setVipMedia] = useState<string[]>([]);
  const [randomOn, setRandomOn] = useState(false);
  const [randomCount, setRandomCount] = useState(1);

  async function run() {
    if (field === "icon") {
      setBusy(true);
      try {
        const ids = targets.map((t) => t.id);
        if (randomOn) {
          const done = await randomizeCloneVipMedia(ids, vipMedia, randomCount);
          toast.success(`Đã random Media VIP cho ${done} tài khoản`);
        } else {
          await setCloneVipMedia(ids, vipMedia);
          toast.success(
            vipMedia.length
              ? `Đã gán ${vipMedia.length} Media VIP cho ${count} tài khoản`
              : `Đã gỡ Media VIP của ${count} tài khoản`,
          );
        }
        onDone();
      } catch (e: any) { toast.error(e?.message || "Lỗi"); }
      finally { setBusy(false); }
      return;
    }
    if (!value.trim()) { toast.error("Chưa nhập giá trị"); return; }

    setBusy(true);
    setProgress(0);
    let ok = 0;
    const errors: string[] = [];
    try {
      const list = targets;
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        const payload: Record<string, unknown> = {
          p_id: row.id, p_username: null, p_password: null, p_avatar_url: null,
          p_bio: null, p_province: null, p_full_name: null, p_gender: null,
        };
        if (field === "avatar") payload["p_avatar_url"] = value.trim();
        else if (field === "gender") payload["p_gender"] = value;
        else if (field === "province") payload["p_province"] = value;
        else if (field === "full_name") {
          const base = value.trim();
          payload["p_full_name"] = numbering && list.length > 1 ? `${base} ${i + 1}` : base;
        }
        const { error } = await sb.rpc("admin_update_internal_account", payload);

        if (error) errors.push(`@${row.username}: ${error.message}`);
        else ok++;
        setProgress(i + 1);
      }
      if (ok) toast.success(`Đã cập nhật ${ok}/${list.length} tài khoản`);
      if (errors.length) toast.error(errors.slice(0, 3).join(" | "));
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">{FIELD_LABEL[field]} — {count} tài khoản</div>
          <button onClick={onClose} className="admv3-btn admv3-btn-ghost admv3-btn-icon"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          {field === "icon" && (
            <>
              <p className="text-xs text-muted-foreground">
                Chọn <strong>không giới hạn</strong> Icon VIP / GIF VIP để dán ngay sát tên clone.
                Kho này hoàn toàn tách biệt Kho GIF dùng chung.
              </p>
              <VipMediaPickerPanel selected={vipMedia} onChange={setVipMedia} />
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={randomOn} onChange={(e) => setRandomOn(e.target.checked)} />
                <Shuffle size={14} /> Random riêng cho từng tài khoản
              </label>
              {randomOn ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Số media mỗi tài khoản
                  <input
                    type="number"
                    min={1}
                    className="admv3-input h-8 w-20 text-xs"
                    value={randomCount}
                    onChange={(e) => setRandomCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                  (lấy ngẫu nhiên trong {vipMedia.length} media đã chọn)
                </label>
              ) : null}
            </>
          )}

          {field === "gender" && (
            <select className="admv3-input" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">— Chọn —</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          )}
          {field === "province" && (
            <select className="admv3-input" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">— Chọn —</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {(field === "full_name" || field === "avatar") && (
            <input
              className="admv3-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={field === "avatar" ? "https://..." : "Tên hiển thị"}
            />
          )}
          {field === "full_name" && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={numbering} onChange={(e) => setNumbering(e.target.checked)} />
              Thêm số thứ tự phía sau (Tên 1, Tên 2, …)
            </label>
          )}
          {busy && (
            <div className="text-xs text-muted-foreground">Đang áp dụng… {progress}/{count}</div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button className="admv3-btn admv3-btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="admv3-btn" onClick={run} disabled={busy}>
            {field === "icon" && randomOn ? <Shuffle size={14} /> : <Save size={14} />} Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

/** Chọn thư mục Icon VIP (rỗng = toàn bộ kho). */
export function VipFolderSelect({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const [folders, setFolders] = useState<string[]>([]);
  useEffect(() => {
    fetchVipIconFolders().then(setFolders).catch(() => setFolders([]));
  }, []);
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select className="admv3-input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tất cả thư mục</option>
        {folders.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
    </label>
  );
}
