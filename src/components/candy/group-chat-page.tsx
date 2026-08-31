import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Send,
  Users,
  Image as ImageIcon,
  Settings,
  X,
  Edit3,
  UserMinus,
  VolumeX,
  Volume2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { uploadPublicFile } from "@/lib/db-compat";
import { toast } from "sonner";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";
import { resolveUserName } from "@/lib/user-name";
import { RichText } from "@/lib/rich-content";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import UniversalBadge from "@/components/candy/universal-badge";

interface GroupChatPageProps {
  groupId: string;
  onBack: () => void;
}

interface GroupMsg {
  id: string;
  group_id: string;
  sender_id: string;
  content: string | null;
  image_url?: string | null;
  created_at: string;
}

interface SenderProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
}

interface GroupMemberRow {
  user_id: string;
  role: string;
  joined_at: string;
}

const SOFT_DELETE_LIMIT = 30;
const WARN_AT = 25;
const RENAME_FEE = 500;

/** Mốc thời gian dạng divider — giống hệt chat cá nhân. */
function formatDivider(input?: string | number | Date | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) {
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
    if (diffMin < 1) return "Vừa xong";
    if (diffMin < 60) return `${diffMin} phút trước`;
    return `Hôm nay ${hm}`;
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Hôm qua ${hm}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${hm}`;
}

export function GroupChatPage({ groupId, onBack }: GroupChatPageProps) {
  const { me, refreshMe } = useAuth();
  const [groupName, setGroupName] = useState("Nhóm");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [messages, setMessages] = useState<GroupMsg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SenderProfile>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isOwner = !!me && me.id === ownerId;
  // Chat: chỉ text + GIF + Sticker. Ảnh chỉ dành cho Admin.
  const isMeAdmin = Boolean((me as any)?.is_admin);
  const memberCount = members.length;
  const canChat = isOwner || !isMuted;

  const scrollToBottom = (smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  };

  const GROUP_MESSAGE_COLUMNS =
  "id, group_id, sender_id, content, image_url, created_at, is_archived";

const loadProfilesFor = async (ids: string[]) => {
    const missing = ids.filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province")
      .in("id", missing);
    if (data) {
      setProfiles((prev) => {
        const next = { ...prev };
        for (const p of data as any[]) next[p.id] = p;
        return next;
      });
    }
  };

  const loadAll = async () => {
    const [{ data: g }, { data: mem }, { data: msgs }] = await Promise.all([
      supabase.from("groups" as any).select("id, name, owner_id, is_muted").eq("id", groupId).maybeSingle(),
      supabase
        .from("group_members" as any)
        .select("user_id, role, joined_at")
        .eq("group_id", groupId)
        .is("left_at", null)
        .order("joined_at", { ascending: true }).limit(100),
      supabase
        .from("group_messages" as any)
        .select(GROUP_MESSAGE_COLUMNS)
        .eq("group_id", groupId)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }).limit(50),
    ]);
    if (g) {
      setGroupName((g as any).name);
      setOwnerId((g as any).owner_id);
      setIsMuted(!!(g as any).is_muted);
    }
    const memberRows = (mem as any[]) || [];
    setMembers(memberRows);
    setMessages((msgs as any[]) || []);
    const ids = new Set<string>([
      ...memberRows.map((m) => m.user_id),
      ...((msgs as any[]) || []).map((m) => m.sender_id),
    ]);
    await loadProfilesFor(Array.from(ids));
    scrollToBottom(false);
  };

  useEffect(() => {
    void loadAll();
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const next = payload.new as GroupMsg;
          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
          void loadProfilesFor([next.sender_id]);
          scrollToBottom();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "groups", filter: `id=eq.${groupId}` },
        (payload) => {
          const g = payload.new as any;
          setGroupName(g.name);
          setOwnerId(g.owner_id);
          setIsMuted(!!g.is_muted);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        () => { void loadAll(); },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const send = async () => {
    if (!me || sending) return;
    if (!canChat) {
      alert("Admin đã tắt tính năng nhắn tin.");
      return;
    }
    const content = text.trim();
    if (!content && !imgFile) return;
    setSending(true);
    try {
      let image_url: string | null = null;
      if (imgFile) {
        if (!isMeAdmin) {
          toast.error(
            "Tính năng gửi ảnh chưa được kích hoạt cho tài khoản của bạn. Vui lòng liên hệ Admin nếu cần sử dụng.",
          );
          setImgFile(null);
          return;
        }
        image_url = await uploadPublicFile("messages", imgFile, `group-${groupId}`);
      }
      const payload: any = {
        group_id: groupId,
        sender_id: me.id,
        content: content || "",
        image_url,
      };
      const { error } = await supabase.from("group_messages" as any).insert(payload);
      if (error) {
        alert(`Không gửi được: ${error.message}`);
        return;
      }
      setText("");
      setImgFile(null);
    } catch (e: any) {
      alert(e?.message || "Không gửi được tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  // ===== Admin actions =====
  const doRename = async () => {
    const v = renameValue.trim();
    if (v.length < 2) return alert("Tên nhóm tối thiểu 2 ký tự.");
    if ((me as any)?.candy != null && (me as any).gem_balance < RENAME_FEE) {
      return alert(`Bạn cần ${RENAME_FEE} Coin để đổi tên nhóm.`);
    }
    if (!confirm(`Đổi tên nhóm sẽ tốn ${RENAME_FEE} Coin. Tiếp tục?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("rename_group" as any, { p_group_id: groupId, p_new_name: v });
    setBusy(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("INSUFFICIENT_BALANCE")) return alert("Không đủ Coin (cần 500).");
      if (m.includes("NOT_OWNER")) return alert("Chỉ chủ nhóm được đổi tên.");
      return alert(`Lỗi: ${m}`);
    }
    setRenameOpen(false);
    setGroupName(v);
    void refreshMe();
  };

  const doKick = async (userId: string, name: string) => {
    if (!confirm(`Xóa ${name} khỏi nhóm?`)) return;
    const { error } = await supabase.rpc("kick_group_member" as any, {
      p_group_id: groupId,
      p_user_id: userId,
    });
    if (error) return alert(error.message);
  };

  const doToggleMute = async () => {
    const next = !isMuted;
    const { error } = await supabase.rpc("toggle_group_mute" as any, {
      p_group_id: groupId,
      p_muted: next,
    });
    if (error) return alert(error.message);
    setIsMuted(next);
  };

  const doLeave = async () => {
    const msg = isOwner
      ? "Bạn là Admin. Khi rời nhóm, quyền sẽ chuyển cho người tham gia lâu nhất. Tiếp tục?"
      : "Bạn chắc chắn muốn rời nhóm này?";
    if (!confirm(msg)) return;
    const { error } = await supabase.rpc("leave_group" as any, { p_group_id: groupId });
    if (error) return alert(error.message);
    onBack();
  };

  const activeCount = messages.length;
  const showWarn = activeCount >= WARN_AT && activeCount < SOFT_DELETE_LIMIT;
  const remaining = SOFT_DELETE_LIMIT - activeCount;

  const grouped = useMemo(() => messages, [messages]);
  const previewUrl = useMemo(() => (imgFile ? URL.createObjectURL(imgFile) : ""), [imgFile]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <section className="chat-fixed">
      <div className="chat-fixed-header">
        <button className="icon-button" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div className="chat-fixed-titlewrap">
          <span className="chat-fixed-avatar-wrap">
            <span
              className="bubble-avatar grid place-items-center"
              style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", color: "white" }}
              aria-hidden
            >
              <Users size={16} />
            </span>
          </span>
          <span className="chat-fixed-titletext">
            <span className="chat-fixed-name inline-flex items-center gap-1.5">
              {groupName}
              <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-violet-500/15 text-violet-700 border border-violet-300/40">
                NHÓM
              </span>
              {isMuted ? (
                <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-500/15 text-amber-800 border border-amber-300/40 inline-flex items-center gap-1">
                  <VolumeX size={10} /> Đã tắt chat
                </span>
              ) : null}
            </span>
            <button
              className="chat-fixed-status"
              onClick={() => setShowMembers(true)}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}
            >
              {memberCount} thành viên
            </button>
          </span>
        </div>
        <button
          className="icon-button"
          onClick={() => setShowAdmin(true)}
          aria-label="Cài đặt nhóm"
          title={isOwner ? "Quản lý nhóm" : "Tuỳ chọn"}
        >
          <Settings size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="chat-fixed-scroll">
        {grouped.length === 0 ? <div className="empty-state">Hãy gửi tin nhắn đầu tiên cho nhóm.</div> : null}
        {grouped.map((m, idx) => {
          const isSelf = m.sender_id === me?.id;
          const prev = grouped[idx - 1];
          const curTs = new Date(m.created_at).getTime();
          const prevTs = prev ? new Date(prev.created_at).getTime() : 0;
          const gapMs = prev ? curTs - prevTs : Infinity;
          const showDateDivider = !prev || gapMs >= 10 * 60_000;
          const sameSender = !!prev && prev.sender_id === m.sender_id && curTs - prevTs < 5 * 60_000;
          const showHeader = !sameSender || showDateDivider;
          const sender = profiles[m.sender_id];
          const name = resolveUserName(sender as any, isSelf ? "Bạn" : "Thành viên");
          const avatar = sender?.avatar || "/placeholder.svg";
          const isLastSelf =
            isSelf && !grouped.slice(idx + 1).some((x) => x.sender_id === me?.id);
          return (
            <div key={m.id} id={`group-message-${m.id}`}>
              {showDateDivider ? (
                <div className="chat-time-divider" aria-hidden>
                  <span>{formatDivider(m.created_at)}</span>
                </div>
              ) : null}
              <div
                className={`bubble-row bubble-row-luxe ${isSelf ? "is-self" : ""} ${showHeader ? "" : "is-grouped"}`}
              >
                {!isSelf ? (
                  showHeader ? (
                    <span className="bubble-avatar-btn">
                      <AvatarGlow
                        avatar={avatar}
                        userId={m.sender_id}
                        size={32}
                        alt={name}
                        imgClassName="bubble-avatar"
                      />
                    </span>
                  ) : (
                    <span className="bubble-avatar-spacer" aria-hidden />
                  )
                ) : null}
                <div
                  className="bubble-stack"
                  style={{
                    alignItems: isSelf ? "flex-end" : "flex-start",
                    width: "fit-content",
                    maxWidth: "70%",
                    minWidth: 0,
                  }}
                >
                  {showHeader ? (
                    <div className="bubble-header-luxe">
                      <span className="bubble-name-btn">
                        {name}
                        <CloneVipNameMedia userId={m.sender_id} />
                      </span>
                      <UniversalBadge profile={sender as any} />
                    </div>
                  ) : null}
                  <div className="chat-bubble">
                    {m.image_url ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={m.image_url}
                        alt="ảnh"
                        style={{
                          maxWidth: 240,
                          maxHeight: 320,
                          borderRadius: 12,
                          display: "block",
                          marginBottom: m.content ? 6 : 0,
                        }}
                      />
                    ) : null}
                    {m.content ? (
                      <span className="chat-bubble-text">
                        <RichText text={m.content} gifContext="message" />
                      </span>
                    ) : null}
                  </div>
                </div>
                {isSelf ? (
                  showHeader ? (
                    <span className="bubble-avatar-btn">
                      <AvatarGlow
                        avatar={avatar}
                        userId={m.sender_id}
                        size={32}
                        alt={name}
                        imgClassName="bubble-avatar"
                      />
                    </span>
                  ) : (
                    <span className="bubble-avatar-spacer" aria-hidden />
                  )
                ) : null}
              </div>
              {isLastSelf ? (
                <div className="chat-read-receipt" aria-live="polite">
                  {(m as any).is_read ? (
                    <span className="is-seen">✓✓ Đã xem</span>
                  ) : (
                    <span className="is-sent">✓ Chưa xem</span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {showWarn ? (
        <div className="px-4 py-2 text-[12px] text-center bg-amber-50 text-amber-900 border-t border-amber-200">
          ⚠️ Nhóm sẽ tự dọn dẹp sau {remaining} tin nhắn nữa
        </div>
      ) : null}

      {imgFile && canChat ? (
        <div className="chat-reply-preview">
          <img
            loading="lazy"
            decoding="async"
            src={previewUrl}
            alt=""
            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, flex: "0 0 auto" }}
          />
          <div className="chat-reply-preview-body">
            <span className="chat-reply-preview-name">Ảnh đính kèm</span>
            <span className="chat-reply-preview-text">{imgFile.name}</span>
          </div>
          <button className="chat-reply-preview-close" onClick={() => setImgFile(null)} aria-label="Bỏ ảnh">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="chat-fixed-composer">
        {!canChat ? (
          <div className="app-input chat-input-luxe" style={{ pointerEvents: "none", opacity: 0.7, color: "hsl(var(--muted-foreground))" }}>
            🔇 Admin đã tắt tính năng nhắn tin
          </div>
        ) : (
          <>
            {isMeAdmin ? (
            <label className="chat-composer-icon-btn" title="Gửi ảnh" style={{ cursor: "pointer" }}>
              <ImageIcon size={20} />
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setImgFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            ) : null}
            <input
              className="app-input chat-input-luxe"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={imgFile ? "Thêm chú thích (tuỳ chọn)..." : "Nhập tin nhắn cho nhóm..."}
              onKeyDown={(e) => e.key === "Enter" && void send()}
            />
            <button className="icon-button chat-send-luxe" onClick={() => void send()} aria-label="Gửi" disabled={sending}>
              <Send size={16} />
            </button>
          </>
        )}
      </div>

      {/* Members modal */}
      {showMembers ? (
        <div className="modal-backdrop" onClick={() => setShowMembers(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="section-title inline-flex items-center gap-2">
                <Users size={16} /> Thành viên ({memberCount})
              </h3>
              <button className="icon-button" onClick={() => setShowMembers(false)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body stack-sm" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {members.map((mem) => {
                const p = profiles[mem.user_id];
                const name = resolveUserName(p as any, "Thành viên");
                const isMemOwner = mem.user_id === ownerId;
                const isSelf = me?.id === mem.user_id;
                return (
                  <div key={mem.user_id} className="inline-flex items-center gap-3 w-full" style={{ padding: "6px 0" }}>
                    <img loading="lazy" decoding="async" src={avatarSrc(p?.avatar || "/placeholder.svg", 64)} alt={name} className="avatar-sm" />
                    <div className="flex-1 min-w-0">
                      <div className="row-title truncate inline-flex items-center gap-1">
                        {name}
                        <CloneVipNameMedia userId={mem.user_id} />
                        {isMemOwner ? <ShieldCheck size={12} className="text-amber-600" aria-label="Chủ nhóm" /> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Tham gia {new Date(mem.joined_at).toLocaleDateString("vi-VN")}
                      </div>
                    </div>
                    {isSelf ? (
                      <button
                        className="secondary-cta compact"
                        style={{ color: "hsl(var(--destructive))" }}
                        onClick={() => { setShowMembers(false); void doLeave(); }}
                        title="Rời nhóm"
                      >
                        <LogOut size={14} /> Rời nhóm
                      </button>
                    ) : isOwner && !isMemOwner ? (
                      <button
                        className="secondary-cta compact"
                        style={{ color: "hsl(var(--destructive))" }}
                        onClick={() => void doKick(mem.user_id, name)}
                      >
                        <UserMinus size={14} /> Kick
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Admin / Settings modal */}
      {showAdmin ? (
        <div className="modal-backdrop" onClick={() => setShowAdmin(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3 className="section-title">{isOwner ? "Quản lý nhóm" : "Tuỳ chọn nhóm"}</h3>
              <button className="icon-button" onClick={() => setShowAdmin(false)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body stack-sm">
              {isOwner ? (
                <>
                  <button
                    className="secondary-cta compact w-full justify-start"
                    onClick={() => { setRenameValue(groupName); setRenameOpen(true); setShowAdmin(false); }}
                  >
                    <Edit3 size={14} /> Đổi tên nhóm <span className="ml-auto text-xs text-muted-foreground">{RENAME_FEE} Coin</span>
                  </button>
                  <button className="secondary-cta compact w-full justify-start" onClick={() => void doToggleMute()}>
                    {isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {isMuted ? " Mở chat cho thành viên" : " Tắt chat của thành viên"}
                  </button>
                </>
              ) : null}
              <button
                className="secondary-cta compact w-full justify-start"
                style={{ color: "hsl(var(--destructive))" }}
                onClick={() => { setShowAdmin(false); void doLeave(); }}
              >
                <LogOut size={14} /> Rời nhóm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Rename modal */}
      {renameOpen ? (
        <div className="modal-backdrop" onClick={() => setRenameOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h3 className="section-title">Đổi tên nhóm</h3>
              <button className="icon-button" onClick={() => setRenameOpen(false)} aria-label="Đóng">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body stack-sm">
              <input
                className="app-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Tên nhóm mới"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Phí: <strong>{RENAME_FEE} Coin</strong> · Số dư: <strong>{(me as any)?.candy ?? 0}</strong>
              </p>
              <div className="inline-flex gap-2 justify-end">
                <button className="secondary-cta compact" onClick={() => setRenameOpen(false)} disabled={busy}>
                  Hủy
                </button>
                <button className="primary-cta compact" onClick={() => void doRename()} disabled={busy}>
                  {busy ? "Đang đổi..." : "Xác nhận"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
