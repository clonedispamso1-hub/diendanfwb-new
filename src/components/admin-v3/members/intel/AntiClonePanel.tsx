/**
 * Anti Clone / Spam — Danh sách thành viên thật + 3 mức xử lý.
 *
 * Dữ liệu lấy từ bảng `profiles` (giống tab "Danh sách"), KHÔNG dùng RPC
 * admin_member_intel. Click vào tài khoản → mở chi tiết với 3 mức xử lý.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Search, RefreshCw, X, Trash2, PhoneOff, ShieldAlert, Unlock } from "lucide-react";
import { toast } from "sonner";
import { avatarSrc } from "@/lib/image-cdn";
import { IntelStyles } from "./intel-styles";
import {
  listAntiCloneMembers,
  listLockedMembers,
  purgeMember,
  restoreMember,
  PURGE_LEVELS,
  type AntiCloneMember,
  type LockedMember,
  type PurgeLevel,
} from "@/lib/anti-clone";
import { fetchLatestDeviceSignal, type DeviceSignalView } from "@/lib/device-intel";
import { markAccountLocked, markAccountUnlocked } from "@/lib/locked-accounts";

const PAGE = 30;
const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString("vi-VN") : "—");
const nf = (n: number) => n.toLocaleString("vi-VN");

export function AntiClonePanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"members" | "locked">("members");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [target, setTarget] = useState<AntiCloneMember | null>(null);

  const membersQ = useQuery({
    queryKey: ["anti-clone-members", term, limit],
    queryFn: () => listAntiCloneMembers({ q: term, limit, offset: 0 }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    enabled: tab === "members",
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["anti-clone-members"] });
    void qc.invalidateQueries({ queryKey: ["anti-clone-locked"] });
  };

  const rows = membersQ.data?.rows ?? [];
  const total = membersQ.data?.total ?? 0;
  const errorMsg = (membersQ.error as any)?.message;

  return (
    <div className="mi-wrap">
      <IntelStyles />

      <div className="mi-bar" style={{ marginBottom: 8 }}>
        <button
          className={`mi-btn ${tab === "members" ? "primary" : ""}`}
          onClick={() => setTab("members")}
        >
          Thành viên
        </button>
        <button
          className={`mi-btn ${tab === "locked" ? "primary" : ""}`}
          onClick={() => setTab("locked")}
        >
          Đã khóa
        </button>
      </div>

      {tab === "locked" ? (
        <LockedTab />
      ) : (
        <>
          <div className="mi-bar">
            <div className="mi-search">
              <Search size={14} />
              <input
                placeholder="Tìm Tên / Username / UID / SĐT…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setLimit(PAGE); setTerm(q); } }}
              />
            </div>
            <button className="mi-btn primary" onClick={() => { setLimit(PAGE); setTerm(q); }}>Tìm</button>
            <button className="mi-btn" onClick={refresh}><RefreshCw size={13} /> Làm mới</button>
          </div>

          {errorMsg ? (
            <div className="mi-empty" style={{ color: "#b91c1c" }}>Không tải được danh sách: {errorMsg}</div>
          ) : (
            <>
              <div className="mi-mini" style={{ marginBottom: 8 }}>
                {membersQ.isFetching ? "Đang tải…" : `${rows.length}/${nf(total)} thành viên thật`}
              </div>

              <div className="mi-cards">
                {rows.map((m) => (
                  <MemberCard key={m.id} m={m} onOpen={() => setTarget(m)} />
                ))}
                {!membersQ.isFetching && rows.length === 0 && (
                  <div className="mi-empty">Không tìm thấy thành viên nào.</div>
                )}
              </div>

              {rows.length < total && (
                <div className="mi-more">
                  <button className="mi-btn" onClick={() => setLimit((l) => l + PAGE)}>Tải thêm</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {target && (
        <MemberPurgeDialog
          member={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}

/** Tab "Đã khóa": click tài khoản → dialog chi tiết, nút Mở khóa nằm trong dialog. */
const LEVEL_TABS = [
  { level: 1 as const, label: "Mức 1", desc: "Khóa tài khoản" },
  { level: 2 as const, label: "Mức 2", desc: "Khóa tài khoản + Blacklist SĐT" },
  { level: 3 as const, label: "Mức 3", desc: "Khóa vĩnh viễn — Cấm toàn bộ" },
];

