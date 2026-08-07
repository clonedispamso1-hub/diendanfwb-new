// Popup trả lời nhanh 1 đoạn chat của clone (mở từ thông báo tin nhắn).
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X, RefreshCw, Send, Sticker, Smile, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GifPicker } from "@/components/candy/gif-picker";
import { VipGifPicker } from "@/components/admin-v3/vip/VipGifPicker";
import type { AccountLite } from "./InternalTools";

const sb = supabase as any;
const GIF_TOKEN_G = /\[\[gif:([^\]\s]+)\]\]/g;
const QUICK_EMOJIS = ["😀", "😂", "😍", "🥰", "🔥", "👏", "❤️", "👍", "😮", "✨"];

type Msg = {
  id: string; sender_id: string; receiver_id: string;
  content: string | null; image_url: string | null; created_at: string | null;
};

function Body({ text, image }: { text: string | null; image: string | null }) {
  const raw = text || "";
  const gifs = Array.from(raw.matchAll(GIF_TOKEN_G)).map((m) => m[1]);
  const plain = raw.replace(GIF_TOKEN_G, "").trim();
  return (
    <div className="space-y-1">
      {plain && <div className="whitespace-pre-wrap break-words">{plain}</div>}
      {gifs.map((u) => <img loading="lazy" decoding="async" key={u} src={u} alt="" className="max-h-36 rounded-lg" />)}
      {image && <img loading="lazy" decoding="async" src={image} alt="" className="max-h-36 rounded-lg" />}
    </div>
  );
}

export function ChatReplyModal({
  account, peerId, peerName, onClose,
}: {
  account: AccountLite;
  peerId: string;
  peerName?: string | null;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showVipGif, setShowVipGif] = useState(false);
  const vipGifAnchor = useRef<HTMLButtonElement | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_thread_messages", {
        p_account: account.id, p_peer: peerId, p_limit: 200,
      });
      if (error) throw error;
      setMsgs((data ?? []) as Msg[]);
      setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 30);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được tin nhắn");
    } finally { setLoading(false); }
  }, [account.id, peerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`adm-notif-chat-${account.id}-${peerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [account.id, peerId, load]);

  const sendRaw = useCallback(async (body: string, image?: string | null) => {
    setSending(true);
    try {
      const { error } = await sb.rpc("admin_internal_send_message", {
        p_account: account.id, p_peer: peerId, p_content: body, p_image_url: image ?? null,
      });
      if (error) throw error;
      setText("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gửi thất bại");
    } finally { setSending(false); }
  }, [account.id, peerId, load]);

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-lg h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-semibold truncate">
            @{account.username} ↔ {peerName || "Người dùng"}
          </div>
          <div className="flex items-center gap-1">
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {msgs.map((m) => {
            const mine = m.sender_id === account.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Body text={m.content} image={m.image_url} />
                  <div className="text-[10px] opacity-70 mt-0.5">
                    {m.created_at ? new Date(m.created_at).toLocaleString("vi-VN") : ""}
                  </div>
                </div>
              </div>
            );
          })}
          {!msgs.length && !loading && (
            <div className="text-xs text-muted-foreground">Chưa có tin nhắn.</div>
          )}
          <div ref={endRef} />
        </div>

        {showEmoji && (
          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {QUICK_EMOJIS.map((e) => (
              <button key={e} className="admv3-btn admv3-btn-ghost" disabled={sending}
                onClick={() => sendRaw(e)}>{e}</button>
            ))}
          </div>
        )}

        <div className="border-t p-2 flex items-end gap-1">
          <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Emoji"
            onClick={() => setShowEmoji((v) => !v)}><Smile size={16} /></button>
          <div className="relative">
            <button ref={gifAnchor} className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="GIF"
              onClick={() => setShowGif((v) => !v)}><Sticker size={16} /></button>
            <GifPicker open={showGif} onClose={() => setShowGif(false)} anchorRef={gifAnchor}
              onPick={(u) => { setShowGif(false); sendRaw(`[[gif:${u}]]`); }} />
          </div>
          <div className="relative">
            <button ref={vipGifAnchor} className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="VIP GIF (Quản Lý Icon VIP)"
              onClick={() => setShowVipGif((v) => !v)}><Crown size={16} /></button>
            <VipGifPicker open={showVipGif} onClose={() => setShowVipGif(false)} anchorRef={vipGifAnchor}
              onPick={(u) => { setShowVipGif(false); sendRaw(`[[gif:${u}]]`); }} />
          </div>
          <textarea className="admv3-input flex-1" rows={1} value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) sendRaw(text.trim());
              }
            }}
            placeholder="Nhập trả lời…" />
          <button className="admv3-btn" disabled={sending || !text.trim()}
            onClick={() => sendRaw(text.trim())}><Send size={14} /></button>
        </div>
      </div>
    </div>
  );
}
