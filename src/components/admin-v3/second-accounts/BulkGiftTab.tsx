/**
 * BulkGiftTab — ADMIN PANEL V6
 * Tặng quà hàng loạt bằng "Tài khoản thứ hai" (clone).
 *
 * UI/UX mới (không đổi backend):
 *  1) Chọn clone gửi quà — hiện số dư xu, lọc "còn xu", sắp xếp theo số dư
 *  2) Chọn bài viết nhận quà: mới nhất / 5 / 10 / 20 / toàn bộ / chọn cụ thể
 *  3) Chọn quà giống Website (cùng nguồn GIFT_CATALOG), bấm nhiều lần để tăng
 *     số lượng — tổng xu tự tính realtime, KHÔNG nhập xu thủ công
 *  4) Xem trước đầy đủ trước khi gửi
 *  5) Lịch sử gửi quà (admin_gift_batch_log)
 *
 * Backend giữ nguyên: RPC admin_internal_gift_post / admin_internal_gift_posts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Gift, RefreshCw, Search, Send, Square, CheckSquare, Pause, Play, History, Minus, Eye,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { GIFT_CATALOG } from "@/components/candy/gift/gift-catalog";
import { fetchAdminUserIds, withoutAdmins } from "@/lib/admin/exclude-admins";
import { DELAY_PRESETS, randomDelay, shuffle, type DelayKey, type PlanClone, type PlanPost } from "@/lib/admin/bulk-gift-plan";

const sb = supabase as any;

type Clone = PlanClone & { avatar?: string | null };
type PostRow = PlanPost & { created_at?: string | null };

type GiftTaskV6 = {
  cloneId: string;
  cloneLabel: string;
  postId: string;
  postLabel: string;
  receiverId: string;
  receiverLabel: string;
  giftKey: string;
  giftName: string;
  giftEmoji: string;
  amount: number;
};

type PostMode = "latest1" | "latest5" | "latest10" | "latest20" | "all" | "pick";

const POST_MODES: [PostMode, string][] = [
  ["latest1", "Bài mới nhất"],
  ["latest5", "5 bài mới nhất"],
  ["latest10", "10 bài mới nhất"],
  ["latest20", "20 bài mới nhất"],
  ["all", "Toàn bộ bài viết"],
  ["pick", "Chọn bài cụ thể"],
];

const box: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.28)",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
};
const chip = (on: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(120,120,140,0.3)",
  background: on ? "rgba(120,120,255,0.16)" : "transparent",
  color: "inherit",
  fontWeight: on ? 700 : 500,
  cursor: "pointer",
});
const fmt = (n: number) => n.toLocaleString("vi-VN");
const label = (c: { full_name: string | null; username: string }) => c.full_name || c.username;

export function BulkGiftTab({ preselected = [] }: { preselected?: string[] }) {
  const [clones, setClones] = useState<Clone[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [postQ, setPostQ] = useState("");
  const [selClones, setSelClones] = useState<string[]>(preselected);

  // Lọc & sắp xếp clone theo số dư
  const [onlyWithGems, setOnlyWithGems] = useState(true);
  const [sortBalance, setSortBalance] = useState<"desc" | "asc" | "none">("desc");

  // Bài viết
  const [postMode, setPostMode] = useState<PostMode>("latest5");
  const [pickedPosts, setPickedPosts] = useState<string[]>([]);

  // Giỏ quà: key -> số lượng
  const [cart, setCart] = useState<Record<string, number>>({});
  const [delayKey, setDelayKey] = useState<DelayKey>("1-3");

  // Chạy
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [plan, setPlan] = useState<GiftTaskV6[]>([]);
  const [cursor, setCursor] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [spent, setSpent] = useState(0);
  const [perClone, setPerClone] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState<GiftTaskV6 | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [fails, setFails] = useState<string[]>([]);
  const stopRef = useRef(false);
  const batchRef = useRef<string>("");

  // Lịch sử
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_list_internal_accounts", {
        p_search: null, p_limit: 10000, p_offset: 0, p_gender: null,
      });
      if (error) throw error;
      const adminIds = await fetchAdminUserIds();
      const list = withoutAdmins((data ?? []) as Clone[], adminIds);
      setClones(list.map((c) => ({ ...c, gem_balance: Number(c.gem_balance ?? 0) })));

      const res = await sb.rpc("admin_internal_gift_posts", { p_limit: 200, p_offset: 0 });
      if (!res.error && res.data) setPosts(res.data as PostRow[]);
      else {
        const { data: p } = await sb
          .from("posts")
          .select("id, user_id, content, created_at")
          .order("created_at", { ascending: false })
          .limit(200);
        setPosts((p ?? []) as PostRow[]);
      }
    } catch (e: any) {
      toast.error(e?.message || "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await sb
        .from("admin_gift_batch_log")
        .select("id, account_id, post_id, gift_key, amount, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setHistory(data ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được lịch sử");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { if (historyOpen) void loadHistory(); }, [historyOpen, loadHistory]);

  const visibleClones = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = clones;
    if (onlyWithGems) list = list.filter((c) => Number(c.gem_balance ?? 0) > 0);
    if (s) {
      list = list.filter(
        (c) => c.username?.toLowerCase().includes(s) || (c.full_name || "").toLowerCase().includes(s),
      );
    }
    if (sortBalance !== "none") {
      list = [...list].sort((a, b) =>
        sortBalance === "desc"
          ? Number(b.gem_balance ?? 0) - Number(a.gem_balance ?? 0)
          : Number(a.gem_balance ?? 0) - Number(b.gem_balance ?? 0),
      );
    }
    return list;
  }, [clones, q, onlyWithGems, sortBalance]);

  const visiblePosts = useMemo(() => {
    const s = postQ.trim().toLowerCase();
    if (!s) return posts;
    return posts.filter(
      (p) =>
        (p.content || "").toLowerCase().includes(s) ||
        (p.author_name || "").toLowerCase().includes(s) ||
        (p.author_username || "").toLowerCase().includes(s),
    );
  }, [posts, postQ]);

  const chosen = useMemo(() => clones.filter((c) => selClones.includes(c.id)), [clones, selClones]);

  /** Bài viết mục tiêu theo chế độ đã chọn (posts đã sắp xếp mới nhất trước). */
  const targetPosts = useMemo(() => {
    if (postMode === "pick") return posts.filter((p) => pickedPosts.includes(p.id));
    if (postMode === "all") return posts;
    const n = postMode === "latest1" ? 1 : postMode === "latest5" ? 5 : postMode === "latest10" ? 10 : 20;
    return posts.slice(0, n);
  }, [posts, postMode, pickedPosts]);

  /** Danh sách quà đã chọn theo số lượng. */
  const cartItems = useMemo(
    () =>
      GIFT_CATALOG.filter((g) => (cart[g.key] ?? 0) > 0).map((g) => ({
        gift: g,
        qty: cart[g.key],
        subtotal: g.amount * cart[g.key],
      })),
    [cart],
  );
  const cartQty = cartItems.reduce((a, i) => a + i.qty, 0);
  const cartTotalPerPost = cartItems.reduce((a, i) => a + i.subtotal, 0);
  const grandTotal = cartTotalPerPost * targetPosts.length;
  const totalBalance = chosen.reduce((a, c) => a + Number(c.gem_balance ?? 0), 0);

  const addGift = (key: string) => setCart((c) => ({ ...c, [key]: (c[key] ?? 0) + 1 }));
  const subGift = (key: string) =>
    setCart((c) => {
      const n = (c[key] ?? 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[key]; else next[key] = n;
      return next;
    });

  const toggle = (id: string) =>
    setSelClones((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelClones((s) =>
      visibleClones.every((c) => s.includes(c.id))
        ? s.filter((id) => !visibleClones.some((c) => c.id === id))
        : Array.from(new Set([...s, ...visibleClones.map((c) => c.id)])),
    );
  const togglePost = (id: string) =>
    setPickedPosts((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** Rải quà: mỗi bài × mỗi món quà × số lượng, luân phiên clone còn đủ xu. */
  const buildTasks = (): GiftTaskV6[] => {
    if (!chosen.length) { toast.error("Chọn ít nhất 1 tài khoản gửi quà."); return []; }
    if (!cartItems.length) { toast.error("Chọn ít nhất 1 món quà."); return []; }
    if (!targetPosts.length) { toast.error("Chưa có bài viết nào để tặng."); return []; }

    const wallet = new Map(chosen.map((c) => [c.id, Number(c.gem_balance ?? 0)]));
    const order = shuffle(chosen);
    const tasks: GiftTaskV6[] = [];
    const skipped: string[] = [];
    let cur = 0;

    for (const post of targetPosts) {
      for (const item of cartItems) {
        for (let k = 0; k < item.qty; k++) {
          let picked: Clone | null = null;
          for (let t = 0; t < order.length; t++) {
            const c = order[(cur + t) % order.length];
            if (c.id === post.user_id) continue;
            if ((wallet.get(c.id) ?? 0) < item.gift.amount) continue;
            picked = c;
            cur = (cur + t + 1) % order.length;
            break;
          }
          if (!picked) {
            skipped.push(`${item.gift.emoji} ${item.gift.name} → bài #${post.id.slice(0, 8)} (không clone nào đủ xu)`);
            continue;
          }
          wallet.set(picked.id, (wallet.get(picked.id) ?? 0) - item.gift.amount);
          tasks.push({
            cloneId: picked.id,
            cloneLabel: label(picked),
            postId: post.id,
            postLabel: (post.content || "").slice(0, 60) || `Bài #${post.id.slice(0, 8)}`,
            receiverId: post.user_id,
            receiverLabel: post.author_name || post.author_username || "Người dùng",
            giftKey: item.gift.key,
            giftName: item.gift.name,
            giftEmoji: item.gift.emoji,
            amount: item.gift.amount,
          });
        }
      }
    }
    if (skipped.length) setLogs((l) => [...l, ...skipped.slice(0, 20).map((s) => `⏭️ ${s}`)]);
    if (!tasks.length) toast.error("Không tạo được lượt tặng nào — kiểm tra số dư tài khoản gửi.");
    return tasks;
  };

  const runTasks = async (tasks: GiftTaskV6[], startAt: number) => {
    setRunning(true);
    setPaused(false);
    stopRef.current = false;
    let ok = okCount;
    let used = spent;
    const cloneStats = { ...perClone };
    const failList = [...fails];

    for (let i = startAt; i < tasks.length; i++) {
      if (stopRef.current) {
        setCursor(i); setRunning(false); setPaused(true); setCurrent(null);
        toast.message(`Đã tạm dừng ở ${i}/${tasks.length}.`);
        return;
      }
      const t = tasks[i];
      setCurrent(t);
      try {
        const { data, error } = await sb.rpc("admin_internal_gift_post", {
          p_account: t.cloneId,
          p_post_id: t.postId,
          p_gift_key: t.giftKey,
          p_amount: t.amount,
          p_idem: `${batchRef.current}:${i}:${t.cloneId}:${t.postId}`,
        });
        if (error) throw error;
        if (data?.ok === false) {
          failList.push(`${t.cloneLabel} → ${t.receiverLabel}: ${data.message || data.code}`);
        } else {
          ok++;
          used += t.amount;
          cloneStats[t.cloneLabel] = (cloneStats[t.cloneLabel] ?? 0) + 1;
          setLogs((l) => [
            ...l,
            `${t.giftEmoji} ${t.cloneLabel} tặng ${t.giftName} (${fmt(t.amount)} xu) cho ${t.receiverLabel} — bài #${t.postId.slice(0, 8)}`,
          ]);
        }
      } catch (e: any) {
        failList.push(`${t.cloneLabel} → ${t.receiverLabel}: ${e?.message || "lỗi"}`);
      }

      setCursor(i + 1);
      setOkCount(ok);
      setSpent(used);
      setPerClone({ ...cloneStats });
      setFails([...failList]);

      if (i < tasks.length - 1) await new Promise((r) => setTimeout(r, randomDelay(delayKey)));
    }

    setRunning(false);
    setCurrent(null);
    toast[failList.length ? "warning" : "success"](
      `Xong: ${ok}/${tasks.length} quà · ${fmt(used)} xu${failList.length ? ` · ${failList.length} lỗi` : ""}.`,
    );
    void load();
    if (historyOpen) void loadHistory();
  };

  const start = async () => {
    setLogs([]); setFails([]); setOkCount(0); setSpent(0); setPerClone({}); setCursor(0);
    batchRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tasks = buildTasks();
    if (!tasks.length) return;
    setPlan(tasks);
    setLogs((l) => [...l, `📋 Kế hoạch: ${tasks.length} lượt tặng · tổng ${fmt(tasks.reduce((a, t) => a + t.amount, 0))} xu.`]);
    await runTasks(tasks, 0);
  };

  const total = plan.length || cartQty * targetPosts.length;
  const pct = total ? Math.round((cursor / total) * 100) : 0;
  const enough = totalBalance >= grandTotal;

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Gift size={18} />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Tặng quà hàng loạt</h3>
        <span style={{ fontSize: 12, opacity: 0.6 }}>V6</span>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          style={{ marginLeft: "auto", ...input, width: "auto", display: "flex", gap: 6, alignItems: "center" }}
        >
          <History size={14} /> Lịch sử
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || running}
          style={{ ...input, width: "auto", display: "flex", gap: 6, alignItems: "center" }}
        >
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {/* Bước 1 — clone */}
      <div style={box}>
        <strong>1️⃣ Tài khoản gửi quà ({selClones.length}/{visibleClones.length})</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 11, opacity: 0.5 }} />
            <input
              style={{ ...input, paddingLeft: 30 }}
              placeholder="Tìm tài khoản…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button type="button" style={chip(onlyWithGems)} onClick={() => setOnlyWithGems((v) => !v)}>
            💰 Chỉ tài khoản còn xu
          </button>
          <button
            type="button"
            style={chip(sortBalance !== "none")}
            onClick={() => setSortBalance((s) => (s === "desc" ? "asc" : s === "asc" ? "none" : "desc"))}
          >
            Số dư {sortBalance === "desc" ? "↓ nhiều → ít" : sortBalance === "asc" ? "↑ ít → nhiều" : "· mặc định"}
          </button>
          <button type="button" style={{ ...input, width: "auto" }} onClick={toggleAll}>
            Chọn tất cả
          </button>
        </div>
        <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 4 }}>
          {visibleClones.map((c) => {
            const on = selClones.includes(c.id);
            const bal = Number(c.gem_balance ?? 0);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  borderRadius: 8, textAlign: "left", color: "inherit",
                  background: on ? "rgba(120,120,255,0.12)" : "transparent",
                  border: "1px solid rgba(120,120,140,0.18)",
                }}
              >
                {on ? <CheckSquare size={15} /> : <Square size={15} />}
                <span style={{ fontWeight: 600 }}>{c.full_name || c.username}</span>
                <span style={{ opacity: 0.6, fontSize: 12 }}>@{c.username}</span>
                <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, opacity: bal > 0 ? 1 : 0.5 }}>
                  💰 {fmt(bal)} xu
                </span>
              </button>
            );
          })}
          {!visibleClones.length && (
            <div style={{ opacity: 0.6, fontSize: 13, padding: 8 }}>
              {loading ? "Đang tải…" : "Không có tài khoản phù hợp."}
            </div>
          )}
        </div>
        {chosen.length > 0 && (
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Tổng số dư đã chọn: <strong>{fmt(totalBalance)}</strong> xu
          </div>
        )}
      </div>

      {/* Bước 2 — bài viết */}
      <div style={box}>
        <strong>2️⃣ Bài viết nhận quà</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {POST_MODES.map(([m, lbl]) => (
            <button key={m} type="button" style={chip(postMode === m)} onClick={() => setPostMode(m)}>
              {lbl}
            </button>
          ))}
        </div>

        {postMode === "pick" && (
          <>
            <input
              style={input}
              placeholder="Tìm bài viết / tác giả…"
              value={postQ}
              onChange={(e) => setPostQ(e.target.value)}
            />
            <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 4 }}>
              {visiblePosts.map((p) => {
                const on = pickedPosts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePost(p.id)}
                    style={{
                      textAlign: "left", padding: "6px 8px", borderRadius: 8, color: "inherit",
                      background: on ? "rgba(120,120,255,0.12)" : "transparent",
                      border: "1px solid rgba(120,120,140,0.18)",
                      display: "flex", gap: 8, alignItems: "flex-start",
                    }}
                  >
                    {on ? <CheckSquare size={15} /> : <Square size={15} />}
                    <span style={{ display: "grid", gap: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {p.author_name || p.author_username || "Bài viết"}
                      </span>
                      <span style={{ opacity: 0.7, fontSize: 12.5 }}>
                        {(p.content || "(không có nội dung)").slice(0, 90)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Đang chọn <strong>{targetPosts.length}</strong> bài viết.
        </div>
      </div>

      {/* Bước 3 — quà (giống Website) */}
      <div style={box}>
        <strong>3️⃣ Chọn quà (bấm nhiều lần để tăng số lượng)</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {GIFT_CATALOG.map((g) => {
            const qty = cart[g.key] ?? 0;
            return (
              <div
                key={g.key}
                role="button"
                tabIndex={0}
                onClick={() => addGift(g.key)}
                onKeyDown={(e) => e.key === "Enter" && addGift(g.key)}
                style={{
                  position: "relative", cursor: "pointer", userSelect: "none",
                  border: `1px solid ${qty ? "rgba(140,120,255,0.7)" : "rgba(120,120,140,0.28)"}`,
                  borderRadius: 14, padding: "12px 10px", display: "grid", gap: 4,
                  justifyItems: "center", textAlign: "center",
                  background: qty ? "rgba(120,120,255,0.12)" : "transparent",
                  boxShadow: qty ? `0 0 0 1px ${g.glow}` : "none",
                }}
              >
                <div style={{ fontSize: 28, lineHeight: 1 }}>{g.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{fmt(g.amount)} xu</div>
                {qty > 0 && (
                  <>
                    <span
                      style={{
                        position: "absolute", top: 6, right: 8, fontWeight: 800, fontSize: 12.5,
                        background: "rgba(120,120,255,0.28)", borderRadius: 999, padding: "1px 8px",
                      }}
                    >
                      ×{qty}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); subGift(g.key); }}
                      title="Giảm 1"
                      style={{
                        position: "absolute", top: 4, left: 6, background: "transparent",
                        border: "1px solid rgba(120,120,140,0.35)", borderRadius: 999,
                        color: "inherit", lineHeight: 0, padding: 4, cursor: "pointer",
                      }}
                    >
                      <Minus size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {cartItems.length > 0 && (
          <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <div>
              {cartItems.map((i) => `${i.gift.emoji} ${i.gift.name} ×${i.qty}`).join(" · ")}
            </div>
            <div>
              Mỗi bài: <strong>{fmt(cartTotalPerPost)}</strong> xu · Tổng cộng{" "}
              <strong>{fmt(grandTotal)}</strong> xu cho {targetPosts.length} bài
            </div>
            <button type="button" style={{ ...input, width: "auto" }} onClick={() => setCart({})}>
              Xoá giỏ quà
            </button>
          </div>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13 }}>⏱️ Delay giữa các lượt (giống người thật)</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DELAY_PRESETS.map((d) => (
              <button key={d.key} type="button" style={chip(delayKey === d.key)} onClick={() => setDelayKey(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bước 4 — xem trước */}
      <div style={box}>
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Eye size={15} /> 4️⃣ Xem trước trước khi gửi
        </strong>
        {!chosen.length || !cartItems.length || !targetPosts.length ? (
          <div style={{ opacity: 0.65, fontSize: 13 }}>
            Chọn tài khoản gửi, bài viết và quà để xem trước.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
            <div>
              👤 <b>Tài khoản gửi ({chosen.length}):</b>{" "}
              {chosen.slice(0, 6).map((c) => `${label(c)} (${fmt(Number(c.gem_balance ?? 0))} xu)`).join(", ")}
              {chosen.length > 6 ? ` … +${chosen.length - 6}` : ""}
            </div>
            <div>
              🎯 <b>Người nhận ({new Set(targetPosts.map((p) => p.user_id)).size}):</b>{" "}
              {Array.from(new Set(targetPosts.map((p) => p.author_name || p.author_username || "Người dùng")))
                .slice(0, 8).join(", ")}
            </div>
            <div>
              📝 <b>Bài viết ({targetPosts.length}):</b>{" "}
              {targetPosts.slice(0, 4).map((p) => `#${p.id.slice(0, 8)}`).join(", ")}
              {targetPosts.length > 4 ? ` … +${targetPosts.length - 4}` : ""}
            </div>
            <div>
              🎁 <b>Quà:</b> {cartItems.map((i) => `${i.gift.emoji} ${i.gift.name} ×${i.qty} = ${fmt(i.subtotal)} xu`).join(" · ")}
            </div>
            <div>
              💰 <b>Tổng xu:</b> {fmt(grandTotal)} xu · <b>Số lượt:</b> {cartQty * targetPosts.length}
            </div>
            <div style={{ color: enough ? "rgb(110,190,130)" : "rgb(240,150,120)" }}>
              {enough
                ? "✅ Số dư các tài khoản gửi đủ cho kế hoạch này."
                : `⚠️ Số dư đang thiếu ${fmt(grandTotal - totalBalance)} xu — hệ thống sẽ bỏ qua các lượt không đủ xu.`}
            </div>
          </div>
        )}
      </div>

      {/* Bước 5 — chạy */}
      <div style={box}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void start()}
            disabled={running || !chosen.length || !cartItems.length || !targetPosts.length}
            style={{
              ...input, fontWeight: 800, display: "flex", gap: 8,
              alignItems: "center", justifyContent: "center",
              background: "rgba(120,120,255,0.16)", cursor: running ? "default" : "pointer",
            }}
          >
            <Send size={16} />
            {running ? `Đang tặng… ${cursor}/${plan.length}` : "Xác nhận & gửi quà"}
          </button>

          {running && (
            <button
              type="button"
              onClick={() => { stopRef.current = true; }}
              style={{ ...input, width: "auto", display: "flex", gap: 6, alignItems: "center" }}
            >
              <Pause size={15} /> Dừng
            </button>
          )}
          {!running && paused && cursor < plan.length && (
            <button
              type="button"
              onClick={() => void runTasks(plan, cursor)}
              style={{ ...input, width: "auto", display: "flex", gap: 6, alignItems: "center" }}
            >
              <Play size={15} /> Tiếp tục ({cursor}/{plan.length})
            </button>
          )}
        </div>

        {(running || cursor > 0) && (
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(120,120,140,0.2)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%", width: `${pct}%`,
                  background: "linear-gradient(90deg, rgba(120,120,255,0.9), rgba(180,120,255,0.9))",
                  transition: "width .25s",
                }}
              />
            </div>
            {current && (
              <div style={{ display: "grid", gap: 2 }}>
                <div>Tài khoản gửi: <strong>{current.cloneLabel}</strong></div>
                <div>Quà: <strong>{current.giftEmoji} {current.giftName}</strong> ({fmt(current.amount)} xu)</div>
                <div>Người nhận: <strong>{current.receiverLabel}</strong> — bài #{current.postId.slice(0, 8)}</div>
              </div>
            )}
            <div>
              Đã tặng: <strong>{cursor} / {plan.length}</strong> · ✅ {okCount} · ❌ {fails.length} · 💰 {fmt(spent)} xu
            </div>
          </div>
        )}

        {(logs.length > 0 || Object.keys(perClone).length > 0) && (
          <div style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
            <strong>📒 Nhật ký</strong>
            {Object.keys(perClone).length > 0 && (
              <div style={{ display: "grid", gap: 2 }}>
                {Object.entries(perClone).map(([name, n]) => (
                  <div key={name}>• {name} → {n} quà</div>
                ))}
                <div style={{ opacity: 0.8, marginTop: 4 }}>Tổng: {fmt(spent)} xu · {okCount} quà</div>
              </div>
            )}
            <div style={{ maxHeight: 180, overflow: "auto", opacity: 0.85, display: "grid", gap: 2 }}>
              {logs.slice(-120).map((l, i) => <div key={i}>{l}</div>)}
              {fails.map((f, i) => <div key={`f${i}`} style={{ color: "rgb(240,120,120)" }}>❌ {f}</div>)}
            </div>
          </div>
        )}
      </div>

      {/* Lịch sử gửi quà */}
      {historyOpen && (
        <div style={box}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>📚 Lịch sử gửi quà</strong>
            <button
              type="button"
              onClick={() => void loadHistory()}
              style={{ marginLeft: "auto", ...input, width: "auto", display: "flex", gap: 6, alignItems: "center" }}
            >
              <RefreshCw size={13} /> Làm mới
            </button>
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", display: "grid", gap: 4, fontSize: 12.5 }}>
            {historyLoading && <div style={{ opacity: 0.6 }}>Đang tải…</div>}
            {!historyLoading && !history.length && <div style={{ opacity: 0.6 }}>Chưa có lịch sử.</div>}
            {history.map((h) => {
              const g = GIFT_CATALOG.find((x) => x.key === h.gift_key);
              const sender = clones.find((c) => c.id === h.account_id);
              const post = posts.find((p) => p.id === h.post_id);
              return (
                <div
                  key={h.id}
                  style={{
                    display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
                    padding: "6px 8px", borderRadius: 8,
                    border: "1px solid rgba(120,120,140,0.18)",
                  }}
                >
                  <span>{g?.emoji ?? "🎁"} <b>{g?.name ?? h.gift_key}</b></span>
                  <span>· {fmt(Number(h.amount ?? 0))} xu</span>
                  <span>· Gửi: <b>{sender ? label(sender) : String(h.account_id).slice(0, 8)}</b></span>
                  <span>· Nhận: <b>{post?.author_name || post?.author_username || "—"}</b></span>
                  <span>· Bài #{String(h.post_id).slice(0, 8)}</span>
                  <span style={{ marginLeft: "auto", opacity: 0.7 }}>
                    {new Date(h.created_at).toLocaleString("vi-VN")} · ✅ Thành công
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
