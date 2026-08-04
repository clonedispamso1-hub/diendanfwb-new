/**
 * Nearby Clone Manager — Admin "Quản Lý Tìm Quanh Đây".
 *
 *  - Top quick-action bar: bulk create 10 / 50 / 100 nick ảo (no extra form).
 *  - Data grid: liệt kê toàn bộ clone đang hoạt động với cột Ngày tạo,
 *    Thông tin Nick (avatar + display + UID), Tin nhắn đến, Yêu thích mới,
 *    Hành động (mở console chat).
 *  - Modal Bang Chủ Interceptor: admin masquerade theo clone, reply trực tiếp
 *    vào bảng `messages` với sender_id = clone.id.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, MessageSquare, Plus, RefreshCw, Search, Users,
  Send, X, Crown, Sparkles, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkCreateVirtualClones,
  adminListClonesWithStats,
  adminListCustomersForClone,
  loadVirtualThread,
  adminReplyVirtual,
  type CloneStreamRow,
} from "@/lib/virtual-profiles";

type Customer = {
  customer_id: string;
  last_content: string;
  last_at: string;
  customer: { id: string; full_name: string | null; username: string | null; avatar: string | null } | null;
};

type ThreadMsg = {
  id: string;
  sender: "admin" | "customer";
  content: string;
  created_at: string;
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function shortUid(id: string): string {
  if (!id) return "—";
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export function NearbyCloneManager() {
  const [rows, setRows] = useState<CloneStreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyBulk, setBusyBulk] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [activeClone, setActiveClone] = useState<CloneStreamRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListClonesWithStats(200);
      setRows(data);
    } catch (e: any) {
      console.error("[NearbyCloneManager] list error:", e);
      toast.error("Không tải được danh sách nick ảo: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleBulk(n: number) {
    if (busyBulk) return;
    setBusyBulk(n);
    try {
      const created = await bulkCreateVirtualClones(n);
      toast.success(`Đã tạo nhanh ${created.length} nick ảo.`);
      await refresh();
    } catch (e: any) {
      console.error(e);
      toast.error("Tạo nick ảo thất bại: " + (e?.message || e));
    } finally {
      setBusyBulk(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.display_name || r.full_name || "").toLowerCase().includes(q) ||
      (r.username || "").toLowerCase().includes(q) ||
      shortUid(r.id).toLowerCase().includes(q),
    );
  }, [rows, query]);

  const stats = useMemo(() => {
    const totalMsg = rows.reduce((a, r) => a + r.incoming_messages, 0);
    const totalFol = rows.reduce((a, r) => a + r.new_followers, 0);
    return { count: rows.length, msg: totalMsg, fol: totalFol };
  }, [rows]);

  return (
    <div className="ncm-root">
      {/* Quick action bar */}
      <div className="ncm-quickbar">
        <div className="ncm-quickbar-head">
          <div>
            <div className="ncm-quickbar-title">Tạo nhanh Nick Ảo</div>
            <div className="ncm-quickbar-sub">Bulk seed clone — không cần form cấu hình</div>
          </div>
          <div className="ncm-stats">
            <div className="ncm-stat"><span>{stats.count}</span> Tổng nick</div>
            <div className="ncm-stat ncm-stat--msg"><span>{stats.msg}</span> Tin đến</div>
            <div className="ncm-stat ncm-stat--fol"><span>{stats.fol}</span> Quan tâm</div>
          </div>
        </div>
        <div className="ncm-quick-grid">
          {[10, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              className={`ncm-quick-btn ${n === 100 ? "is-max" : ""}`}
              disabled={busyBulk !== null}
              onClick={() => handleBulk(n)}
            >
              {busyBulk === n ? <Loader2 size={16} className="ncm-spin" /> : <Plus size={16} />}
              <span>Tạo nhanh {n} Nick Ảo{n === 100 ? " (Max)" : ""}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="ncm-toolbar">
        <div className="ncm-search">
          <Search size={14} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên, username hoặc UID…"
          />
        </div>
        <button type="button" className="ncm-ghost" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "ncm-spin" : ""} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Table */}
      <div className="ncm-tablewrap">
        <table className="ncm-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Ngày tạo</th>
              <th>Thông tin Nick</th>
              <th style={{ width: 140 }}>Tin nhắn đến</th>
              <th style={{ width: 140 }}>Yêu thích mới</th>
              <th style={{ width: 180 }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="ncm-empty">
                <Loader2 size={18} className="ncm-spin" /> Đang tải…
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="ncm-empty">
                <Users size={18} /> Chưa có nick ảo nào. Bấm "Tạo nhanh" phía trên để seed.
              </td></tr>
            )}
            {!loading && filtered.map((r) => (
              <tr key={r.id}>
                <td className="ncm-date">{fmtDate(r.created_at)}</td>
                <td>
                  <div className="ncm-nick">
                    <div className="ncm-avatar">
                      {r.avatar
                        ? <img src={r.avatar} alt="" loading="lazy" />
                        : <span>{(r.display_name || r.full_name || "?").slice(0, 1).toUpperCase()}</span>}
                      {(r.vip_level || 0) >= 5 && <Crown size={11} className="ncm-vip" />}
                    </div>
                    <div className="ncm-nick-text">
                      <div className="ncm-nick-name">{r.display_name || r.full_name || r.username || "Nick ảo"}</div>
                      <div className="ncm-nick-meta">
                        <span className="ncm-uid">ID: {shortUid(r.id)}</span>
                        {r.province && <span className="ncm-prov"><MapPin size={10} /> {r.province}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`ncm-pill ${r.incoming_messages > 0 ? "is-hot" : ""}`}>
                    {r.incoming_messages > 0 && "🔥 "}{r.incoming_messages} tin nhắn
                  </span>
                </td>
                <td>
                  <span className={`ncm-pill ncm-pill--fol ${r.new_followers > 0 ? "is-active" : ""}`}>
                    <Sparkles size={11} /> {r.new_followers}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="ncm-reply-btn"
                    onClick={() => setActiveClone(r)}
                  >
                    <MessageSquare size={14} />
                    Trả lời tin nhắn
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeClone && (
        <CloneChatConsole
          clone={activeClone}
          onClose={() => { setActiveClone(null); refresh(); }}
        />
      )}

      <NearbyCloneManagerStyles />
    </div>
  );
}

