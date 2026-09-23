/**
 * Admin → Khẩn Cấp.
 *
 * 🚨 XOÁ TOÀN BỘ DỮ LIỆU WEBSITE (DATA ONLY).
 *  - Chỉ xoá DỮ LIỆU bằng lệnh DELETE có kiểm soát phía máy chủ.
 *  - KHÔNG DROP TABLE / DROP SCHEMA / TRUNCATE. Cấu trúc, RLS, Auth,
 *    cấu hình dự án và mã nguồn giữ nguyên.
 *  - Bắt buộc 3 lớp xác nhận + hộp thoại xác nhận cuối cùng.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert, X, Loader2, ShieldCheck, Database, HardDrive, Trash2 } from "lucide-react";
import { adminDb } from "@/lib/admin-db";

const ENDPOINT = "/api/public/emergency-reset";
const CONFIRM_PHRASE = "XOA DU LIEU";

type WipeRow = { table: string; before: number | null; after: number | null; ok: boolean; note: string };
type WipeDb = { id: string; label: string; skipped: boolean; rows: WipeRow[]; deleted: number; preserved?: string[] };
type WipeReport = {
  mode: string;
  executed: boolean;
  startedAt: string;
  finishedAt: string;
  droppedTables: number;
  truncates: number;
  schemaChanges: number;
  databases: WipeDb[];
  storage: Array<{ id: string; buckets: Array<{ bucket: string; removed: number; note: string }> }>;
  auth: { deleted: number; kept: number; errors: number };
  totalRowsDeleted: number;
};

type MissingKey = { db: "sb1" | "sb2" | "sb3" | "sb4"; envKey: string; label: string };

/**
 * Khoá máy chủ do Admin nhập chỉ nằm trong state React của phiên thao tác này.
 * KHÔNG ghi localStorage / sessionStorage / cookie / database; chỉ gửi kèm đúng
 * một request thực thi rồi bị xoá khỏi bộ nhớ.
 */
async function callRaw(payload: Record<string, unknown>) {
  const db = await adminDb();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Phiên Admin đã hết hạn. Vui lòng đăng nhập lại Admin Panel.");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (res.status === 403) throw new Error("Tài khoản hiện tại không có quyền Bang Chủ / Admin.");
  return { ok: res.ok, status: res.status, body };
}

async function callEndpoint(payload: Record<string, unknown>) {
  const { ok, body } = await callRaw(payload);
  if (!ok) throw new Error(body?.message || body?.error || "Máy chủ từ chối yêu cầu.");
  return body.report;
}

