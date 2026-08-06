/**
 * ❤️ Kết Nối Bí Mật — Tab "Tin nhắn Clone".
 * Cho phép admin xem toàn bộ hộp thư của các clone trong kho, trả lời và thu hồi
 * tin nhắn do clone gửi. Dùng lại RPC nội bộ của "Tài khoản thứ hai".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatReplyModal } from "@/components/admin-v3/second-accounts/ChatReplyModal";
import { relTime } from "@/components/admin-v3/second-accounts/InternalTools";
import type { AccountLite } from "@/components/admin-v3/second-accounts/InternalTools";
import type { SecretAccountRow } from "@/lib/secret-connect";

const sb = supabase as any;

type Thread = {
  peer_id: string;
  peer_username: string | null;
  peer_name: string | null;
  peer_avatar: string | null;
  last_content: string | null;
  last_at: string | null;
  unread: number;
};

type Msg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  created_at: string | null;
  is_recalled?: boolean | null;
};

function toAccountLite(row: SecretAccountRow): AccountLite {
  return {
    id: row.account_id,
    username: row.username || "clone",
    full_name: row.name,
    avatar: row.avatar,
  };
}

export function CloneMessagesTab({ accounts }: { accounts: SecretAccountRow[] }) {
  const clones = useMemo(
    () => accounts.filter((a) => !!a.account_id),
    [accounts],
  );
  const [selected, setSelected] = useState<SecretAccountRow | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState<{ peerId: string; peerName: string | null } | null>(null);
  const [recallOpen, setRecallOpen] = useState<Thread | null>(null);
  const [recallMsgs, setRecallMsgs] = useState<Msg[]>([]);

  useEffect(() => {
    if (!selected && clones.length > 0) setSelected(clones[0]!);
  }, [clones, selected]);

  const loadThreads = useCallback(async (row: SecretAccountRow | null) => {
    if (!row) return;
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_threads", {
        p_account: row.account_id,
      });
      if (error) throw error;
      const list = ((data ?? []) as Thread[]).slice().sort((a, b) => {
        const at = a.last_at ? new Date(a.last_at).getTime() : 0;
        const bt = b.last_at ? new Date(b.last_at).getTime() : 0;
        return bt - at;
      });
      setThreads(list);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được hộp thư clone");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads(selected);
  }, [selected, loadThreads]);

  const openRecall = useCallback(
    async (t: Thread) => {
      if (!selected) return;
      setRecallOpen(t);
      try {
        const { data, error } = await sb.rpc("admin_internal_thread_messages", {
          p_account: selected.account_id,
          p_peer: t.peer_id,
          p_limit: 100,
        });
        if (error) throw error;
        setRecallMsgs((data ?? []) as Msg[]);
      } catch (e: any) {
        toast.error(e?.message || "Không tải được tin nhắn");
        setRecallMsgs([]);
      }
    },
    [selected],
  );

  const recall = useCallback(async (id: string) => {
    try {
      const { error } = await sb
        .from("messages")
        .update({ is_recalled: true, recalled_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setRecallMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, is_recalled: true } : m)));
      toast.success("Đã thu hồi tin nhắn");
    } catch (e: any) {
      toast.error(e?.message || "Thu hồi thất bại");
    }
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)", gap: 12 }}>
      {/* Danh sách clone */}
      <div className="admv3-card" style={{ padding: 8, maxHeight: 560, overflowY: "auto" }}>
        <div style={{ padding: "6px 8px", fontSize: 12, opacity: 0.6 }}>
          {clones.length} clone
        </div>
        {clones.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className={`admv3-btn ${selected?.id === c.id ? "" : "admv3-btn-ghost"}`}
            style={{
              width: "100%",
              justifyContent: "flex-start",
              marginBottom: 6,
              textAlign: "left",
            }}
          >
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.name || c.username || c.account_id}
            </span>
          </button>
        ))}
        {clones.length === 0 && (
          <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>Chưa có clone nào.</div>
        )}
      </div>

      {/* Hộp thư của clone đang chọn */}
      <div className="admv3-card" style={{ padding: 12, minHeight: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <b style={{ flex: 1, minWidth: 0 }}>
            Hộp thư: {selected?.name || selected?.username || "—"}
          </b>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => void loadThreads(selected)}>
            Tải lại
          </button>
        </div>

        {loading && <div style={{ fontSize: 13, opacity: 0.7 }}>Đang tải…</div>}
        {!loading && threads.length === 0 && (
          <div style={{ fontSize: 13, opacity: 0.7 }}>Clone này chưa có cuộc trò chuyện nào.</div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {threads.map((t) => (
            <div
              key={t.peer_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(127,127,127,0.22)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {t.peer_name || t.peer_username || t.peer_id}
                  {t.unread > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#ff5a9e" }}>
                      {t.unread} chưa đọc
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    opacity: 0.7,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.last_content || "—"} · {relTime(t.last_at)}
                </div>
              </div>
              <button
                className="admv3-btn"
                onClick={() => setChat({ peerId: t.peer_id, peerName: t.peer_name })}
              >
                Trả lời
              </button>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => void openRecall(t)}>
                Thu hồi
              </button>
            </div>
          ))}
        </div>
      </div>

      {chat && selected && (
        <ChatReplyModal
          account={toAccountLite(selected)}
          peerId={chat.peerId}
          peerName={chat.peerName}
          onClose={() => {
            setChat(null);
            void loadThreads(selected);
          }}
        />
      )}

      {recallOpen && selected && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setRecallOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 140,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background: "rgba(4,2,12,0.6)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            className="admv3-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 520, maxHeight: "80vh", overflowY: "auto", padding: 16 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <b style={{ flex: 1 }}>Thu hồi tin nhắn của clone</b>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => setRecallOpen(null)}>
                Đóng
              </button>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {recallMsgs
                .filter((m) => m.sender_id === selected.account_id)
                .map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(127,127,127,0.22)",
                      opacity: m.is_recalled ? 0.55 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                      {m.is_recalled ? <i>Tin nhắn đã thu hồi</i> : m.content || "—"}
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{relTime(m.created_at)}</div>
                    </div>
                    {!m.is_recalled && (
                      <button className="admv3-btn admv3-btn-ghost" onClick={() => void recall(m.id)}>
                        Thu hồi
                      </button>
                    )}
                  </div>
                ))}
              {recallMsgs.filter((m) => m.sender_id === selected.account_id).length === 0 && (
                <div style={{ fontSize: 13, opacity: 0.7 }}>Clone chưa gửi tin nhắn nào.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CloneMessagesTab;