const levelOf = (m: LockedMember) => (m.ban_level >= 3 ? 3 : m.ban_level === 2 ? 2 : 1);

function LockedTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<LockedMember | null>(null);
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const lockedQ = useQuery({
    queryKey: ["anti-clone-locked", term, limit],
    queryFn: () => listLockedMembers({ q: term, limit, offset: 0 }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const rows = lockedQ.data?.rows ?? [];
  const total = lockedQ.data?.total ?? 0;
  const errorMsg = (lockedQ.error as any)?.message;
  const counts = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
  rows.forEach((m) => { counts[levelOf(m)] += 1; });
  const shown = rows.filter((m) => levelOf(m) === level);

  const refreshLocked = () => {
    void qc.invalidateQueries({ queryKey: ["anti-clone-locked"] });
    void qc.invalidateQueries({ queryKey: ["anti-clone-members"] });
  };

  const unlockRow = async (m: LockedMember) => {
    if (levelOf(m) >= 3) return;
    setUnlocking(m.id);
    try {
      await restoreMember(m.id);
      markAccountUnlocked(m.id);
      toast.success("Đã mở khóa tài khoản.");
      refreshLocked();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setUnlocking(null);
    }
  };

  return (
    <>
      <div className="mi-bar">
        <div className="mi-search">
          <Search size={14} />
          <input
            placeholder="Tìm Tên / UID / SĐT…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setLimit(PAGE); setTerm(q); } }}
          />
        </div>
        <button className="mi-btn primary" onClick={() => { setLimit(PAGE); setTerm(q); }}>Tìm</button>
        <button className="mi-btn" onClick={refreshLocked}>
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      <div className="mi-bar" style={{ marginTop: 8 }}>
        {LEVEL_TABS.map((t) => (
          <button
            key={t.level}
            className={`mi-btn ${level === t.level ? "primary" : ""}`}
            onClick={() => setLevel(t.level)}
            title={t.desc}
          >
            {t.label} · {counts[t.level]}
          </button>
        ))}
      </div>

      {errorMsg ? (
        <div className="mi-empty" style={{ color: "#b91c1c" }}>Không tải được danh sách: {errorMsg}</div>
      ) : (
        <>
          <div className="mi-mini" style={{ marginBottom: 8 }}>
            {lockedQ.isFetching
              ? "Đang tải…"
              : `${LEVEL_TABS.find((t) => t.level === level)?.desc} · ${shown.length} tài khoản (tổng ${nf(total)} đang bị khóa)`}
          </div>

          <div className="mi-cards">
            {shown.map((m) => {
              const name = m.full_name || m.display_name || m.username || "—";
              const lv = levelOf(m);
              return (
                <div
                  key={m.id}
                  className="mi-card"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => setDetail(m)}
                  onKeyDown={(e) => { if (e.key === "Enter") setDetail(m); }}
                >
                  <div className="mi-card-top">
                    {m.avatar
                      ? <img loading="lazy" decoding="async" className="mi-ava" src={avatarSrc(m.avatar, 64)} alt={name} />
                      : <div className="mi-ava" />}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="mi-name">{name}</div>
                      <div className="mi-uname">UID {m.public_id || m.id.slice(0, 8)}</div>
                      <div className="mi-badges">
                        <span className="mi-badge danger">
                          🔒 Mức {lv}
                          {lv >= 3 ? " — Khóa vĩnh viễn" : lv === 2 ? " — Blacklist SĐT" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mi-grid">
                    <div className="mi-cell">SĐT<b>{m.phone || "—"}</b></div>
                    <div className="mi-cell">Thời gian khóa<b>{fmt(m.banned_at)}</b></div>
                    <div className="mi-cell" style={{ gridColumn: "1 / -1" }}>
                      Lý do<b>{m.ban_reason || "—"}</b>
                    </div>
                  </div>

                  <div className="mi-actions" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                    {lv >= 3 ? (
                      <span className="mi-badge danger">Khóa vĩnh viễn — không thể mở khóa</span>
                    ) : (
                      <button
                        className="mi-btn primary"
                        disabled={unlocking === m.id}
                        onClick={() => void unlockRow(m)}
                      >
                        <Unlock size={13} /> {unlocking === m.id ? "Đang mở…" : "Mở khóa"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!lockedQ.isFetching && shown.length === 0 && (
              <div className="mi-empty">Không có tài khoản nào ở mức {level}.</div>
            )}
          </div>

          {rows.length < total && (
            <div className="mi-more">
              <button className="mi-btn" onClick={() => setLimit((l) => l + PAGE)}>Tải thêm</button>
            </div>
          )}
        </>
      )}

      {detail && (
        <LockedDetailDialog
          key={detail.id}
          member={detail}
          onClose={() => setDetail(null)}
          onDone={() => {
            setDetail(null);
            void qc.invalidateQueries({ queryKey: ["anti-clone-locked"] });
            void qc.invalidateQueries({ queryKey: ["anti-clone-members"] });
          }}
        />
      )}
    </>
  );
}

/** Chi tiết tài khoản bị khóa + nút Mở khóa (chỉ tác động đúng tài khoản này). */
function LockedDetailDialog({ member, onClose, onDone }: {
  member: LockedMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const name = member.full_name || member.display_name || member.username || "—";
  const permanent = member.ban_level >= 3;
  const levelText =
    permanent ? "Mức 3 — Khóa vĩnh viễn (Cấm toàn bộ)"
      : member.ban_level === 2 ? "Mức 2 — Blacklist SĐT"
        : "Mức 1 — Khóa tài khoản";

  const unlock = async () => {
    setBusy(true);
    try {
      await restoreMember(member.id);
      // Chỉ mở khóa đúng tài khoản đang chọn — dọn cache + báo cho Home/Hồ sơ/Tìm kiếm.
      markAccountUnlocked(member.id);
      toast.success("Đã mở khóa tài khoản — bài viết hiện lại, gỡ blacklist SĐT/IP/thiết bị.");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="mi-modal" onClick={onClose}>
      <div className="mi-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal-head">
          <div className="mi-modal-title">Chi tiết tài khoản bị khóa</div>
          <button className="mi-btn ghost" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="mi-card-top" style={{ marginBottom: 10 }}>
          {member.avatar
            ? <img className="mi-ava" src={avatarSrc(member.avatar, 96)} alt={name} loading="lazy" decoding="async" />
            : <div className="mi-ava" />}
          <div style={{ minWidth: 0 }}>
            <div className="mi-name">Tài khoản bị khóa</div>
            <div className="mi-uname">{name} · @{member.username || "—"}</div>
            <div className="mi-badges">
              <span className="mi-badge danger">🔒 {levelText}</span>
            </div>
          </div>
        </div>

        <div className="mi-kv">
          <div className="mi-cell">UID<b>{member.public_id || member.id.slice(0, 8)}</b></div>
          <div className="mi-cell">SĐT<b>{member.phone || "—"}</b></div>
          <div className="mi-cell">IP gần nhất<b>{member.ip || "—"}</b></div>
          <div className="mi-cell">Xu<b>{nf(member.xu)}</b></div>
          <div className="mi-cell">Bài viết<b>{nf(member.posts_count)}</b></div>
          <div className="mi-cell">Mức khóa<b>{levelText}</b></div>
          <div className="mi-cell">Thời gian khóa<b>{fmt(member.banned_at)}</b></div>
          <div className="mi-cell" style={{ gridColumn: "1 / -1" }}>
            Lý do<b>{member.ban_reason || "—"}</b>
          </div>
        </div>

        <div className="mi-actions" style={{ marginTop: 12 }}>
          {permanent ? (
            <span className="mi-badge danger">Khóa vĩnh viễn — không thể mở khóa</span>
          ) : (
            <button className="mi-btn primary" disabled={busy} onClick={() => setConfirm(true)}>
              <Unlock size={13} /> {busy ? "Đang mở…" : "Mở khóa"}
            </button>
          )}
          <button className="mi-btn" onClick={onClose}>Đóng</button>
        </div>

        {confirm && (
          <div className="mi-modal" onClick={() => setConfirm(false)}>
            <div className="mi-modal-box" style={{ width: "min(460px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="mi-modal-title" style={{ marginBottom: 8 }}>Xác nhận mở khóa</div>
              <div className="mi-mini" style={{ marginBottom: 12 }}>
                Mở khóa <b>{name}</b> (UID {member.public_id || member.id.slice(0, 8)})?
                Tài khoản sẽ đăng nhập lại được, bài viết hiện lại, SĐT/IP/thiết bị được gỡ chặn.
              </div>
              <div className="mi-actions">
                <button className="mi-btn primary" disabled={busy} onClick={() => void unlock()}>
                  {busy ? "Đang xử lý…" : "Mở khóa"}
                </button>
                <button className="mi-btn" onClick={() => setConfirm(false)}>Hủy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



function MemberCard({ m, onOpen }: { m: AntiCloneMember; onOpen: () => void }) {
  const online = m.last_seen ? Date.now() - new Date(m.last_seen).getTime() < 5 * 60_000 : false;
  const name = m.full_name || m.display_name || m.username || "—";

  return (
    <div className="mi-card" role="button" tabIndex={0} style={{ cursor: "pointer" }}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="mi-card-top">
        {m.avatar
          ? <img loading="lazy" decoding="async" className="mi-ava" src={avatarSrc(m.avatar, 64)} alt={name} />
          : <div className="mi-ava" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mi-name">{name}</div>
          <div className="mi-uname">@{m.username || "—"} · UID {m.public_id || m.id.slice(0, 8)}</div>
          <div className="mi-badges">
            <span className={`mi-badge ${online ? "ok" : "muted"}`}>{online ? "🟢 Online" : "⚪ Offline"}</span>
            {m.is_banned && <span className="mi-badge danger">🔒 Đã khóa</span>}
            {m.ban_level >= 3 && <span className="mi-badge danger">Cấm toàn bộ</span>}
            {m.is_admin && <span className="mi-badge link">Admin</span>}
          </div>
        </div>
      </div>

      <div className="mi-grid">
        <div className="mi-cell">SĐT<b>{m.phone || "—"}</b></div>
        <div className="mi-cell">IP gần nhất<b>{m.ip || "—"}</b></div>
        <div className="mi-cell">Xu<b>{nf(m.xu)}</b></div>
        <div className="mi-cell">Bài viết<b>{nf(m.posts_count)}</b></div>
        <div className="mi-cell">Follow<b>{nf(m.followers_count)} / {nf(m.following_count)}</b></div>
        <div className="mi-cell">Tham gia<b>{fmt(m.created_at)}</b></div>
      </div>
    </div>
  );
}

function MemberPurgeDialog({ member, onClose, onDone }: {
  member: AntiCloneMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const [signal, setSignal] = useState<DeviceSignalView | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<PurgeLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const name = member.full_name || member.display_name || member.username || "—";

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await fetchLatestDeviceSignal(member.id);
        if (alive) setSignal(s);
      } catch { /* dữ liệu thiết bị là tùy chọn */ }
    })();
    return () => { alive = false; };
  }, [member.id]);

  const ip = member.ip || signal?.ip || null;
  const fingerprint = signal?.fingerprint || null;

  const run = async (level: PurgeLevel) => {
    setBusy(true);
    try {
      const res = await purgeMember({
        userId: member.id,
        level,
        reason: reason.trim() || null,
        ip,
        fingerprint,
        cookieId: null,
      });
      const parts = [
        "đã khóa tài khoản",
        res.phone_blacklisted ? "blacklist SĐT" : null,
        res.ip_blocked ? "block IP" : null,
        res.device_blocked ? "block thiết bị" : null,
      ].filter(Boolean);
      toast.success(`Mức ${level}: ${parts.join(" · ")}`);
      markAccountLocked(member.id);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="mi-modal" onClick={onClose}>
      <div className="mi-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal-head">
          <div className="mi-modal-title">Chi tiết & xử lý tài khoản</div>
          <button className="mi-btn ghost" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="mi-card-top" style={{ marginBottom: 10 }}>
          {member.avatar
            ? <img className="mi-ava" src={avatarSrc(member.avatar, 96)} alt={name} loading="lazy" decoding="async" />
            : <div className="mi-ava" />}
          <div style={{ minWidth: 0 }}>
            <div className="mi-name">{name}</div>
            <div className="mi-uname">@{member.username || "—"}</div>
          </div>
        </div>

        <div className="mi-kv">
          <div className="mi-cell">UID<b>{member.public_id || member.id.slice(0, 8)}</b></div>
          <div className="mi-cell">SĐT<b>{member.phone || "—"}</b></div>
          <div className="mi-cell">IP gần nhất<b>{ip || "—"}</b></div>
          <div className="mi-cell">Fingerprint<b>{fingerprint || "—"}</b></div>
          <div className="mi-cell">Xu<b>{nf(member.xu)}</b></div>
          <div className="mi-cell">Bài viết<b>{nf(member.posts_count)}</b></div>
          <div className="mi-cell">Follower<b>{nf(member.followers_count)}</b></div>
          <div className="mi-cell">Đang theo dõi<b>{nf(member.following_count)}</b></div>
          <div className="mi-cell">Tham gia<b>{fmt(member.created_at)}</b></div>
          <div className="mi-cell">Hoạt động<b>{fmt(member.last_seen)}</b></div>
        </div>

        <div className="mi-search" style={{ marginBottom: 10 }}>
          <input placeholder="Lý do xử lý (tuỳ chọn)…" value={reason}
            onChange={(e) => setReason(e.target.value)} />
        </div>

        {member.is_admin && (
          <div className="mi-empty" style={{ color: "#b91c1c", marginBottom: 10 }}>
            Đây là tài khoản Admin — không thể xử lý từ đây.
          </div>
        )}

        <div className="mi-list">
          {([1, 2, 3] as PurgeLevel[]).map((lv) => (
            <div key={lv} className="mi-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{PURGE_LEVELS[lv].title}</div>
              <ul className="mi-mini" style={{ margin: 0, paddingLeft: 16 }}>
                {PURGE_LEVELS[lv].desc.map((d) => <li key={d}>{d}</li>)}
              </ul>
              <button
                className={`mi-btn ${lv === 3 ? "danger" : ""}`}
                disabled={busy || member.is_admin}
                onClick={() => setConfirm(lv)}
              >
                {lv === 1 ? <Trash2 size={13} /> : lv === 2 ? <PhoneOff size={13} /> : <ShieldAlert size={13} />}
                {` Áp dụng mức ${lv}`}
              </button>
            </div>
          ))}
        </div>

        {confirm && (
          <div className="mi-modal" onClick={() => setConfirm(null)}>
            <div className="mi-modal-box" style={{ width: "min(460px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="mi-modal-title" style={{ marginBottom: 8 }}>
                Xác nhận {PURGE_LEVELS[confirm].title}
              </div>
              <div className="mi-mini" style={{ marginBottom: 12 }}>
                Tài khoản <b>{name}</b> ({member.phone || "không có SĐT"}). Hành động này không thể hoàn tác.
              </div>
              <div className="mi-actions">
                <button className="mi-btn danger" disabled={busy} onClick={() => void run(confirm)}>
                  {busy ? "Đang xử lý…" : "Xác nhận"}
                </button>
                <button className="mi-btn" onClick={() => setConfirm(null)}>Hủy</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