export function EmergencyManager() {
  const [open, setOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<WipeReport | null>(null);

  const [dob, setDob] = useState("");
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState("");

  const [missingKeys, setMissingKeys] = useState<MissingKey[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const dobOk = dob.replace(/\D+/g, "").length >= 6;
  const phraseOk = phrase === CONFIRM_PHRASE;
  const allValid = dobOk && ack && phraseOk;
  const keysFilled = missingKeys.every((m) => (keyInputs[m.db] ?? "").trim().length > 20);

  /** Xoá sạch khoá khỏi bộ nhớ trình duyệt ngay khi không còn cần. */
  const wipeKeys = () => {
    setKeyInputs({});
    setMissingKeys([]);
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setKeysOpen(false);
    setFinalOpen(false);
    setReport(null);
    setDob("");
    setAck(false);
    setPhrase("");
    wipeKeys();
  };

  /** Bước tiếp theo: hỏi máy chủ còn thiếu khoá nào, thiếu thì mở ô nhập. */
  const proceed = async () => {
    if (!allValid) return;
    setBusy(true);
    try {
      const { body } = await callRaw({ action: "key-status", keys: keyInputs });
      const missing = (body?.missing ?? []) as MissingKey[];
      setMissingKeys(missing);
      if (missing.length) setKeysOpen(true);
      else setFinalOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Không kiểm tra được khoá máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!allValid) return;
    setBusy(true);
    try {
      const r = (await callEndpoint({
        action: "execute",
        dob,
        acknowledged: ack,
        phrase,
        finalConfirm: true,
        keys: keyInputs,
      })) as WipeReport;
      setReport(r);
      setFinalOpen(false);
      setKeysOpen(false);
      wipeKeys();
      toast.success(`Đã xoá xong dữ liệu website — ${r.totalRowsDeleted.toLocaleString("vi-VN")} dòng.`);
    } catch (e: any) {
      setFinalOpen(false);
      toast.error(e?.message || "Đã huỷ — không có dữ liệu nào bị xoá.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admv3-page admv3-emergency">
      <div className="admv3-page-header">
        <div>
          <h1 className="admv3-page-title">
            <span className="admv3-emerg-title-flair">🚨</span> Khẩn Cấp
          </h1>
          <p className="admv3-page-sub">
            Xoá toàn bộ <b>dữ liệu</b> website — giữ nguyên cấu trúc, cấu hình và mã nguồn.
          </p>
        </div>
      </div>

      <div className="adm-emerg-warn">
        <AlertTriangle size={18} />
        <div>
          <div className="adm-emerg-warn-title">Thao tác không thể hoàn tác</div>
          <div className="adm-emerg-warn-sub">
            Sẽ xoá: bài viết, ảnh/video đã tải lên, tin nhắn, thông báo, quà tặng, lịch sử giao dịch,
            hồ sơ và tài khoản đăng nhập của thành viên thường.{" "}
            <b>Giữ nguyên</b>: tài khoản Bang Chủ/Admin, cấu hình website, bảng biểu và cấu trúc cơ sở dữ liệu.
          </div>
        </div>
      </div>

      <div className="adm-emerg-danger-zone">
        <div className="adm-emerg-danger-glow" aria-hidden />
        <div className="adm-emerg-danger-inner">
          <div className="adm-emerg-danger-head">
            <div className="adm-emerg-danger-icon">
              <ShieldAlert size={30} strokeWidth={2.2} />
            </div>
            <div>
              <div className="adm-emerg-danger-eyebrow">XOÁ DỮ LIỆU TOÀN WEBSITE</div>
              <h2 className="adm-emerg-danger-title">🚨 KHẨN CẤP NHẤT</h2>
              <p className="adm-emerg-danger-sub">
                Chỉ xoá dữ liệu trong danh sách bảng được phép, chạy hoàn toàn phía máy chủ. Không
                xoá bảng, không xoá schema, không đổi cấu hình.
              </p>
            </div>
          </div>

          <button type="button" className="adm-emerg-danger-btn" onClick={() => setOpen(true)}>
            <Trash2 size={18} />
            <span>XOÁ TOÀN BỘ DỮ LIỆU WEBSITE</span>
          </button>
        </div>
      </div>

      <p className="adm-emerg-footnote">
        Khoá máy chủ chỉ tồn tại phía backend — không bao giờ gửi xuống trình duyệt. Sai bất kỳ bước
        xác nhận nào, thao tác bị huỷ và không có dữ liệu nào bị xoá.
      </p>

      <AnimatePresence>
        {open && (
          <motion.div
            className="adm-emerg-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
          >
            <motion.div
              className="adm-emerg-modal is-wide"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="adm-emerg-modal-x" onClick={close} aria-label="Đóng">
                <X size={16} />
              </button>

              {!report ? (
                <>
                  <div className="adm-emerg-modal-head">
                    <div className="adm-emerg-modal-icon">
                      <ShieldAlert size={22} />
                    </div>
                    <h3>Xác minh trước khi xoá dữ liệu</h3>
                  </div>

                  <p className="adm-emerg-modal-desc">
                    Hoàn thành <b>cả ba bước</b> bên dưới. Nút xoá chỉ mở khoá khi mọi bước hợp lệ.
                  </p>

                  <div className="adm-emerg-form">
                    <label htmlFor="adm-emerg-dob">1. Ngày sinh xác minh</label>
                    <input
                      id="adm-emerg-dob"
                      type="text"
                      inputMode="numeric"
                      placeholder="Nhập ngày sinh"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />

                    <label htmlFor="adm-emerg-phrase">
                      3. Gõ chính xác <b>{CONFIRM_PHRASE}</b>
                    </label>
                    <input
                      id="adm-emerg-phrase"
                      type="text"
                      placeholder={CONFIRM_PHRASE}
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                    />
                  </div>

                  <label className="adm-emerg-check">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      2. Tôi hiểu thao tác này xoá vĩnh viễn toàn bộ dữ liệu website và không thể
                      khôi phục.
                    </span>
                  </label>

                  <div className="adm-emerg-modal-warn">
                    <AlertTriangle size={14} />
                    <span>
                      Không xoá bảng, không xoá schema, không TRUNCATE. Cấu hình Auth/RLS và tài
                      khoản Bang Chủ được giữ nguyên.
                    </span>
                  </div>

                  <div className="adm-emerg-modal-actions">
                    <button type="button" className="adm-emerg-modal-cancel" onClick={close} disabled={busy}>
                      Huỷ
                    </button>
                    <button
                      type="button"
                      className="adm-emerg-modal-ok"
                      onClick={() => void proceed()}
                      disabled={busy || !allValid}
                    >
                      <Trash2 size={14} /> Xoá toàn bộ dữ liệu
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="adm-emerg-modal-head">
                    <div className="adm-emerg-modal-icon">
                      <ShieldCheck size={22} />
                    </div>
                    <h3>Đã xoá dữ liệu thành công</h3>
                  </div>

                  <div className="adm-emerg-status is-ok">
                    Hoàn tất · {report.totalRowsDeleted.toLocaleString("vi-VN")} dòng dữ liệu đã xoá ·
                    0 bảng bị xoá · 0 thay đổi cấu trúc
                  </div>

                  <div className="adm-emerg-kpis">
                    <div><b>{report.totalRowsDeleted}</b><span>DÒNG ĐÃ XOÁ</span></div>
                    <div><b>{report.auth.deleted}</b><span>TÀI KHOẢN THÀNH VIÊN</span></div>
                    <div><b>{report.auth.kept}</b><span>ADMIN GIỮ LẠI</span></div>
                    <div><b>0</b><span>BẢNG BỊ XOÁ</span></div>
                  </div>

                  {report.databases.map((d) => (
                    <div className="adm-emerg-sec" key={d.id}>
                      <h4><Database size={14} /> {d.id} — {d.label}</h4>
                      {d.skipped ? (
                        <div className="adm-emerg-note">Bỏ qua: thiếu khoá máy chủ.</div>
                      ) : (
                        <>
                          <div className="adm-emerg-line">Đã xoá <b>{d.deleted}</b> dòng</div>
                          <div className="adm-emerg-table">
                            {d.rows.map((r) => (
                              <div className="adm-emerg-trow" key={r.table}>
                                <span className="t">{r.table}</span>
                                <span className="n is-test">{r.before ?? "—"}</span>
                                <span className="n">{r.after ?? "—"}</span>
                                <span className="n">{r.ok ? "OK" : "bỏ qua"}</span>
                              </div>
                            ))}
                          </div>
                          {d.preserved?.length ? (
                            <div className="adm-emerg-note">Giữ nguyên: {d.preserved.join(", ")}</div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}

                  <div className="adm-emerg-sec">
                    <h4><HardDrive size={14} /> Kho lưu trữ</h4>
                    {report.storage.map((s) =>
                      s.buckets.map((b) => (
                        <div className="adm-emerg-line" key={`${s.id}-${b.bucket}`}>
                          {s.id} · {b.bucket}: đã xoá <b>{b.removed}</b> file — {b.note}
                        </div>
                      )),
                    )}
                  </div>

                  <div className="adm-emerg-modal-actions">
                    <button type="button" className="adm-emerg-modal-cancel" onClick={close}>
                      Đóng
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== HỘP THOẠI NHẬP KHOÁ MÁY CHỦ CÒN THIẾU ===== */}
      <AnimatePresence>
        {keysOpen && (
          <motion.div
            className="adm-emerg-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="adm-emerg-modal is-wide"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="adm-emerg-modal-head">
                <div className="adm-emerg-modal-icon">
                  <ShieldAlert size={22} />
                </div>
                <h3>Nhập khoá máy chủ còn thiếu</h3>
              </div>
              <p className="adm-emerg-modal-desc">
                Máy chủ chưa có {missingKeys.length} khoá dưới đây. Nhập đầy đủ để tiếp tục. Khoá{" "}
                <b>không được lưu</b> vào cơ sở dữ liệu hay trình duyệt — chỉ dùng cho đúng lần thực
                thi này rồi xoá khỏi bộ nhớ.
              </p>

              <div className="adm-emerg-form">
                {missingKeys.map((m) => (
                  <div key={m.db}>
                    <label htmlFor={`adm-emerg-key-${m.db}`}>
                      {m.envKey} — {m.label}
                    </label>
                    <input
                      id={`adm-emerg-key-${m.db}`}
                      type="password"
                      placeholder="Dán khoá service role"
                      value={keyInputs[m.db] ?? ""}
                      onChange={(e) =>
                        setKeyInputs((prev) => ({ ...prev, [m.db]: e.target.value }))
                      }
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                    />
                  </div>
                ))}
              </div>

              <div className="adm-emerg-modal-warn">
                <AlertTriangle size={14} />
                <span>
                  Khoá chỉ được gửi thẳng tới máy chủ trong một lần yêu cầu. Huỷ bất kỳ lúc nào sẽ
                  xoá khoá khỏi bộ nhớ và không có dữ liệu nào bị xoá.
                </span>
              </div>

              <div className="adm-emerg-modal-actions">
                <button
                  type="button"
                  className="adm-emerg-modal-cancel"
                  onClick={() => {
                    setKeysOpen(false);
                    wipeKeys();
                  }}
                  disabled={busy}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  className="adm-emerg-modal-ok"
                  onClick={() => {
                    setKeysOpen(false);
                    setFinalOpen(true);
                  }}
                  disabled={busy || !keysFilled}
                >
                  <ShieldCheck size={14} /> Xác nhận khoá
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== HỘP THOẠI XÁC NHẬN CUỐI CÙNG ===== */}
      <AnimatePresence>
        {finalOpen && (
          <motion.div
            className="adm-emerg-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="adm-emerg-modal"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="adm-emerg-modal-head">
                <div className="adm-emerg-modal-icon">
                  <AlertTriangle size={22} />
                </div>
                <h3>Xác nhận lần cuối</h3>
              </div>
              <p className="adm-emerg-modal-desc">
                Thao tác này chỉ xóa dữ liệu trong phạm vi đã định. KHÔNG DROP TABLE, KHÔNG DROP
                SCHEMA, KHÔNG xóa RLS/function/index/bucket.
              </p>
              <div className="adm-emerg-modal-actions">
                <button
                  type="button"
                  className="adm-emerg-modal-cancel"
                  onClick={() => setFinalOpen(false)}
                  disabled={busy}
                >
                  Không, quay lại
                </button>
                <button
                  type="button"
                  className="adm-emerg-modal-ok"
                  onClick={() => void execute()}
                  disabled={busy || !allValid}
                >
                  {busy ? <Loader2 size={14} className="adm-emerg-spin" /> : <Trash2 size={14} />}
                  {busy ? "Đang xoá…" : "Có, xoá ngay"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EmergencyManager;
