/**
 * Nút "Xóa tất cả" dùng chung cho Admin: luôn ĐẾM trước, hiện hộp xác nhận,
 * nêu rõ những gì được GIỮ LẠI, rồi mới xoá. Không nới lỏng quyền hạn.
 */
import { useCallback, useState } from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import type { CountRow, PurgeResult } from "@/lib/admin-purge-history";

type Props = {
  label?: string;
  title: string;
  /** Chỉ đọc — đếm số bản ghi sẽ bị ảnh hưởng. */
  count: () => Promise<CountRow[]>;
  /** Thực hiện xoá an toàn. */
  purge: () => Promise<PurgeResult>;
  /** Các mục chắc chắn KHÔNG bị xoá — hiện trong hộp xác nhận. */
  protectedNotes: string[];
  onDone?: () => void;
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(2,6,23,.72)",
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const card: React.CSSProperties = {
  width: "min(520px, 100%)",
  maxHeight: "86vh",
  overflow: "auto",
  background: "#0f172a",
  color: "#e5e7eb",
  border: "1px solid rgba(148,163,184,.25)",
  borderRadius: 16,
  padding: 18,
  display: "grid",
  gap: 12,
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: 0,
  borderRadius: 10,
  padding: "8px 12px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

export function PurgeAllButton({
  label = "Xóa tất cả",
  title,
  count,
  purge,
  protectedNotes,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CountRow[] | null>(null);
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const start = useCallback(async () => {
    setOpen(true);
    setRows(null);
    setResult(null);
    setConfirmText("");
    try {
      setRows(await count());
    } catch (e: any) {
      toast.error(e?.message || "Không đếm được dữ liệu");
      setRows([]);
    }
  }, [count]);

  const run = async () => {
    setBusy(true);
    try {
      const r = await purge();
      setResult(r);
      const failed = r.lines.filter((l) => l.error);
      if (failed.length) {
        toast.error(`Một số mục không xoá được: ${failed.map((f) => f.label).join(", ")}`);
      } else {
        toast.success("Đã xoá lịch sử theo đúng giới hạn an toàn.");
      }
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || "Xoá thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        style={{ ...btn, background: "#b91c1c", color: "#fff" }}
      >
        <Trash2 size={14} /> {label}
      </button>

      {open ? (
        <div style={overlay} onClick={() => !busy && setOpen(false)}>
          <div style={card} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} color="#f59e0b" />
              <b style={{ flex: 1, fontSize: 15 }}>{title}</b>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                style={{ ...btn, background: "transparent", color: "#94a3b8", padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {!result ? (
              <>
                <div style={{ fontSize: 12.5, opacity: 0.8 }}>
                  Số bản ghi hiện có (đếm trực tiếp từ dữ liệu thật):
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {rows == null ? (
                    <div style={{ opacity: 0.7, fontSize: 13 }}>Đang đếm…</div>
                  ) : (
                    rows.map((r) => (
                      <div
                        key={r.label}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "baseline",
                          background: "rgba(255,255,255,.04)",
                          borderRadius: 10,
                          padding: "8px 10px",
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 13 }}>{r.label}</span>
                        <b style={{ fontSize: 15 }}>
                          {r.count == null ? "không đọc được" : r.count.toLocaleString("vi-VN")}
                        </b>
                        {r.note ? (
                          <span style={{ fontSize: 11, opacity: 0.65, width: "100%" }}>{r.note}</span>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                <div
                  style={{
                    border: "1px solid rgba(34,197,94,.35)",
                    background: "rgba(34,197,94,.08)",
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 12.5,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <b style={{ color: "#4ade80" }}>Được bảo vệ, không bị xoá:</b>
                  {protectedNotes.map((n) => (
                    <div key={n}>• {n}</div>
                  ))}
                </div>

                <label style={{ fontSize: 12.5, display: "grid", gap: 6 }}>
                  Nhập <b>XOA</b> để xác nhận:
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="XOA"
                    style={{
                      borderRadius: 10,
                      padding: "8px 10px",
                      background: "rgba(255,255,255,.06)",
                      border: "1px solid rgba(148,163,184,.3)",
                      color: "#e5e7eb",
                    }}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={busy}
                    style={{ ...btn, background: "#334155", color: "#fff" }}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void run()}
                    disabled={busy || confirmText.trim().toUpperCase() !== "XOA" || rows == null}
                    style={{
                      ...btn,
                      background: confirmText.trim().toUpperCase() === "XOA" ? "#b91c1c" : "#7f1d1d",
                      color: "#fff",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={14} /> {busy ? "Đang xoá…" : "Xoá ngay"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  {result.lines.map((l) => (
                    <div
                      key={l.label}
                      style={{
                        display: "flex",
                        gap: 10,
                        background: "rgba(255,255,255,.04)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ flex: 1 }}>{l.label}</span>
                      {l.error ? (
                        <b style={{ color: "#f87171" }}>lỗi: {l.error}</b>
                      ) : (
                        <b>
                          đã xoá {l.deleted == null ? "?" : l.deleted.toLocaleString("vi-VN")}
                          {l.kept ? ` · giữ ${l.kept.toLocaleString("vi-VN")}` : ""}
                        </b>
                      )}
                    </div>
                  ))}
                </div>
                {result.blocked.length ? (
                  <div style={{ fontSize: 12.5, opacity: 0.85, display: "grid", gap: 4 }}>
                    {result.blocked.map((b) => (
                      <div key={b}>• {b}</div>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    style={{ ...btn, background: "#334155", color: "#fff" }}
                  >
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default PurgeAllButton;
