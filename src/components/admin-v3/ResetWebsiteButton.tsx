import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, db2, db3 } from "@/lib/db/router";

/** Mật mã admin cố định để xác nhận reset dữ liệu website. */
const ADMIN_PIN = "792006";

/** Các bảng sẽ bị xoá sạch dữ liệu (KHÔNG drop bảng). */
const TABLES_PRIMARY = [
  "post_reports", "comment_likes", "comments", "likes", "post_likes",
  "posts", "stories", "notifications", "messages", "conversations",
  "gem_transactions", "gem_history", "coin_transfers", "withdrawal_requests",
  "reports", "feedbacks", "follows", "user_blocks", "user_locations",
  "second_accounts", "profiles",
];
const TABLES_MEDIA = ["clone_media", "voice_library", "feedbacks", "media_items"];
const TABLES_LOGS = [
  "post_reports", "comment_likes", "comments", "likes", "posts",
  "messages", "conversations", "notifications", "activity_logs", "admin_logs",
];

async function wipe(client: any, tables: string[]) {
  for (const t of tables) {
    try {
      await client.from(t).delete().not("id", "is", null);
    } catch {
      /* bảng không tồn tại → bỏ qua, không chặn quá trình reset */
    }
  }
}

export function ResetWebsiteButton() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (pin.trim() !== ADMIN_PIN) {
      toast.error("Mật mã không đúng!");
      return;
    }
    setBusy(true);
    toast.success("Chào Mừng Trở Lại Đài Loan");

    try {
      const { error } = await (supabase as any).rpc("reset_all_website_data");
      if (error) throw error;
    } catch {
      // Không có RPC → xoá trực tiếp từng bảng trên cả 3 database.
      await wipe(supabase, TABLES_PRIMARY);
      await wipe(db2(), TABLES_MEDIA);
      await wipe(db3(), TABLES_LOGS);
    }

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore */ }

    window.location.replace("/");
  }

  return (
    <>
      <button
        className="admv3-btn admv3-btn-ghost"
        onClick={() => { setPin(""); setOpen(true); }}
        title="Reset toàn bộ dữ liệu website"
      >
        <CheckCircle2 size={14} />
        <span>Thành Công</span>
      </button>

      {open && (
        <div className="rswb-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="rswb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận Mật mã Admin</h3>
            <p>Hành động này sẽ xoá sạch dữ liệu website (giữ nguyên cấu trúc bảng).</p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="Nhập mật mã admin"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) void run(); }}
            />
            <div className="rswb-actions">
              <button className="rswb-cancel" disabled={busy} onClick={() => setOpen(false)}>Huỷ</button>
              <button className="rswb-ok" disabled={busy} onClick={() => void run()}>
                {busy ? <Loader2 size={14} className="rswb-spin" /> : null} Xác nhận
              </button>
            </div>
          </div>
          <style>{`
            .rswb-backdrop { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.6);
              display: flex; align-items: center; justify-content: center; padding: 16px; }
            .rswb-modal { width: 100%; max-width: 360px; border-radius: 16px; padding: 18px;
              background: var(--v3-panel, #14161c); color: var(--v3-text, #e5e7eb);
              border: 1px solid rgba(255,255,255,.1); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
            .rswb-modal h3 { margin: 0 0 6px; font-size: 1rem; font-weight: 700; }
            .rswb-modal p { margin: 0 0 12px; font-size: .8rem; opacity: .7; }
            .rswb-modal input { width: 100%; padding: 10px 12px; border-radius: 10px;
              border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.05);
              color: inherit; font-size: .9rem; letter-spacing: .2em; }
            .rswb-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
            .rswb-actions button { padding: 8px 14px; border-radius: 10px; font-size: .85rem;
              font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,.15);
              display: inline-flex; align-items: center; gap: 6px; }
            .rswb-cancel { background: transparent; color: inherit; }
            .rswb-ok { background: #ef4444; color: #fff; border-color: #ef4444; }
            .rswb-spin { animation: rswb-rot 1s linear infinite; }
            @keyframes rswb-rot { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </>
  );
}