/* ============================================================
 * Modal — Admin masquerade as clone (Bang Chủ Interceptor)
 * ============================================================ */

function CloneChatConsole({ clone, onClose }: { clone: CloneStreamRow; onClose: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await adminListCustomersForClone(clone.id);
      setCustomers(data as Customer[]);
      if (!activeCustomer && data.length > 0) {
        setActiveCustomer(data[0] as Customer);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Không tải được danh sách khách: " + (e?.message || e));
    } finally {
      setLoadingList(false);
    }
  }, [clone.id, activeCustomer]);

  useEffect(() => { refreshList(); /* eslint-disable-next-line */ }, [clone.id]);

  useEffect(() => {
    if (!activeCustomer) return;
    let cancelled = false;
    setLoadingThread(true);
    loadVirtualThread(clone.id, activeCustomer.customer_id)
      .then((data: any[]) => {
        if (cancelled) return;
        setThread(data as ThreadMsg[]);
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      })
      .catch((e) => {
        console.error(e);
        toast.error("Không tải được hội thoại");
      })
      .finally(() => !cancelled && setLoadingThread(false));
    return () => { cancelled = true; };
  }, [activeCustomer, clone.id]);

  async function handleSend() {
    if (!activeCustomer || !draft.trim() || sending) return;
    const content = draft.trim();
    setSending(true);
    try {
      await adminReplyVirtual(clone.id, activeCustomer.customer_id, content);
      setDraft("");
      // optimistic + refetch
      setThread((cur) => [
        ...cur,
        { id: `tmp-${Date.now()}`, sender: "admin", content, created_at: new Date().toISOString() },
      ]);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Gửi tin thất bại");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ncm-modal" role="dialog" aria-modal="true">
      <div className="ncm-modal-backdrop" onClick={onClose} />
      <div className="ncm-modal-panel">
        <header className="ncm-modal-head">
          <div className="ncm-modal-id">
            <div className="ncm-avatar ncm-avatar-lg">
              {clone.avatar
                ? <img loading="lazy" decoding="async" src={clone.avatar} alt="" />
                : <span>{(clone.display_name || clone.full_name || "?").slice(0, 1).toUpperCase()}</span>}
            </div>
            <div>
              <div className="ncm-modal-title">
                Bang Chủ Console · {clone.display_name || clone.full_name || clone.username}
              </div>
              <div className="ncm-modal-sub">
                Đang đóng vai nick <b>ID: {shortUid(clone.id)}</b> — mọi tin gửi từ console này sẽ ghi vào <code>messages.sender_id = clone</code>.
              </div>
            </div>
          </div>
          <button type="button" className="ncm-icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>

        <div className="ncm-modal-body">
          {/* Customer list */}
          <aside className="ncm-modal-side">
            <div className="ncm-side-head">
              <span>Khách đang trò chuyện</span>
              <button type="button" className="ncm-icon-btn-sm" onClick={refreshList}>
                <RefreshCw size={12} className={loadingList ? "ncm-spin" : ""} />
              </button>
            </div>
            <div className="ncm-side-list">
              {loadingList && <div className="ncm-side-empty"><Loader2 size={14} className="ncm-spin" /> Đang tải…</div>}
              {!loadingList && customers.length === 0 && (
                <div className="ncm-side-empty">Chưa có khách nào nhắn cho nick này.</div>
              )}
              {customers.map((c) => {
                const name = c.customer?.full_name || c.customer?.username || "Người dùng";
                const isActive = activeCustomer?.customer_id === c.customer_id;
                return (
                  <button
                    type="button"
                    key={c.customer_id}
                    className={`ncm-side-item ${isActive ? "is-active" : ""}`}
                    onClick={() => setActiveCustomer(c)}
                  >
                    <div className="ncm-avatar ncm-avatar-sm">
                      {c.customer?.avatar
                        ? <img loading="lazy" decoding="async" src={c.customer.avatar} alt="" />
                        : <span>{name.slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <div className="ncm-side-text">
                      <div className="ncm-side-name">{name}</div>
                      <div className="ncm-side-snippet">{c.last_content}</div>
                    </div>
                    <span className="ncm-side-time">{fmtDate(c.last_at).split(" ")[1] || ""}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Conversation */}
          <section className="ncm-modal-conv">
            {!activeCustomer && (
              <div className="ncm-conv-empty">
                Chọn một cuộc hội thoại bên trái để bắt đầu trả lời.
              </div>
            )}
            {activeCustomer && (
              <>
                <div className="ncm-conv-head">
                  <div className="ncm-avatar ncm-avatar-sm">
                    {activeCustomer.customer?.avatar
                      ? <img loading="lazy" decoding="async" src={activeCustomer.customer.avatar} alt="" />
                      : <span>{(activeCustomer.customer?.full_name || "?").slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div>
                    <div className="ncm-conv-name">{activeCustomer.customer?.full_name || activeCustomer.customer?.username}</div>
                    <div className="ncm-conv-sub">UID: {shortUid(activeCustomer.customer_id)}</div>
                  </div>
                </div>
                <div className="ncm-conv-thread" ref={scrollRef}>
                  {loadingThread && <div className="ncm-side-empty"><Loader2 size={14} className="ncm-spin" /> Đang tải hội thoại…</div>}
                  {!loadingThread && thread.length === 0 && (
                    <div className="ncm-side-empty">Chưa có tin nào trong cuộc trò chuyện này.</div>
                  )}
                  {thread.map((m) => (
                    <div key={m.id} className={`ncm-bubble ncm-bubble--${m.sender}`}>
                      <div className="ncm-bubble-content">{m.content}</div>
                      <div className="ncm-bubble-time">{fmtDate(m.created_at)}</div>
                    </div>
                  ))}
                </div>
                <div className="ncm-conv-composer">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Trả lời với danh nghĩa ${clone.display_name || clone.full_name || "nick ảo"}…`}
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="ncm-send-btn"
                    disabled={!draft.trim() || sending}
                    onClick={handleSend}
                  >
                    {sending ? <Loader2 size={14} className="ncm-spin" /> : <Send size={14} />}
                    <span>Gửi</span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Inline styles — match adm1 dark glass theme
 * ============================================================ */

function NearbyCloneManagerStyles() {
  return (
    <style>{`
      .ncm-root { display: flex; flex-direction: column; gap: 16px; color: #e6e7ef; }
      .ncm-spin { animation: ncm-spin 1s linear infinite; }
      @keyframes ncm-spin { to { transform: rotate(360deg); } }

      .ncm-quickbar {
        border-radius: 14px; padding: 16px;
        background: linear-gradient(135deg, rgba(139,92,246,.16), rgba(59,130,246,.10));
        border: 1px solid rgba(255,255,255,.08);
      }
      .ncm-quickbar-head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .ncm-quickbar-title { font-size: 0.95rem; font-weight: 700; color: #fff; }
      .ncm-quickbar-sub { font-size: 0.78rem; color: rgba(255,255,255,.6); }
      .ncm-stats { display: flex; gap: 8px; }
      .ncm-stat { padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,.06); font-size: 0.72rem; color: rgba(255,255,255,.7); }
      .ncm-stat span { font-weight: 800; color: #fff; margin-right: 4px; }
      .ncm-stat--msg { background: rgba(244,114,182,.18); }
      .ncm-stat--fol { background: rgba(52,211,153,.18); }

      .ncm-quick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      @media (max-width: 720px) { .ncm-quick-grid { grid-template-columns: 1fr; } }
      .ncm-quick-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06); color: #fff; font-weight: 700; font-size: 0.85rem;
        cursor: pointer; transition: all .15s ease;
      }
      .ncm-quick-btn:hover:not(:disabled) { background: rgba(139,92,246,.25); border-color: rgba(139,92,246,.5); transform: translateY(-1px); }
      .ncm-quick-btn:disabled { opacity: .55; cursor: not-allowed; }
      .ncm-quick-btn.is-max { background: linear-gradient(135deg, #a855f7, #6366f1); border-color: transparent; }
      .ncm-quick-btn.is-max:hover:not(:disabled) { filter: brightness(1.1); }

      .ncm-toolbar { display: flex; gap: 10px; align-items: center; }
      .ncm-search {
        flex: 1; display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 12px; border-radius: 10px;
        background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
        color: rgba(255,255,255,.7);
      }
      .ncm-search input { flex: 1; background: transparent; border: 0; outline: 0; color: #fff; font-size: 0.85rem; }
      .ncm-ghost {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 12px; border-radius: 10px;
        background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10);
        color: #fff; font-size: 0.8rem; cursor: pointer;
      }
      .ncm-ghost:hover { background: rgba(255,255,255,.10); }

      .ncm-tablewrap { border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: rgba(15,17,28,.6); }
      .ncm-table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
      .ncm-table thead th {
        text-align: left; font-weight: 700; font-size: 0.72rem; color: rgba(255,255,255,.55);
        text-transform: uppercase; letter-spacing: .04em;
        padding: 12px 14px; background: rgba(255,255,255,.03);
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .ncm-table tbody td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.05); vertical-align: middle; }
      .ncm-table tbody tr:hover { background: rgba(139,92,246,.05); }
      .ncm-date { color: rgba(255,255,255,.65); font-variant-numeric: tabular-nums; }
      .ncm-empty { text-align: center; padding: 36px 14px !important; color: rgba(255,255,255,.55); }
      .ncm-empty svg { vertical-align: middle; margin-right: 6px; }

      .ncm-nick { display: flex; align-items: center; gap: 10px; }
      .ncm-avatar {
        position: relative; width: 36px; height: 36px; border-radius: 50%;
        overflow: hidden; flex-shrink: 0; background: rgba(139,92,246,.25);
        display: inline-flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700; font-size: 0.75rem;
        border: 1px solid rgba(255,255,255,.12);
      }
      .ncm-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .ncm-avatar-sm { width: 28px; height: 28px; }
      .ncm-avatar-lg { width: 44px; height: 44px; }
      .ncm-vip { position: absolute; right: -2px; bottom: -2px; color: #facc15; background: #1e1b2c; border-radius: 50%; padding: 1px; }
      .ncm-nick-text { min-width: 0; }
      .ncm-nick-name { font-weight: 700; color: #fff; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ncm-nick-meta { display: flex; gap: 8px; align-items: center; margin-top: 2px; }
      .ncm-uid { font-family: ui-monospace, monospace; font-size: 0.7rem; color: rgba(255,255,255,.55); }
      .ncm-prov { display: inline-flex; gap: 2px; align-items: center; font-size: 0.7rem; color: rgba(255,255,255,.5); }

      .ncm-pill {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 10px; border-radius: 999px;
        background: rgba(255,255,255,.06); color: rgba(255,255,255,.7);
        font-size: 0.75rem; font-weight: 600;
      }
      .ncm-pill.is-hot { background: rgba(244,114,182,.18); color: #f9a8d4; }
      .ncm-pill--fol.is-active { background: rgba(52,211,153,.18); color: #6ee7b7; }

      .ncm-reply-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 12px; border-radius: 8px;
        background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff;
        border: 0; cursor: pointer; font-size: 0.78rem; font-weight: 700;
        transition: filter .15s ease, transform .15s ease;
      }
      .ncm-reply-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }

      /* Modal */
      .ncm-modal { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
      .ncm-modal-backdrop { position: absolute; inset: 0; background: rgba(5,5,10,.7); backdrop-filter: blur(6px); }
      .ncm-modal-panel {
        position: relative; width: min(960px, 100%); height: min(680px, calc(100vh - 32px));
        background: #0e0f1a; border: 1px solid rgba(255,255,255,.08); border-radius: 16px;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 25px 60px rgba(0,0,0,.5);
      }
      .ncm-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,.08); }
      .ncm-modal-id { display: flex; align-items: center; gap: 12px; }
      .ncm-modal-title { font-size: 0.95rem; font-weight: 800; color: #fff; }
      .ncm-modal-sub { font-size: 0.72rem; color: rgba(255,255,255,.55); margin-top: 2px; }
      .ncm-modal-sub code { background: rgba(255,255,255,.06); padding: 1px 5px; border-radius: 4px; font-size: 0.7rem; }
      .ncm-icon-btn { background: transparent; border: 0; color: rgba(255,255,255,.6); cursor: pointer; padding: 6px; border-radius: 8px; }
      .ncm-icon-btn:hover { background: rgba(255,255,255,.08); color: #fff; }
      .ncm-icon-btn-sm { background: transparent; border: 0; color: rgba(255,255,255,.6); cursor: pointer; padding: 4px; border-radius: 6px; }

      .ncm-modal-body { flex: 1; display: grid; grid-template-columns: 280px 1fr; overflow: hidden; }
      @media (max-width: 720px) { .ncm-modal-body { grid-template-columns: 1fr; } }
      .ncm-modal-side { border-right: 1px solid rgba(255,255,255,.06); display: flex; flex-direction: column; min-height: 0; }
      .ncm-side-head { padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid rgba(255,255,255,.04); }
      .ncm-side-list { flex: 1; overflow: auto; }
      .ncm-side-empty { padding: 20px 14px; font-size: 0.78rem; color: rgba(255,255,255,.45); display: inline-flex; gap: 6px; align-items: center; }
      .ncm-side-item {
        width: 100%; display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center;
        padding: 10px 14px; background: transparent; border: 0; cursor: pointer; text-align: left;
        border-left: 2px solid transparent;
      }
      .ncm-side-item:hover { background: rgba(255,255,255,.04); }
      .ncm-side-item.is-active { background: rgba(139,92,246,.12); border-left-color: #8b5cf6; }
      .ncm-side-text { min-width: 0; }
      .ncm-side-name { font-size: 0.82rem; font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ncm-side-snippet { font-size: 0.72rem; color: rgba(255,255,255,.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ncm-side-time { font-size: 0.68rem; color: rgba(255,255,255,.4); }

      .ncm-modal-conv { display: flex; flex-direction: column; min-height: 0; }
      .ncm-conv-empty { display: flex; flex: 1; align-items: center; justify-content: center; color: rgba(255,255,255,.45); font-size: 0.85rem; }
      .ncm-conv-head { display: flex; gap: 10px; align-items: center; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.05); }
      .ncm-conv-name { font-size: 0.82rem; font-weight: 700; color: #fff; }
      .ncm-conv-sub { font-size: 0.68rem; color: rgba(255,255,255,.45); font-family: ui-monospace, monospace; }
      .ncm-conv-thread { flex: 1; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
      .ncm-bubble { max-width: 78%; padding: 8px 12px; border-radius: 14px; font-size: 0.83rem; line-height: 1.35; }
      .ncm-bubble-content { white-space: pre-wrap; word-wrap: break-word; }
      .ncm-bubble-time { margin-top: 2px; font-size: 0.66rem; opacity: .55; }
      .ncm-bubble--customer { background: rgba(255,255,255,.06); color: #fff; align-self: flex-start; border-bottom-left-radius: 4px; }
      .ncm-bubble--admin { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }

      .ncm-conv-composer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.06); }
      .ncm-conv-composer textarea {
        flex: 1; resize: none; background: rgba(255,255,255,.04); color: #fff;
        border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 10px 12px;
        font-family: inherit; font-size: 0.85rem; outline: 0;
      }
      .ncm-conv-composer textarea:focus { border-color: rgba(139,92,246,.5); }
      .ncm-send-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 0 14px; border-radius: 10px;
        background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff;
        border: 0; cursor: pointer; font-size: 0.82rem; font-weight: 700;
      }
      .ncm-send-btn:disabled { opacity: .5; cursor: not-allowed; }
    `}</style>
  );
}
