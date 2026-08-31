// Popup trả lời nhanh 1 đoạn chat của clone (mở từ thông báo tin nhắn).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X, RefreshCw, Send, Sticker, Smile, Crown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminSendMessage, adminThreadMessages } from "@/lib/admin/chat-admin-rpc";
import { useRealtime } from "@/lib/realtime-registry";
import { GifPicker } from "@/components/candy/gif-picker";
import { VipGifPicker } from "@/components/admin-v3/vip/VipGifPicker";
import { BaitGroupPickerButton } from "@/components/admin-v3/bait-groups/BaitGroupPickerButton";
import { BaitGroupAttachCard } from "@/components/admin-v3/bait-groups/BaitGroupAttachCard";
import { baitGroupToken } from "@/lib/bait-group-token";
import type { BaitGroup } from "@/lib/supabase-v4";
import {
  acceptSystemContent,
  acceptSystemText,
  computeRequestState,
  isAcceptSystemMessage,
  PENDING_LOCKED_TEXT,
} from "@/lib/message-requests";
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
  const [bait, setBait] = useState<BaitGroup | null>(null);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Chat đã cutover sang Supabase #3 → RPC quản trị gọi qua db3().
      const rows = await adminThreadMessages(account.id, peerId, 200);
      setMsgs(rows as Msg[]);
      setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 30);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được tin nhắn");
    } finally { setLoading(false); }
  }, [account.id, peerId]);

  useEffect(() => { load(); }, [load]);

  useRealtime(
    `adm-notif-chat-${account.id}-${peerId}`,
    useMemo(() => [{ table: "messages" as const, event: "INSERT" as const }], []),
    useCallback(() => load(), [load]),
  );

  const sendRaw = useCallback(async (body: string, image?: string | null) => {
    setSending(true);
    const token = bait ? baitGroupToken(bait.id) : "";
    const finalBody = token ? (body.trim() ? `${body.trim()}\n${token}` : token) : body;
    try {
      await adminSendMessage(account.id, peerId, finalBody, image ?? null);
      setText("");
      setBait(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gửi thất bại");
    } finally { setSending(false); }
  }, [account.id, peerId, load, bait]);

  // Trạng thái "tin nhắn đang chờ" cho cặp (clone ↔ user).
  const requestState = useMemo(
    () => computeRequestState(msgs as any[], account.id, peerId),
    [msgs, account.id, peerId],
  );
  const myName = account.username || "Người dùng";

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
            if (isAcceptSystemMessage(m.content)) {
              return (
                <div key={m.id} className="text-center text-[11px] text-muted-foreground py-1">
                  {acceptSystemText(m.content)}
                </div>
              );
            }
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

        {showEmoji && !requestState.locked && !requestState.showAccept && (
          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {QUICK_EMOJIS.map((e) => (
              <button key={e} className="admv3-btn admv3-btn-ghost" disabled={sending}
                onClick={() => sendRaw(e)}>{e}</button>
            ))}
          </div>
        )}

        {requestState.showAccept ? (
          <div className="border-t p-3 flex flex-col gap-2 text-center">
            <div className="text-xs text-slate-300">
              Đây là tin nhắn đang chờ. Chấp nhận để trò chuyện không giới hạn.
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-primary text-white font-medium py-2.5 px-4 hover:opacity-90 transition-opacity disabled:opacity-50"
              disabled={sending}
              onClick={() => sendRaw(acceptSystemContent(myName))}
            >
              Chấp nhận trò chuyện
            </button>
          </div>
        ) : requestState.locked ? (
          <div className="border-t p-3 text-center text-xs text-muted-foreground bg-muted">
            {PENDING_LOCKED_TEXT}
          </div>
        ) : (
          <>
            {requestState.note ? (
              <div className="px-3 pt-2 text-[11px] text-muted-foreground">{requestState.note}</div>
            ) : null}
            {bait ? (
              <div className="px-3 pt-2">
                <BaitGroupAttachCard group={bait} onRemove={() => setBait(null)} />
              </div>
            ) : null}
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
              <BaitGroupPickerButton
                iconOnly
                disabled={sending}
                onPick={(_token, group) => setBait(group)}
              />
              <textarea className="admv3-input flex-1" rows={1} value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim() || bait) sendRaw(text.trim());
                  }
                }}
                placeholder="Nhập trả lời…" />
              <button className="admv3-btn" disabled={sending || (!text.trim() && !bait)}
                onClick={() => sendRaw(text.trim())}><Send size={14} /></button>
            </div>

          </>
        )}

      </div>
    </div>
  );
}
