/**
 * BulkGiftTab — ADMIN PANEL V5.1
 * Tặng quà hàng loạt bằng "Tài khoản thứ hai" (clone), có chế độ RANDOM.
 *
 * 1) Chọn nhiều clone (đã loại Admin, chỉ clone có số dư > 0)
 * 2) Người nhận: 👤 Người cụ thể (như cũ) hoặc 🎲 Random N user thật
 * 3) Bài viết: chọn tay hoặc 🎲 Random N bài mới nhất
 * 4) Xu: chia đều / random / cố định / theo %
 * 5) Chạy: delay random, tiến trình, nhật ký, dừng & tiếp tục
 *
 * Backend: RPC admin_internal_gift_post (giữ nguyên) +
 * admin_gift_random_users / admin_gift_recent_posts
 * (supabase/sql/RUN_NOW_admin_bulk_gift_v5_1.sql)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Gift, RefreshCw, Search, Send, Square, CheckSquare, Pause, Play, Shuffle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { GIFT_CATALOG } from "@/components/candy/gift/gift-catalog";
import { fetchAdminUserIds, withoutAdmins } from "@/lib/admin/exclude-admins";
import {
  buildAmounts,
  buildPlan,
  DELAY_PRESETS,
  percentOf,
  randomDelay,
  type DelayKey,
  type GiftTask,
  type PlanClone,
  type PlanPost,
  type SplitMode,
} from "@/lib/admin/bulk-gift-plan";

const sb = supabase as any;

type Clone = PlanClone & { avatar?: string | null };
type PostRow = PlanPost & { created_at?: string | null };

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

const PEOPLE_PRESETS = [5, 10, 20, 30, 50];
const POST_PRESETS = [5, 10, 20, 50, 100];

type RecipientMode = "specific" | "random";

export function BulkGiftTab({ preselected = [] }: { preselected?: string[] }) {
  const [clones, setClones] = useState<Clone[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [postQ, setPostQ] = useState("");
  const [selClones, setSelClones] = useState<string[]>(preselected);

  // Người nhận
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("specific");
  const [peopleCount, setPeopleCount] = useState<number>(10);
  const [postId, setPostId] = useState<string>("");

  // Bài viết random
  const [randomPosts, setRandomPosts] = useState(false);
  const [postCount, setPostCount] = useState<number>(20);

  // Quà & xu
  const [giftKey, setGiftKey] = useState<string>(GIFT_CATALOG[0]?.key ?? "rose");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [totalAmount, setTotalAmount] = useState<number>(100_000);
  const [fixedAmount, setFixedAmount] = useState<number>(GIFT_CATALOG[0]?.amount ?? 1000);
  const [delayKey, setDelayKey] = useState<DelayKey>("1-3");

  // Chạy
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [plan, setPlan] = useState<GiftTask[]>([]);
  const [cursor, setCursor] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [spent, setSpent] = useState(0);
  const [perClone, setPerClone] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState<GiftTask | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [fails, setFails] = useState<string[]>([]);
  const stopRef = useRef(false);
  const batchRef = useRef<string>("");

  const gift = useMemo(
    () => GIFT_CATALOG.find((g) => g.key === giftKey) ?? GIFT_CATALOG[0],
    [giftKey],
  );
  const min = gift?.amount ?? 1000;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_list_internal_accounts", {
        p_search: null, p_limit: 10000, p_offset: 0, p_gender: null,
      });
      if (error) throw error;
      const adminIds = await fetchAdminUserIds();
      const list = withoutAdmins((data ?? []) as Clone[], adminIds).filter(
        (c) => Number(c.gem_balance ?? 0) > 0,
      );
      setClones(list.map((c) => ({ ...c, gem_balance: Number(c.gem_balance ?? 0) })));

      const res = await sb.rpc("admin_internal_gift_posts", { p_limit: 100, p_offset: 0 });
      if (!res.error && res.data) setPosts(res.data as PostRow[]);
      else {
        const { data: p } = await sb
          .from("posts")
          .select("id, user_id, content, created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        setPosts((p ?? []) as PostRow[]);
      }
    } catch (e: any) {
      toast.error(e?.message || "Không tải được dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleClones = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clones;
    return clones.filter(
      (c) => c.username?.toLowerCase().includes(s) || (c.full_name || "").toLowerCase().includes(s),
    );
  }, [clones, q]);

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

  const plannedCount = recipientMode === "random" ? peopleCount : 1;
  const previewAmounts = useMemo(
    () => buildAmounts(plannedCount, mode, totalAmount, fixedAmount, min),
    [plannedCount, mode, totalAmount, fixedAmount, min],
  );
  const previewTotal = previewAmounts.reduce((a, b) => a + b, 0);

  const toggle = (id: string) =>
    setSelClones((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelClones((s) =>
      visibleClones.every((c) => s.includes(c.id))
        ? s.filter((id) => !visibleClones.some((c) => c.id === id))
        : Array.from(new Set([...s, ...visibleClones.map((c) => c.id)])),
    );

  /** Lấy các cặp clone×bài đã tặng trước đó để không tặng trùng. */
  const fetchAlreadyGifted = async (postIds: string[]) => {
    const set = new Set<string>();
    try {
      const { data } = await sb
        .from("admin_gift_batch_log")
        .select("account_id, post_id")
        .in("post_id", postIds.slice(0, 500));
      for (const r of data ?? []) set.add(`${r.account_id}:${r.post_id}`);
    } catch {
      /* bảng log có thể chưa tồn tại — bỏ qua */
    }
    return set;
  };

  const buildTasks = async (): Promise<GiftTask[]> => {
    if (!chosen.length) {
      toast.error("Chọn ít nhất 1 clone gửi quà.");
      return [];
    }

    let candidates: PostRow[] = [];

    if (recipientMode === "specific") {
      if (!postId) {
        toast.error("Chọn bài viết nhận quà.");
        return [];
      }
      const p = posts.find((x) => x.id === postId);
      if (!p) return [];
      candidates = [p];
    } else {
      // 🎲 Random người nhận thật
      const { data: users, error } = await sb.rpc("admin_gift_random_users", {
        p_limit: peopleCount,
      });
      if (error) {
        toast.error(`Cần chạy SQL V5.1: ${error.message}`);
        return [];
      }
      const ids = (users ?? []).map((u: any) => String(u.id));
      if (!ids.length) {
        toast.error("Không tìm được user thật phù hợp.");
        return [];
      }
      const res = await sb.rpc("admin_gift_recent_posts", {
        p_limit: randomPosts ? Math.max(postCount, ids.length) : Math.max(ids.length * 5, 50),
        p_users: ids,
      });
      if (res.error) {
        toast.error(`Cần chạy SQL V5.1: ${res.error.message}`);
        return [];
      }
      candidates = (res.data ?? []) as PostRow[];
      if (randomPosts) candidates = candidates.slice(0, postCount);
    }

    const already = await fetchAlreadyGifted(candidates.map((p) => p.id));
    const built = buildPlan({
      clones: chosen,
      posts: candidates,
      maxGifts: recipientMode === "random" ? peopleCount : 1,
      mode,
      totalAmount,
      fixedAmount,
      minAmount: min,
      alreadyGifted: already,
    });
    if (built.note.length) setLogs((l) => [...l, ...built.note]);
    if (built.skippedPosts > 0) setLogs((l) => [...l, `⏭️ ${built.skippedPosts} bài bị bỏ qua (trùng người nhận).`]);
    if (!built.tasks.length) toast.error("Không tạo được lượt tặng nào — kiểm tra số dư clone / bài viết.");
    return built.tasks;
  };

  const runTasks = async (tasks: GiftTask[], startAt: number) => {
    setRunning(true);
    setPaused(false);
    stopRef.current = false;
    let ok = okCount;
    let used = spent;
    const cloneStats = { ...perClone };
    const failList = [...fails];

    for (let i = startAt; i < tasks.length; i++) {
      if (stopRef.current) {
        setCursor(i);
        setRunning(false);
        setPaused(true);
        setCurrent(null);
        toast.message(`Đã tạm dừng ở ${i}/${tasks.length}.`);
        return;
      }
      const t = tasks[i];
      setCurrent(t);
      try {
        const { data, error } = await sb.rpc("admin_internal_gift_post", {
          p_account: t.cloneId,
          p_post_id: t.postId,
          p_gift_key: giftKey,
          p_amount: t.amount,
          p_idem: `${batchRef.current}:${t.cloneId}:${t.postId}`,
        });
        if (error) throw error;
        if (data?.ok === false) {
          failList.push(`${t.cloneLabel} → ${t.receiverLabel}: ${data.message || data.code}`);
          if (data.code === "INSUFFICIENT_BALANCE") {
            setLogs((l) => [...l, `💸 ${t.cloneLabel} hết xu — bỏ qua clone này.`]);
          }
        } else {
          ok++;
          used += t.amount;
          cloneStats[t.cloneLabel] = (cloneStats[t.cloneLabel] ?? 0) + 1;
          setLogs((l) => [
            ...l,
            `🎁 ${t.cloneLabel} tặng ${fmt(t.amount)} xu cho ${t.receiverLabel} (bài #${t.postId.slice(0, 8)})`,
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
  };

  const start = async () => {
    setLogs([]); setFails([]); setOkCount(0); setSpent(0); setPerClone({}); setCursor(0);
    batchRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tasks = await buildTasks();
    if (!tasks.length) return;
    setPlan(tasks);
    setLogs((l) => [...l, `📋 Kế hoạch: ${tasks.length} lượt tặng, tổng ${fmt(tasks.reduce((a, t) => a + t.amount, 0))} xu.`]);
    await runTasks(tasks, 0);
  };

  const total = plan.length || plannedCount;
  const pct = total ? Math.round((cursor / total) * 100) : 0;
  const emptyClones = new Set(fails.filter((f) => f.includes("không đủ xu") || f.includes("đủ xu")).map((f) => f.split(" →")[0])).size;

  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Gift size={18} />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Tặng quà hàng loạt</h3>
        <span style={{ fontSize: 12, opacity: 0.6 }}>V5.1</span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || running}
          style={{ marginLeft: "auto", ...input, width: "auto", display: "flex", gap: 6, alignItems: "center" }}
        >
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {/* Bước 1 — clone */}
      <div style={box}>
        <strong>1️⃣ Chọn clone gửi quà ({selClones.length}/{visibleClones.length}) — chọn được nhiều</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 11, opacity: 0.5 }} />
            <input
              style={{ ...input, paddingLeft: 30 }}
              placeholder="Tìm tài khoản…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button type="button" style={{ ...input, width: "auto" }} onClick={toggleAll}>
            Chọn tất cả
          </button>
        </div>
        <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 4 }}>
          {visibleClones.map((c) => {
            const on = selClones.includes(c.id);
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
                <span style={{ marginLeft: "auto", fontSize: 12.5 }}>💰 {fmt(Number(c.gem_balance ?? 0))}</span>
              </button>
            );
          })}
          {!visibleClones.length && (
            <div style={{ opacity: 0.6, fontSize: 13, padding: 8 }}>
              {loading ? "Đang tải…" : "Không có tài khoản nào có số dư > 0."}
            </div>
          )}
        </div>
      </div>

      {/* Bước 2 — người nhận */}
      <div style={box}>
        <strong>2️⃣ Người nhận</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={chip(recipientMode === "specific")} onClick={() => setRecipientMode("specific")}>
            👤 Người cụ thể
          </button>
          <button type="button" style={chip(recipientMode === "random")} onClick={() => setRecipientMode("random")}>
            🎲 Random người nhận
          </button>
        </div>

        {recipientMode === "random" ? (
          <>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              Số người nhận (chỉ user thật — loại Admin, clone, tài khoản khóa/ảo bị disable)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {PEOPLE_PRESETS.map((n) => (
                <button key={n} type="button" style={chip(peopleCount === n)} onClick={() => setPeopleCount(n)}>
                  {n}
                </button>
              ))}
              <input
                style={{ ...input, width: 130 }}
                type="number"
                min={1}
                value={peopleCount}
                onChange={(e) => setPeopleCount(Math.max(1, Number(e.target.value) || 1))}
                placeholder="Nhập số"
              />
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 4 }}>
              <input type="checkbox" checked={randomPosts} onChange={(e) => setRandomPosts(e.target.checked)} />
              <Shuffle size={14} /> Random bài mới nhất
            </label>
            {randomPosts && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {POST_PRESETS.map((n) => (
                  <button key={n} type="button" style={chip(postCount === n)} onClick={() => setPostCount(n)}>
                    {n}
                  </button>
                ))}
                <input
                  style={{ ...input, width: 130 }}
                  type="number"
                  min={1}
                  value={postCount}
                  onChange={(e) => setPostCount(Math.max(1, Number(e.target.value) || 1))}
                  placeholder="Nhập số bài"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <input
              style={input}
              placeholder="Tìm bài viết / tác giả…"
              value={postQ}
              onChange={(e) => setPostQ(e.target.value)}
            />
            <div style={{ maxHeight: 200, overflow: "auto", display: "grid", gap: 4 }}>
              {visiblePosts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPostId(p.id)}
                  style={{
                    textAlign: "left", padding: "6px 8px", borderRadius: 8, color: "inherit",
                    background: postId === p.id ? "rgba(120,120,255,0.12)" : "transparent",
                    border: "1px solid rgba(120,120,140,0.18)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {p.author_name || p.author_username || "Bài viết"}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: 12.5 }}>
                    {(p.content || "(không có nội dung)").slice(0, 90)}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bước 3 — quà + chia xu */}
      <div style={box}>
        <strong>3️⃣ Loại quà &amp; cách chia xu</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {GIFT_CATALOG.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => { setGiftKey(g.key); setFixedAmount((a) => Math.max(a, g.amount)); }}
              style={chip(giftKey === g.key)}
            >
              {g.emoji} {g.name} · {fmt(g.amount)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {([
            ["equal", "1. Chia đều"],
            ["random", "2. Random"],
            ["fixed", "3. Cố định"],
            ["percent", "4. Theo %"],
          ] as [SplitMode, string][]).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={chip(mode === m)}>
              {label}
            </button>
          ))}
        </div>

        {mode === "fixed" ? (
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Số xu mỗi lượt tặng (tối thiểu {fmt(min)})</span>
            <input
              style={input}
              type="number"
              min={min}
              value={fixedAmount}
              onChange={(e) => setFixedAmount(Number(e.target.value) || min)}
            />
          </label>
        ) : (
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Tổng số xu muốn tặng</span>
            <input
              style={input}
              type="number"
              min={min}
              value={totalAmount}
              onChange={(e) => setTotalAmount(Number(e.target.value) || min)}
            />
          </label>
        )}

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Dự kiến: <strong>{plannedCount}</strong> lượt · tổng <strong>{fmt(previewTotal)}</strong> xu · {gift?.emoji} {gift?.name}
        </div>
        {mode === "percent" && plannedCount <= 20 && (
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>
            Tỷ lệ mẫu: {percentOf(previewAmounts).map((p) => `${p}%`).join(" · ")}
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

      {/* Bước 4 — chạy */}
      <div style={box}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void start()}
            disabled={running || !chosen.length}
            style={{
              ...input, fontWeight: 800, display: "flex", gap: 8,
              alignItems: "center", justifyContent: "center",
              background: "rgba(120,120,255,0.16)", cursor: running ? "default" : "pointer",
            }}
          >
            <Send size={16} />
            {running ? `Đang tặng… ${cursor}/${plan.length}` : "Bắt đầu tặng quà"}
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
            <div style={{ fontFamily: "monospace" }}>
              {"█".repeat(Math.round(pct / 10)).padEnd(10, "░")} {pct}%
            </div>
            {current && (
              <div style={{ display: "grid", gap: 2 }}>
                <div>Clone: <strong>{current.cloneLabel}</strong></div>
                <div>Đang tặng: <strong>bài #{current.postId.slice(0, 8)}</strong></div>
                <div>Người nhận: <strong>{current.receiverLabel}</strong></div>
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
                <div style={{ opacity: 0.8, marginTop: 4 }}>
                  Tổng: {fmt(spent)} xu · {okCount} quà · {emptyClones} clone lỗi/hết xu
                </div>
              </div>
            )}
            <div style={{ maxHeight: 180, overflow: "auto", opacity: 0.85, display: "grid", gap: 2 }}>
              {logs.slice(-120).map((l, i) => <div key={i}>{l}</div>)}
              {fails.map((f, i) => <div key={`f${i}`} style={{ color: "rgb(240,120,120)" }}>❌ {f}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkGiftTab;
