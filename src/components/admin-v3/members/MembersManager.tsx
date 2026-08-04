import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, Download, RefreshCw, ShieldCheck, ShieldOff, Ban, Unlock, Filter,
  Eye, X, RotateCcw, ImageOff, KeyRound, Fingerprint, Wifi, ShieldAlert,
  Trash2, MessageSquare, Activity, Gift, Lock, User as UserIcon, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { RestrictionPanel } from "./RestrictionPanel";
import { DeviceDirectory } from "./DeviceDirectory";
import { restrictionsService } from "@/services/restrictions.service";

import { isRecentlyActive } from "@/components/candy/presence-status";

type MemberRow = {
  id: string;
  public_id: string | null;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  phone: string | null;
  created_at: string | null;
  last_seen: string | null;
  is_online: boolean | null;
  is_admin: boolean | null;
  is_banned: boolean | null;
  banned_until: string | null;
  role: string | null;
  followers_count: number | null;
};

type DeviceInfo = { fingerprint: string | null; ip: string | null; user_agent: string | null; created_at: string | null };
type MemberEx = MemberRow & {
  posts_count: number;
  following_count: number;
  device?: DeviceInfo | null;
};

type StatusFilter = "all" | "admin" | "user" | "active" | "banned" | "violation";
type TimeFilter =
  | "any" | "today" | "yesterday" | "thisWeek" | "lastWeek"
  | "thisMonth" | "lastMonth" | "thisYear" | "range";

const PAGE_SIZE = 50;

export function MembersManager() {
  const [tab, setTab] = useState<"list" | "devices">("list");
  const [rows, setRows] = useState<MemberEx[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("any");
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewing, setViewing] = useState<MemberEx | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [violations, setViolations] = useState<Map<string, number>>(new Map());
  const [ipDup, setIpDup] = useState<Map<string, { ip: string; count: number }>>(new Map());
  const [ipDrillIp, setIpDrillIp] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<MemberEx | null>(null);
  const [bulkOpen, setBulkOpen] = useState<null | "ban" | "delete">(null);
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);


  // ---- Drag-select checkbox: click + kéo để chọn nhiều dòng ----
  const dragRef = useRef<{ active: boolean; mode: "add" | "remove"; seen: Set<string> } | null>(null);
  const beginDrag = (id: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const willAdd = !selected.has(id);
    dragRef.current = { active: true, mode: willAdd ? "add" : "remove", seen: new Set([id]) };
    setSelected((s) => {
      const n = new Set(s);
      if (willAdd) n.add(id); else n.delete(id);
      return n;
    });
  };
  const enterDrag = (id: string) => {
    const d = dragRef.current;
    if (!d?.active || d.seen.has(id)) return;
    d.seen.add(id);
    setSelected((s) => {
      const n = new Set(s);
      if (d.mode === "add") n.add(id); else n.delete(id);
      return n;
    });
  };
  useEffect(() => {
    const stop = () => { if (dragRef.current) dragRef.current.active = false; };
    window.addEventListener("mouseup", stop);
    window.addEventListener("mouseleave", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("mouseleave", stop);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tr = computeTimeRange(timeFilter, rangeFrom, rangeTo);
      const { data, error } = await (supabase as any).rpc("admin_list_members", {
        p_q: q.trim() || null,
        p_status: status,
        p_from: tr.from ?? null,
        p_to: tr.to ?? null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;

      const list = (data ?? []) as any[];
      const vioMap = new Map<string, number>();
      list.forEach((r) => vioMap.set(r.id, Number(r.violation_count ?? 0)));
      setViolations(vioMap);

      setRows(
        list.map((r) => ({
          id: r.id,
          public_id: r.public_id,
          full_name: r.full_name,
          username: r.username,
          avatar: r.avatar,
          phone: r.phone,
          created_at: r.created_at,
          last_seen: r.last_seen,
          is_online: r.is_online,
          is_admin: r.is_admin,
          is_banned: r.is_banned,
          banned_until: r.banned_until,
          role: r.role,
          followers_count: r.followers_count,
          posts_count: Number(r.posts_count ?? 0),
          following_count: Number(r.following_count ?? 0),
          device: r.fingerprint || r.ip || r.user_agent
            ? { fingerprint: r.fingerprint ?? null, ip: r.ip ?? null, user_agent: r.user_agent ?? null, created_at: null }
            : null,
        })),
      );
      setTotal(Number(list[0]?.total_count ?? 0));

      // IP duplicate counts for the IP column badge.
      const ids = list.map((r) => r.id);
      if (ids.length) {
        (supabase as any).rpc("admin_ip_duplicate_counts", { _user_ids: ids })
          .then(({ data: dupData }: any) => {
            const m = new Map<string, { ip: string; count: number }>();
            (dupData ?? []).forEach((d: any) =>
              m.set(d.user_id, { ip: d.latest_ip, count: Number(d.dup_count ?? 1) }));
            setIpDup(m);
          }).catch(() => {});
      } else {
        setIpDup(new Map());
      }
    } catch (e: any) {
      toast.error("Không tải được danh sách: " + (e?.message || e));
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, status, timeFilter, rangeFrom, rangeTo, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAdmin = async (u: MemberEx) => {
    setPromoteTarget(u);
  };

  const [banTarget, setBanTarget] = useState<MemberEx | null>(null);
  // Tách rõ 2 chức năng: Xoá vĩnh viễn (chỉ dữ liệu) vs Block IP (blacklist).
  const [blockIpTarget, setBlockIpTarget] = useState<MemberEx | null>(null);
  const [deleteDataTarget, setDeleteDataTarget] = useState<MemberEx | null>(null);

  const unlockUser = async (u: MemberEx) => {
    const { error } = await (supabase.from("profiles") as any)
      .update({ is_banned: false, banned_until: null })
      .eq("id", u.id);
    if (error) return toast.error(error.message);
    await (supabase as any).rpc("admin_unblock_user_devices", { p_user_id: u.id }).catch(() => {});
    toast.success("Đã mở khóa (kể cả IP/Device)");
    setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, is_banned: false, banned_until: null } : r)));
  };

  const confirmBan = async (u: MemberEx, opts: { days: number; blockIp: boolean; blockDevice: boolean }) => {
    const banned_until = opts.days > 0 ? new Date(Date.now() + opts.days * 86400_000).toISOString() : null;
    const { error } = await (supabase.from("profiles") as any)
      .update({ is_banned: true, banned_until })
      .eq("id", u.id);
    if (error) return toast.error(error.message);
    if (opts.blockIp || opts.blockDevice) {
      const { error: e2 } = await (supabase as any).rpc("admin_block_device", {
        p_user_id: u.id,
        p_block_ip: opts.blockIp,
        p_block_device: opts.blockDevice,
        p_reason: "admin_ban",
      });
      if (e2) toast.warning("Đã khóa tài khoản, nhưng khóa IP/Device lỗi: " + e2.message);
      else toast.success("Đã khóa tài khoản + IP/Device");
    } else {
      toast.success("Đã khóa tài khoản");
    }
    setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, is_banned: true, banned_until } : r)));
  };

  const toggleBan = async (u: MemberEx) => {
    if (u.is_banned) return unlockUser(u);
    setBanTarget(u);
  };

  const permanentBan = async (u: MemberEx) => {
    const reason = window.prompt(
      `Cấm VĨNH VIỄN @${u.username || u.id.slice(0, 6)}?\n\n` +
      `Hệ thống sẽ:\n` +
      `• Khoá tài khoản vĩnh viễn\n` +
      `• Đăng xuất tất cả phiên\n` +
      `• Blacklist toàn bộ Device Fingerprint & IP đã dùng\n` +
      `• Blacklist số điện thoại${u.phone ? ` (${u.phone})` : ""}\n\n` +
      `Nhập LÝ DO (bắt buộc):`,
      "",
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) return toast.error("Cần nhập lý do cấm.");
    try {
      const res = await restrictionsService.permanentBan(u.id, trimmed);
      toast.success(
        `Đã cấm vĩnh viễn · ${res.devices_blocked} device/IP · ${res.phone_blocked} SĐT`,
      );
      setRows((rs) => rs.map((r) => (r.id === u.id
        ? { ...r, is_banned: true, banned_until: null }
        : r)));
    } catch (e: any) {
      toast.error("Cấm vĩnh viễn lỗi: " + (e?.message || e));
    }
  };

  /** XOÁ VĨNH VIỄN: chỉ xoá dữ liệu, KHÔNG blacklist → SĐT cũ đăng ký lại được. */
  const deleteUserData = async (u: MemberEx) => {
    const { error } = await (supabase as any).rpc("admin_delete_user_data", { p_user_id: u.id });
    if (error) throw new Error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== u.id));
  };

  /** BLOCK IP: giữ dữ liệu, chuyển trạng thái block + blacklist IP/Device/SĐT. */
  const blockUserIp = async (u: MemberEx, code: string, reason: string) => {
    const { data, error } = await (supabase as any).rpc("admin_block_user_ip", {
      p_user_id: u.id, p_code: code, p_reason: reason || null,
    });
    if (error) throw new Error(error.message);
    setRows((rs) => rs.map((r) => (r.id === u.id ? { ...r, is_banned: true, banned_until: null } : r)));
    return data as { devices_blocked?: number; phone_blocked?: number } | null;
  };

  const exportCSV = () => {
    const header = [
      "UID", "public_id", "full_name", "username", "phone",
      "created_at", "last_seen", "is_admin", "is_banned",
      "posts_count", "followers_count", "following_count",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.id, r.public_id ?? "", r.full_name ?? "", r.username ?? "",
          r.phone ?? "", r.created_at ?? "", r.last_seen ?? "",
          r.is_admin ? "1" : "0", r.is_banned ? "1" : "0",
          r.posts_count, r.followers_count ?? 0, r.following_count,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const bulkExportCSV = () => {
    if (!someSelected) return exportCSV();
    downloadCSV(rows.filter((r) => selected.has(r.id)));
  };
  const bulkUnlock = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(`Mở khóa ${ids.length} tài khoản?`)) return;
    const { error } = await (supabase as any).rpc("admin_bulk_unlock", { p_user_ids: ids });
    if (error) return toast.error(error.message);
    toast.success(`Đã mở khóa ${ids.length}`);
    setSelected(new Set()); void load();
  };
  const bulkGrant = async (grant: boolean) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!window.confirm(`${grant ? "Cấp" : "Thu hồi"} Admin cho ${ids.length} tài khoản?`)) return;
    const { error } = await (supabase.from("profiles") as any)
      .update({ is_admin: grant }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Đã cập nhật quyền");
    setSelected(new Set()); void load();
  };

  if (tab === "devices") {
    return (
      <div className="admv3-page">
        <div className="admv3-page-head">
          <div>
            <h2 className="admv3-page-title">Quản lý thành viên</h2>
            <p className="admv3-page-sub">Địa chỉ máy · phát hiện clone/spam theo IP & Fingerprint.</p>
          </div>
        </div>
        <div className="admv3-filters" style={{ marginBottom: 12 }}>
          <button className="admv3-chip" onClick={() => setTab("list")}>Danh sách</button>
          <button className="admv3-chip is-active">Địa chỉ máy</button>
        </div>
        <DeviceDirectory />
        <MembersManagerStyles />
      </div>
    );
  }

  return (
    <div className="admv3-page">
      <div className="admv3-page-head">
        <div>
          <h2 className="admv3-page-title">Quản lý thành viên</h2>
          <p className="admv3-page-sub">Tìm kiếm, lọc, xử lý vi phạm & xuất CSV.</p>
        </div>
      </div>

      <div className="admv3-filters" style={{ marginBottom: 10 }}>
        <button className="admv3-chip is-active">Danh sách</button>
        <button className="admv3-chip" onClick={() => setTab("devices")}>Địa chỉ máy</button>
      </div>

      <div className="admv3-toolbar">
        <div className="admv3-search admv3-search-lg">
          <Search size={14} />
          <input
            placeholder="Tìm theo UID / Username / Tên / SĐT…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(0), load())}
          />
        </div>
        <div className="admv3-filters">
          <Filter size={13} className="admv3-filter-ico" />
          {(
            [
              ["all", "Tất cả"],
              ["admin", "Admin"],
              ["user", "User"],
              ["active", "Đang hoạt động"],
              ["banned", "Đã khóa"],
              ["violation", "Vi phạm"],
            ] as [StatusFilter, string][]
          ).map(([k, lbl]) => (
            <button
              key={k}
              className={`admv3-chip ${status === k ? "is-active" : ""}`}
              onClick={() => { setStatus(k); setPage(0); }}
            >
              {lbl}
            </button>
          ))}
          <select
            className="admv3-chip admv3-time-select"
            value={timeFilter}
            onChange={(e) => { setTimeFilter(e.target.value as TimeFilter); setPage(0); }}
            title="Tài khoản mới (tối đa 2 tuần gần nhất)"
          >
            <option value="any">Tài khoản mới: Tất cả</option>
            <option value="today">Hôm nay</option>
            <option value="yesterday">Hôm qua</option>
            <option value="thisWeek">Tuần này (T2→CN)</option>
            <option value="lastWeek">Tuần trước</option>
            <option value="thisMonth">Tháng này</option>
            <option value="lastMonth">Tháng trước</option>
            <option value="thisYear">Năm nay</option>
            <option value="range">Khoảng thời gian…</option>
          </select>
          {timeFilter === "range" && (
            <>
              <input type="date" className="admv3-chip admv3-date-input"
                value={rangeFrom} onChange={(e) => { setRangeFrom(e.target.value); setPage(0); }} />
              <input type="date" className="admv3-chip admv3-date-input"
                value={rangeTo} onChange={(e) => { setRangeTo(e.target.value); setPage(0); }} />
            </>
          )}
        </div>

        <div className="admv3-toolbar-right">
          <button className="admv3-btn admv3-btn-ghost" onClick={() => load()} disabled={loading}>
            <RefreshCw size={13} /> Tải lại
          </button>
          <button className="admv3-btn admv3-btn-primary" onClick={exportCSV} disabled={!rows.length}>
            <Download size={13} /> Export CSV
          </button>
          <button
            className="admv3-btn admv3-btn-ghost is-danger"
            onClick={() => setPurgeAllOpen(true)}
            title="Xóa toàn bộ tài khoản (dọn dữ liệu TEST)"
          >
            <Trash2 size={13} /> Xóa toàn bộ tài khoản
          </button>
        </div>

      </div>

      {someSelected && (
        <div className="admv3-bulk-bar">
          <span><b>{selected.size}</b> đã chọn</span>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => setBulkOpen("ban")}>
            <Ban size={13} /> Khóa hàng loạt
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={bulkUnlock}>
            <Unlock size={13} /> Mở khóa
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => bulkGrant(true)}>
            <ShieldCheck size={13} /> Cấp Admin
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => bulkGrant(false)}>
            <ShieldOff size={13} /> Hạ Admin
          </button>
          <button className="admv3-btn admv3-btn-ghost" onClick={bulkExportCSV}>
            <Download size={13} /> Export (đã chọn)
          </button>
          <button
            className="admv3-btn admv3-btn-ghost"
            onClick={async () => {
              const ids = Array.from(selected);
              if (!ids.length) return;
              const reason = window.prompt("Lý do yêu cầu xác minh (tuỳ chọn):", "") || null;
              const { data, error } = await (supabase as any)
                .rpc("admin_require_verification", { _users: ids, _reason: reason });
              if (error) return toast.error(error.message);
              toast.success(`Đã đặt Yêu cầu xác minh cho ${data ?? ids.length} tài khoản`);
              setSelected(new Set()); void load();
            }}
          >
            <ShieldAlert size={13} /> Yêu cầu xác minh
          </button>
          <button
            className="admv3-btn admv3-btn-ghost"
            onClick={async () => {
              const ids = Array.from(selected);
              if (!ids.length) return;
              const { data, error } = await (supabase as any)
                .rpc("admin_approve_verification_bulk", { _users: ids });
              if (error) return toast.error(error.message);
              toast.success(`Đã duyệt xác minh ${data ?? ids.length} tài khoản`);
              setSelected(new Set()); void load();
            }}
          >
            <ShieldCheck size={13} /> Duyệt xác minh
          </button>
          <button
            className="admv3-btn admv3-btn-ghost is-danger"
            onClick={async () => {
              const ids = Array.from(selected);
              if (!ids.length) return;
              if (!window.confirm(
                `Xoá TOÀN BỘ nội dung (bài viết, bình luận, like, tin nhắn) của ${ids.length} tài khoản?\n\nTài khoản vẫn được giữ lại.`,
              )) return;
              const { wipeUsersContent } = await import("@/lib/admin-bulk");
              const res = await wipeUsersContent(ids);
              if (res.failed) toast.warning(`Đã xoá nội dung ${res.ok}/${ids.length} · lỗi ${res.failed}`);
              else toast.success(`Đã xoá nội dung của ${res.ok} tài khoản`);
              setSelected(new Set());
              void load();
            }}
          >
            <Trash2 size={13} /> Xoá nội dung
          </button>
          <button className="admv3-btn admv3-btn-ghost is-danger" onClick={() => setBulkOpen("delete")}>
            <Trash2 size={13} /> Xoá vĩnh viễn
          </button>

          <button className="admv3-btn admv3-btn-ghost" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
        </div>
      )}

      <div className="admv3-card admv3-table-card">
        <div className="admv3-table-wrap">
          <table className="admv3-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>Thành viên</th>
                <th>UID</th>
                <th>Username</th>
                <th>SĐT</th>
                <th>Tạo lúc</th>
                <th>Online cuối</th>
                <th>IP</th>
                <th>Thiết bị / IP</th>
                <th>Trạng thái</th>
                <th>Quyền</th>
                <th>Vi phạm</th>
                <th>Bài</th>
                <th>Follower</th>
                <th>Following</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={16} className="admv3-td-empty">Đang tải…</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={16} className="admv3-td-empty">Không có dữ liệu</td>
                </tr>
              )}
              {rows.map((u) => {
                const dup = ipDup.get(u.id);
                const dupCount = dup?.count ?? 0;
                const dupCls = dupCount >= 4 ? "admv3-ip-red" : dupCount >= 2 ? "admv3-ip-orange" : dupCount === 1 ? "admv3-ip-green" : "";
                return (
                <tr key={u.id} className="admv3-row-clickable" onClick={() => setViewing(u)}>
                  <td
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => beginDrag(u.id, e)}
                    onMouseEnter={() => enterDrag(u.id)}
                    style={{ userSelect: "none", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleOne(u.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td>
                    <div className="admv3-user-cell">
                      <div className="admv3-user-avatar">
                        {u.avatar ? <img loading="lazy" decoding="async" src={u.avatar} alt="" /> : <span>{(u.full_name || u.username || "?")[0]?.toUpperCase()}</span>}
                      </div>
                      <div>
                        <div className="admv3-user-name-strong">{u.full_name || "—"}</div>
                        <div className="admv3-user-name-muted">{u.is_online || isRecentlyActive(u.last_seen) ? "🟢 Online" : "⚪ Offline"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="admv3-mono">{u.public_id || u.id.slice(0, 8)}</td>
                  <td>@{u.username || "—"}</td>
                  <td>{u.phone || "—"}</td>
                  <td>{fmtDate(u.created_at)}</td>
                  <td>{fmtDate(u.last_seen)}</td>
                  <td onClick={(e) => { e.stopPropagation(); if (dup?.ip) setIpDrillIp(dup.ip); }} style={{ cursor: dup?.ip ? "pointer" : "default" }}>
                    {dup?.ip ? (
                      <div className={`admv3-ip-cell ${dupCls}`} title={`Bấm để xem ${dupCount} tài khoản dùng chung IP`}>
                        <span className="admv3-mono">{dup.ip}</span>
                        <span className="admv3-ip-badge">{dupCount} tài khoản</span>
                      </div>
                    ) : (<span className="admv3-user-name-muted">—</span>)}
                  </td>
                  <td>
                    {u.device ? (
                      <div className="admv3-dev-cell" title={u.device.user_agent || ""}>
                        <div className="admv3-dev-line"><Fingerprint size={11} /> <span className="admv3-mono">{(u.device.fingerprint || "—").slice(0, 14)}</span></div>
                        <div className="admv3-dev-line"><Wifi size={11} /> <span className="admv3-mono">{u.device.ip || "—"}</span></div>
                      </div>
                    ) : (
                      <span className="admv3-user-name-muted">—</span>
                    )}
                  </td>
                  <td>
                    {u.is_banned ? (
                      <span className="admv3-pill admv3-pill-danger">
                        Khóa {u.banned_until ? `→ ${new Date(u.banned_until).toLocaleDateString("vi")}` : "vĩnh viễn"}
                      </span>
                    ) : (
                      <span className="admv3-pill admv3-pill-ok">Hoạt động</span>
                    )}
                  </td>
                  <td>
                    <span className={`admv3-pill ${u.is_admin ? "admv3-pill-admin" : "admv3-pill-user"}`}>
                      {u.is_admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td><ViolationDot count={violations.get(u.id) ?? 0} /></td>
                  <td>{u.posts_count}</td>
                  <td>{u.followers_count ?? 0}</td>
                  <td>{u.following_count}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="admv3-row-actions">
                      <button
                        className="admv3-icon-btn"
                        title="Xem hồ sơ"
                        onClick={() => setViewing(u)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="admv3-icon-btn"
                        title={u.is_admin ? "Thu hồi Admin" : "Cấp Admin"}
                        onClick={() => toggleAdmin(u)}
                      >
                        {u.is_admin ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                      </button>
                      <button
                        className="admv3-icon-btn"
                        title={u.is_banned ? "Mở khóa" : "Khóa"}
                        onClick={() => toggleBan(u)}
                      >
                        {u.is_banned ? <Unlock size={14} /> : <Ban size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <div className="admv3-pager">
          <span>Trang {page + 1} / {totalPages} · {total} thành viên</span>
          <div>
            <button className="admv3-btn admv3-btn-ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              ‹ Trước
            </button>
            <button className="admv3-btn admv3-btn-ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Sau ›
            </button>
          </div>
        </div>
      </div>
      {viewing && (
        <MemberProfileModal
          member={viewing}
          onClose={() => setViewing(null)}
          onToggleAdmin={async () => { await toggleAdmin(viewing); setViewing((v) => v ? { ...v, is_admin: !v.is_admin } : v); }}
          onRequestBan={() => { setViewing(null); setBanTarget(viewing); }}
          onUnlock={async () => { await unlockUser(viewing); setViewing((v) => v ? { ...v, is_banned: false, banned_until: null } : v); }}
          onPermanentBan={async () => { const target = viewing; setViewing(null); await permanentBan(target); }}
          onBlockIp={() => { const target = viewing; setViewing(null); setBlockIpTarget(target); }}
          onDeleteData={() => { const target = viewing; setViewing(null); setDeleteDataTarget(target); }}
          onChanged={() => { void load(); }}
        />
      )}
      {blockIpTarget && (
        <BlockIpDialog
          member={blockIpTarget}
          onCancel={() => setBlockIpTarget(null)}
          onConfirm={async (code, reason) => {
            const res = await blockUserIp(blockIpTarget, code, reason);
            toast.success(
              `Đã Block · ${res?.devices_blocked ?? 0} IP/Device · ${res?.phone_blocked ?? 0} SĐT`,
            );
            setBlockIpTarget(null);
          }}
        />
      )}
      {deleteDataTarget && (
        <DeleteUserDataDialog
          member={deleteDataTarget}
          onCancel={() => setDeleteDataTarget(null)}
          onConfirm={async () => {
            await deleteUserData(deleteDataTarget);
            toast.success("Đã xoá vĩnh viễn dữ liệu. SĐT cũ có thể đăng ký lại.");
            setDeleteDataTarget(null);
            void load();
          }}
        />
      )}
      {banTarget && (
        <BanDialog
          member={banTarget}
          onCancel={() => setBanTarget(null)}
          onConfirm={async (opts) => { await confirmBan(banTarget, opts); setBanTarget(null); }}
        />
      )}
      {promoteTarget && (
        <Promote2FADialog
          member={promoteTarget}
          onClose={() => setPromoteTarget(null)}
          onDone={() => { setPromoteTarget(null); void load(); }}
        />
      )}
      {bulkOpen === "ban" && (
        <BulkBanDialog
          userIds={Array.from(selected)}
          onCancel={() => setBulkOpen(null)}
          onDone={() => { setBulkOpen(null); setSelected(new Set()); void load(); }}
        />
      )}
      {bulkOpen === "delete" && (
        <BulkDeleteDialog
          userIds={Array.from(selected)}
          onCancel={() => setBulkOpen(null)}
          onDone={() => { setBulkOpen(null); setSelected(new Set()); void load(); }}
        />
      )}
      {ipDrillIp && (
        <IpAccountsDialog ip={ipDrillIp} onClose={() => setIpDrillIp(null)} />
      )}
      {purgeAllOpen && (
        <PurgeAllAccountsDialog
          onCancel={() => setPurgeAllOpen(false)}
          onDone={() => { setPurgeAllOpen(false); setSelected(new Set()); void load(); }}
        />
      )}
      <MembersManagerStyles />
    </div>

  );
}

/* ------------------ Helpers & subcomponents ------------------ */
function computeTimeRange(f: TimeFilter, from: string, to: string): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  // Thứ 2 đầu tuần
  const startOfWeek = (d: Date) => {
    const s = startOfDay(d);
    const dow = (s.getDay() + 6) % 7; // 0 = Thứ 2
    s.setDate(s.getDate() - dow);
    return s;
  };
  // Tài khoản "mới" chỉ tính trong vòng 2 tuần gần nhất
  const NEW_LIMIT = new Date(Date.now() - 14 * 86400_000);
  const clamp = (r: { from?: Date; to?: Date }) => {
    const f2 = r.from && r.from > NEW_LIMIT ? r.from : NEW_LIMIT;
    return {
      from: f2.toISOString(),
      to: r.to ? r.to.toISOString() : undefined,
    };
  };

  switch (f) {
    case "today": return clamp({ from: startOfDay(now) });
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return clamp({ from: startOfDay(y), to: endOfDay(y) });
    }
    case "thisWeek": return clamp({ from: startOfWeek(now) });
    case "lastWeek": {
      const s = startOfWeek(now); s.setDate(s.getDate() - 7);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      return clamp({ from: s, to: endOfDay(e) });
    }
    case "thisMonth": return clamp({ from: new Date(now.getFullYear(), now.getMonth(), 1) });
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return clamp({ from: s, to: e });
    }
    case "thisYear": return clamp({ from: new Date(now.getFullYear(), 0, 1) });
    case "range": return clamp({
      from: from ? new Date(from + "T00:00:00") : undefined,
      to: to ? new Date(to + "T23:59:59.999") : undefined,
    });
    default: return {};
  }
}


function downloadCSV(rows: MemberEx[]) {
  const header = [
    "UID", "public_id", "full_name", "username", "phone",
    "created_at", "last_seen", "is_admin", "is_banned",
    "posts_count", "followers_count", "following_count",
  ];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.id, r.public_id ?? "", r.full_name ?? "", r.username ?? "",
        r.phone ?? "", r.created_at ?? "", r.last_seen ?? "",
        r.is_admin ? "1" : "0", r.is_banned ? "1" : "0",
        r.posts_count, r.followers_count ?? 0, r.following_count,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `members_selected_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ViolationDot({ count }: { count: number }) {
  if (!count) return <span className="admv3-vio admv3-vio-0" title="Không có vi phạm">—</span>;
  const cls = count >= 5 ? "admv3-vio-hi" : count >= 2 ? "admv3-vio-mid" : "admv3-vio-lo";
  return <span className={`admv3-vio ${cls}`} title={`${count} vi phạm`}>Lần {count}</span>;
}

function Promote2FADialog({
  member, onClose, onDone,
}: { member: MemberEx; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [cap, setCap] = useState("");
  const [loading, setLoading] = useState(false);
  const grant = !member.is_admin;
  const submit = async () => {
    if (grant) {
      if (!pw || !cap) return toast.error("Nhập đủ mật khẩu Admin & mã CAPADMIN");
      setLoading(true);
      const { error } = await (supabase as any).rpc("admin_grant_admin_2fa", {
        p_target: member.id, p_grant: true, p_admin_password: pw, p_capadmin_code: cap,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Đã cấp quyền Admin");
    } else {
      if (!window.confirm(`Thu hồi quyền Admin của @${member.username || member.id.slice(0,6)}?`)) return;
      const { error } = await (supabase.from("profiles") as any).update({ is_admin: false }).eq("id", member.id);
      if (error) return toast.error(error.message);
      toast.success("Đã thu hồi Admin");
    }
    onDone();
  };
  return (
    <div className="admv3-modal-backdrop" onClick={onClose}>
      <div className="admv3-modal admv3-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="admv3-modal-head">
          <h3>{grant ? "Cấp quyền Admin (2 bước)" : "Thu hồi Admin"}</h3>
          <button className="admv3-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="admv3-modal-body">
          <p className="admv3-muted">Đối tượng: <b>@{member.username || member.id.slice(0,8)}</b></p>
          {grant && (
            <>
              <label className="admv3-form-label">Mật khẩu Admin của bạn</label>
              <input className="admv3-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <label className="admv3-form-label">Mã CAPADMIN</label>
              <input className="admv3-input" type="password" value={cap} onChange={(e) => setCap(e.target.value)} />
              <p className="admv3-muted" style={{ marginTop: 8 }}>
                Bắt buộc xác thực 2 lớp để cấp quyền Admin.
              </p>
            </>
          )}
        </div>
        <div className="admv3-modal-foot">
          <button className="admv3-btn admv3-btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="admv3-btn admv3-btn-primary" onClick={submit} disabled={loading}>
            {loading ? "Đang xử lý…" : (grant ? "Xác nhận cấp Admin" : "Thu hồi")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkBanDialog({
  userIds, onCancel, onDone,
}: { userIds: string[]; onCancel: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!reason.trim()) return toast.error("Nhập lý do khoá");
    setLoading(true);
    const { error } = await (supabase as any).rpc("admin_bulk_ban", {
      p_user_ids: userIds,
      p_reason: reason.trim(),
      p_days: days === "" ? null : Number(days),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`Đã khoá ${userIds.length} tài khoản`);
    onDone();
  };
  return (
    <div className="admv3-modal-backdrop" onClick={onCancel}>
      <div className="admv3-modal admv3-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="admv3-modal-head">
          <h3>Khoá hàng loạt · {userIds.length} tài khoản</h3>
          <button className="admv3-icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="admv3-modal-body">
          <label className="admv3-form-label">Lý do</label>
          <textarea className="admv3-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <label className="admv3-form-label">Số ngày (trống = vĩnh viễn)</label>
          <input className="admv3-input" type="number" min={1} value={days}
            onChange={(e) => setDays(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="admv3-modal-foot">
          <button className="admv3-btn admv3-btn-ghost" onClick={onCancel}>Huỷ</button>
          <button className="admv3-btn admv3-btn-primary" onClick={submit} disabled={loading}>
            {loading ? "Đang khoá…" : "Xác nhận khoá"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkDeleteDialog({
  userIds, onCancel, onDone,
}: { userIds: string[]; onCancel: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [pw, setPw] = useState("");
  const [cap, setCap] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (confirm !== "XOA VINH VIEN") return toast.error("Gõ chính xác: XOA VINH VIEN");
    setLoading(true);
    let ok = 0, fail = 0;
    for (const uid of userIds) {
      // Chỉ xoá dữ liệu — KHÔNG blacklist, SĐT cũ vẫn đăng ký lại được.
      let { error } = await (supabase as any).rpc("admin_delete_user_data", { p_user_id: uid });
      if (error && /admin_delete_user_data/i.test(error.message || "")) {
        const res = await (supabase as any).rpc("admin_delete_user_hard", {
          p_user_id: uid, p_admin_password: pw, p_capadmin_code: cap,
        });
        error = res.error;
      }
      if (error) fail += 1; else ok += 1;
    }
    setLoading(false);
    toast.success(`Đã xoá vĩnh viễn ${ok}/${userIds.length}${fail ? ` · lỗi ${fail}` : ""}`);
    onDone();
  };
  return (
    <div className="admv3-modal-backdrop" onClick={onCancel}>
      <div className="admv3-modal admv3-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="admv3-modal-head">
          <h3 style={{ color: "#dc2626" }}>Xoá vĩnh viễn · {userIds.length} tài khoản</h3>
          <button className="admv3-icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="admv3-modal-body">
          <p className="admv3-muted" style={{ color: "#b91c1c" }}>
            Chỉ xoá DỮ LIỆU (Account, Profile, Post, UID, IP…). KHÔNG blacklist —
            người dùng có thể đăng ký lại bằng chính SĐT cũ. Muốn chặn hẳn, dùng
            chức năng <b>Block IP</b> (cần mã 792006).
          </p>
          <label className="admv3-form-label">Gõ "XOA VINH VIEN" để xác nhận</label>
          <input className="admv3-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <label className="admv3-form-label">Mật khẩu Admin</label>
          <input className="admv3-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <label className="admv3-form-label">Mã CAPADMIN</label>
          <input className="admv3-input" type="password" value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <div className="admv3-modal-foot">
          <button className="admv3-btn admv3-btn-ghost" onClick={onCancel}>Huỷ</button>
          <button className="admv3-btn admv3-btn-primary is-danger" onClick={submit} disabled={loading}>
            {loading ? "Đang xoá…" : "Xoá vĩnh viễn"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Xóa TOÀN BỘ tài khoản — chỉ để dọn dữ liệu TEST.
 * Yêu cầu đủ 3 lớp xác nhận: mật mã XOALUONDI · mật khẩu Admin PASSADMIN ·
 * mã Admin 792006. KHÔNG blacklist SĐT/IP/device/fingerprint.
 */
function PurgeAllAccountsDialog({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    const confirmVal = confirm.trim().toUpperCase();
    const codeVal = code.trim();
    const pwVal = pw;
    if (confirmVal !== "XOALUONDI") return toast.error("Mật mã xóa không đúng");
    if (!pwVal) return toast.error("Vui lòng nhập mật khẩu Admin");
    if (codeVal !== "792006") return toast.error("Mã Admin không đúng");
    setLoading(true);
    try {
      const { purgeAllAccounts } = await import("@/lib/admin-bulk");
      const removed = await purgeAllAccounts({
        confirm: confirmVal,
        adminPassword: pwVal,
        adminCode: codeVal,
      });
      try {
        await queryClient.cancelQueries();
        queryClient.removeQueries();
        queryClient.clear();
      } catch { /* noop */ }
      const { broadcastAdminPurge } = await import("@/lib/admin-broadcast");
      await broadcastAdminPurge("posts");
      await broadcastAdminPurge("accounts");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("feed:refresh"));
        window.dispatchEvent(new CustomEvent("admin:purge", { detail: { kind: "posts" } }));
      }
      toast.success(`Đã xóa vĩnh viễn ${removed} tài khoản. SĐT có thể đăng ký lại.`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Không thể xóa toàn bộ tài khoản");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admv3-modal-backdrop" onClick={onCancel}>
      <div className="admv3-modal admv3-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="admv3-modal-head">
          <h3 style={{ color: "#dc2626" }}>Xóa toàn bộ tài khoản (dữ liệu TEST)</h3>
          <button className="admv3-icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="admv3-modal-body">
          <p className="admv3-muted" style={{ color: "#b91c1c" }}>
            Xóa vĩnh viễn toàn bộ dữ liệu tài khoản. KHÔNG đưa SĐT / IP / thiết bị /
            fingerprint vào blacklist — người dùng có thể đăng ký lại bằng chính số cũ.
            Không xóa table, schema, RPC hay migration.
          </p>
          <label className="admv3-form-label">Mật mã xóa</label>
          <input className="admv3-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="XOALUONDI" />
          <label className="admv3-form-label">Mật khẩu Admin</label>
          <input className="admv3-input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <label className="admv3-form-label">Mã Admin</label>
          <input className="admv3-input" type="password" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="admv3-modal-foot">
          <button className="admv3-btn admv3-btn-ghost" onClick={onCancel}>Huỷ</button>
          <button className="admv3-btn admv3-btn-primary is-danger" onClick={submit} disabled={loading}>
            {loading ? "Đang xóa…" : "Xóa toàn bộ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IpAccountsDialog({ ip, onClose }: { ip: string; onClose: () => void }) {

  useBodyScrollLock(true);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("admin_accounts_by_ip", { _ip: ip });
      if (error) toast.error(error.message);
      setRows((data ?? []) as any[]);
      setLoading(false);
    })();
  }, [ip]);
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.user_id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.user_id)));

  const bulkRequireVerify = async () => {
    const ids = Array.from(sel);
    if (!ids.length) return;
    const { error } = await (supabase as any).rpc("admin_require_verification", { _users: ids, _reason: `Trùng IP ${ip}` });
    if (error) return toast.error(error.message);
    toast.success(`Đã yêu cầu xác minh ${ids.length} tài khoản`);
    onClose();
  };

  return (
    <div className="adp-modal-backdrop" onClick={onClose}>
      <div className="adp-modal" onClick={(e) => e.stopPropagation()} style={{ background: "#0f1220", color: "#fff", maxWidth: 780, width: "94vw" }}>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id">Tài khoản dùng chung IP</div>
            <div className="adp-modal-time admv3-mono">{ip} · {rows.length} tài khoản</div>
          </div>
          <button className="adp-modal-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div style={{ padding: 16, maxHeight: "60vh", overflow: "auto" }}>
          {loading ? "Đang tải…" : rows.length === 0 ? "Không có dữ liệu." : (
            <table className="admv3-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th>Avatar</th><th>UID</th><th>Username</th><th>SĐT</th><th>Trạng thái</th><th>Tạo</th><th>Online cuối</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td><input type="checkbox" checked={sel.has(r.user_id)} onChange={() => toggle(r.user_id)} /></td>
                    <td><div className="admv3-user-avatar" style={{ width: 26, height: 26 }}>
                      {r.avatar ? <img loading="lazy" decoding="async" src={r.avatar} alt="" /> : <span>{(r.full_name || r.username || "?")[0]?.toUpperCase()}</span>}
                    </div></td>
                    <td className="admv3-mono">{String(r.user_id).slice(0, 8)}</td>
                    <td>@{r.username || "—"}</td>
                    <td>{r.phone || "—"}</td>
                    <td>{r.is_banned ? "Khoá" : "Hoạt động"}</td>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>{fmtDate(r.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="adp-mv-actions">
          <button className="adp-mv-btn" onClick={onClose}>Đóng</button>
          <button className="adp-mv-btn is-warn" onClick={bulkRequireVerify} disabled={!sel.size}>
            <ShieldAlert size={14} /> Yêu cầu xác minh ({sel.size})
          </button>
        </footer>
      </div>
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", { hour12: false });
  } catch {
    return iso;
  }
}

/* -------------------------------------------------------------------
 * Member profile popup — read-only overview + quick admin actions.
 * ------------------------------------------------------------------ */
function MemberProfileModal({
  member, onClose, onToggleAdmin, onRequestBan, onUnlock, onPermanentBan,
  onBlockIp, onDeleteData, onChanged,
}: {
  member: MemberEx;
  onClose: () => void;
  onToggleAdmin: () => void | Promise<void>;
  onRequestBan: () => void;
  onUnlock: () => void | Promise<void>;
  onPermanentBan: () => void | Promise<void>;
  onBlockIp: () => void;
  onDeleteData: () => void;
  onChanged: () => void;
}) {
  useBodyScrollLock(true);
  const [gemBalance, setGemBalance] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase.from("profiles") as any)
        .select("gem_balance").eq("id", member.id).maybeSingle();
      if (alive) setGemBalance((data as any)?.gem_balance ?? 0);
    })();
    return () => { alive = false; };
  }, [member.id]);


  const resetAvatar = async () => {
    if (!window.confirm("Xóa ảnh đại diện của thành viên này?")) return;
    const { error } = await (supabase.from("profiles") as any)
      .update({ avatar: null }).eq("id", member.id);
    if (error) return toast.error(error.message);
    toast.success("Đã xóa ảnh đại diện");
    onChanged();
  };
  const resetCover = async () => {
    if (!window.confirm("Xóa ảnh bìa của thành viên này?")) return;
    const { error } = await (supabase.from("profiles") as any)
      .update({ cover_url: null }).eq("id", member.id);
    if (error) return toast.error(error.message);
    toast.success("Đã xóa ảnh bìa");
    onChanged();
  };
  const resetBio = async () => {
    if (!window.confirm("Reset phần giới thiệu (bio) về trống?")) return;
    const { error } = await (supabase.from("profiles") as any)
      .update({ bio: null }).eq("id", member.id);
    if (error) return toast.error(error.message);
    toast.success("Đã reset bio");
    onChanged();
  };
  const resetPassword = async () => {
    const pw = window.prompt(
      `Đặt lại mật khẩu cho @${member.username || member.id.slice(0, 6)}\n` +
      `Mật khẩu mới (ít nhất 6 ký tự).\n` +
      `Hệ thống sẽ đồng thời: mở khoá tài khoản, xác nhận email/SĐT và huỷ mọi phiên cũ.`,
      "123456",
    );
    if (!pw) return;
    if (pw.length < 6) return toast.error("Mật khẩu phải ≥ 6 ký tự");
    const { error } = await (supabase as any).rpc("admin_reset_password", {
      p_user_id: member.id,
      p_new_password: pw,
    });
    if (error) return toast.error("Reset password lỗi: " + error.message);
    toast.success("Đã đặt lại mật khẩu + mở khoá đăng nhập. Hãy gửi mật khẩu mới cho user một cách an toàn.");
    onChanged();
  };

  const dev = member.device;

  return (
    <div className="adp-modal-backdrop" onClick={onClose}>
      <div className="adp-modal adp-member-view adp-member-view-v2" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id">Hồ sơ thành viên</div>
            <div className="adp-modal-time">{member.public_id || member.id.slice(0, 8)}</div>
          </div>
          <button className="adp-modal-close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>

        <div className="adp-mv-hero">
          <div className="adp-avatar adp-avatar-lg">
            {member.avatar
              ? <img loading="lazy" decoding="async" src={member.avatar} alt="" />
              : <span>{(member.full_name || member.username || "?")[0]?.toUpperCase()}</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="adp-mv-hero-title">{member.full_name || member.username || "—"}</div>
            <div className="adp-mv-hero-sub">@{member.username || "—"} · {member.is_online || isRecentlyActive(member.last_seen) ? "🟢 Online" : "⚪ Offline"}</div>
          </div>
        </div>

        <div className="adp-mv-grid">
          <div className="adp-mv-field"><span className="k">UID</span><span className="v mono">{member.id}</span></div>
          <div className="adp-mv-field"><span className="k">Public ID</span><span className="v">{member.public_id || "—"}</span></div>
          <div className="adp-mv-field"><span className="k">SĐT</span><span className="v">{member.phone || "—"}</span></div>
          <div className="adp-mv-field"><span className="k">Quyền</span><span className="v">{member.is_admin ? "Admin" : "User"}</span></div>
          <div className="adp-mv-field"><span className="k">Trạng thái</span><span className="v">{member.is_banned ? (member.banned_until ? `Khóa tới ${new Date(member.banned_until).toLocaleString("vi")}` : "Khóa vĩnh viễn") : "Hoạt động"}</span></div>
          <div className="adp-mv-field"><span className="k">Ngày tạo</span><span className="v">{fmtDate(member.created_at)}</span></div>
          <div className="adp-mv-field"><span className="k">Online cuối</span><span className="v">{fmtDate(member.last_seen)}</span></div>
          <div className="adp-mv-field"><span className="k">Bài viết</span><span className="v">{member.posts_count}</span></div>
          <div className="adp-mv-field"><span className="k">Follower</span><span className="v">{member.followers_count ?? 0}</span></div>
          <div className="adp-mv-field"><span className="k">Following</span><span className="v">{member.following_count}</span></div>
          <div className="adp-mv-field"><span className="k">Số Gem</span><span className="v">{gemBalance == null ? "…" : gemBalance.toLocaleString("vi-VN")} 💎</span></div>
        </div>


        <div className="admv3-dev-block">
          <div className="admv3-dev-block-title"><Fingerprint size={13} /> Thiết bị & IP gần nhất</div>
          {dev ? (
            <div className="admv3-dev-block-grid">
              <div><span className="k">Fingerprint</span><span className="v mono">{dev.fingerprint || "—"}</span></div>
              <div><span className="k">IP</span><span className="v mono">{dev.ip || "—"}</span></div>
              <div className="full"><span className="k">User-Agent</span><span className="v mono ua">{dev.user_agent || "—"}</span></div>
              <div><span className="k">Ghi nhận lúc</span><span className="v">{fmtDate(dev.created_at)}</span></div>
            </div>
          ) : (
            <div className="admv3-dev-block-empty">Chưa có thông tin thiết bị.</div>
          )}
        </div>

        <MemberHistorySection userId={member.id} />


        <footer className="adp-mv-actions">
          <button className="adp-mv-btn" onClick={resetAvatar}><ImageOff size={14} /> Xóa avatar</button>
          <button className="adp-mv-btn" onClick={resetCover}><ImageOff size={14} /> Xóa ảnh bìa</button>
          <button className="adp-mv-btn" onClick={resetBio}><RotateCcw size={14} /> Reset bio</button>
          <button className="adp-mv-btn is-warn" onClick={resetPassword}><KeyRound size={14} /> Reset mật khẩu</button>
          <button className="adp-mv-btn is-warn" onClick={() => onToggleAdmin()}>
            {member.is_admin ? <><ShieldOff size={14} /> Thu hồi Admin</> : <><ShieldCheck size={14} /> Cấp Admin</>}
          </button>
          {member.is_banned ? (
            <button className="adp-mv-btn is-danger" onClick={() => onUnlock()}><Unlock size={14} /> Mở khóa</button>
          ) : (
            <button className="adp-mv-btn is-danger" onClick={onRequestBan}><Ban size={14} /> Khóa…</button>
          )}
          <button className="adp-mv-btn is-danger" onClick={() => onPermanentBan()} title="Khóa vĩnh viễn + Blacklist Device/IP/SĐT + Đăng xuất tất cả phiên">
            <ShieldAlert size={14} /> Cấm vĩnh viễn
          </button>
          <button
            className="adp-mv-btn is-danger"
            onClick={onBlockIp}
            title="Chuyển trạng thái Block + blacklist IP / Device / SĐT (cần mã 792006)"
          >
            <Wifi size={14} /> Block IP
          </button>
          <button
            className="adp-mv-btn is-danger"
            onClick={onDeleteData}
            title="Chỉ xoá dữ liệu (Account, Profile, Post, UID, IP…) — SĐT cũ vẫn đăng ký lại được"
          >
            <Trash2 size={14} /> Xoá vĩnh viễn
          </button>
          <button className="adp-mv-btn is-primary" onClick={onClose}>Đóng</button>
        </footer>

        <div style={{ padding: "0 16px 16px" }}>
          <RestrictionPanel userId={member.id} onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function BanDialog({
  member, onCancel, onConfirm,
}: {
  member: MemberEx;
  onCancel: () => void;
  onConfirm: (opts: { days: number; blockIp: boolean; blockDevice: boolean }) => void | Promise<void>;
}) {
  useBodyScrollLock(true);
  const [days, setDays] = useState("7");
  const [blockIp, setBlockIp] = useState(false);
  const [blockDevice, setBlockDevice] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const d = Math.max(0, Number(days) || 0);
    setBusy(true);
    try {
      await onConfirm({ days: d, blockIp, blockDevice });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adp-modal-backdrop" onClick={onCancel}>
      <div className="adp-modal adp-ban-dialog" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id">Khóa thành viên</div>
            <div className="adp-modal-time">@{member.username || member.id.slice(0, 8)}</div>
          </div>
          <button className="adp-modal-close" onClick={onCancel} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="adp-ban-body">
          <label className="adp-ban-label">
            <span>Thời hạn (ngày)</span>
            <input
              type="number" min={0} value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="0 = vĩnh viễn"
            />
            <small>0 = khóa vĩnh viễn</small>
          </label>
          <label className="adp-ban-check">
            <input type="checkbox" checked={blockDevice} onChange={(e) => setBlockDevice(e.target.checked)} />
            <span><Fingerprint size={13} /> Khóa Device (fingerprint) — chặn thiết bị này tạo/đăng nhập tài khoản mới</span>
          </label>
          <label className="adp-ban-check">
            <input type="checkbox" checked={blockIp} onChange={(e) => setBlockIp(e.target.checked)} />
            <span><Wifi size={13} /> Khóa IP — chặn địa chỉ IP này tạo/đăng nhập tài khoản mới</span>
          </label>
        </div>
        <footer className="adp-mv-actions">
          <button className="adp-mv-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button className="adp-mv-btn is-danger" onClick={submit} disabled={busy}>
            <Ban size={14} /> {busy ? "Đang khóa…" : "Xác nhận khóa"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/** BLOCK IP — chuyển trạng thái Block + blacklist IP/Device/SĐT. Mã 792006. */
function BlockIpDialog({
  member, onCancel, onConfirm,
}: {
  member: MemberEx;
  onCancel: () => void;
  onConfirm: (code: string, reason: string) => Promise<void>;
}) {
  useBodyScrollLock(true);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.trim() !== "792006") return toast.error("Mã xác nhận không đúng");
    setBusy(true);
    try { await onConfirm(code.trim(), reason.trim()); }
    catch (e: any) { toast.error(e?.message || "Block thất bại"); }
    finally { setBusy(false); }
  };

  return (
    <div className="adp-modal-backdrop" onClick={onCancel}>
      <div className="adp-modal adp-ban-dialog" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id">Block IP</div>
            <div className="adp-modal-time">@{member.username || member.id.slice(0, 8)}</div>
          </div>
          <button className="adp-modal-close" onClick={onCancel} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="adp-ban-body">
          <p className="admv3-muted">
            Giữ nguyên toàn bộ dữ liệu. Tài khoản chuyển sang trạng thái <b>Block</b> và
            IP / Device / SĐT bị đưa vào blacklist — không thể tạo tài khoản mới.
          </p>
          <label className="adp-ban-label">
            <span>Lý do (tuỳ chọn)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spam, lừa đảo…" />
          </label>
          <label className="adp-ban-label">
            <span>Mã xác nhận</span>
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="792006" />
          </label>
        </div>
        <footer className="adp-mv-actions">
          <button className="adp-mv-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button className="adp-mv-btn is-danger" onClick={submit} disabled={busy}>
            <Wifi size={14} /> {busy ? "Đang block…" : "Xác nhận Block"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** XOÁ VĨNH VIỄN — chỉ xoá dữ liệu, cho phép đăng ký lại bằng SĐT cũ. */
function DeleteUserDataDialog({
  member, onCancel, onConfirm,
}: {
  member: MemberEx;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  useBodyScrollLock(true);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (confirm.trim().toUpperCase() !== "XOA VINH VIEN") {
      return toast.error("Gõ chính xác: XOA VINH VIEN");
    }
    setBusy(true);
    try { await onConfirm(); }
    catch (e: any) { toast.error(e?.message || "Xoá thất bại"); }
    finally { setBusy(false); }
  };

  return (
    <div className="adp-modal-backdrop" onClick={onCancel}>
      <div className="adp-modal adp-ban-dialog" onClick={(e) => e.stopPropagation()} data-scroll-lock-ignore>
        <header className="adp-modal-head">
          <div>
            <div className="adp-modal-id" style={{ color: "#dc2626" }}>Xoá vĩnh viễn</div>
            <div className="adp-modal-time">@{member.username || member.id.slice(0, 8)}</div>
          </div>
          <button className="adp-modal-close" onClick={onCancel} aria-label="Đóng"><X size={18} /></button>
        </header>
        <div className="adp-ban-body">
          <p className="admv3-muted" style={{ color: "#b91c1c" }}>
            Xoá toàn bộ dữ liệu: Account, Profile, bài viết, bình luận, tin nhắn, UID, IP…
            KHÔNG blacklist — người dùng có thể đăng ký lại bằng <b>chính SĐT cũ</b>
            {member.phone ? ` (${member.phone})` : ""}.
          </p>
          <label className="adp-ban-label">
            <span>Gõ "XOA VINH VIEN" để xác nhận</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        </div>
        <footer className="adp-mv-actions">
          <button className="adp-mv-btn" onClick={onCancel} disabled={busy}>Hủy</button>
          <button className="adp-mv-btn is-danger" onClick={submit} disabled={busy}>
            <Trash2 size={14} /> {busy ? "Đang xoá…" : "Xoá vĩnh viễn"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
const HISTORY_TABS: { key: string; label: string }[] = [
  { key: "password",    label: "Đổi mật khẩu" },
  { key: "logins",      label: "Đăng nhập" },
  { key: "messages",    label: "Tin nhắn" },
  { key: "posts",       label: "Bài viết" },
  { key: "comments",    label: "Bình luận" },
  { key: "transfers",   label: "Chuyển tiền" },
  { key: "lucky_money", label: "Lì xì" },
];

function MemberHistorySection({ userId }: { userId: string }) {
  const [tab, setTab] = useState<string>("logins");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 15;

  useEffect(() => { setPage(0); }, [tab, userId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any).rpc("admin_user_history", {
        _user: userId, _kind: tab, _limit: LIMIT, _offset: page * LIMIT,
      });
      if (!alive) return;
      if (error) { toast.error(error.message); setRows([]); }
      else setRows((data ?? []) as any[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId, tab, page]);

  return (
    <div className="admv3-dev-block" style={{ marginTop: 4 }}>
      <div className="admv3-dev-block-title"><Activity size={13} /> Lịch sử hoạt động</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {HISTORY_TABS.map((t) => (
          <button key={t.key}
            className={`admv3-chip ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>
      {loading ? (
        <div className="admv3-dev-block-empty">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="admv3-dev-block-empty">Không có dữ liệu.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6, maxHeight: 280, overflow: "auto" }}>
          {rows.map((r) => (
            <li key={r.id} style={{
              padding: "8px 10px", background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.06)", borderRadius: 8,
              fontSize: 12.5,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <b style={{ color: "#e5e7eb" }}>{r.title}</b>
                <span style={{ color: "rgba(255,255,255,.55)", fontSize: 11 }}>{fmtDate(r.occurred_at)}</span>
              </div>
              {r.body ? <div style={{ marginTop: 4, color: "rgba(255,255,255,.75)", whiteSpace: "pre-wrap" }}>{r.body}</div> : null}
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
        <button className="admv3-btn admv3-btn-ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Trước</button>
        <span style={{ color: "rgba(255,255,255,.6)" }}>Trang {page + 1}</span>
        <button className="admv3-btn admv3-btn-ghost" disabled={rows.length < LIMIT} onClick={() => setPage((p) => p + 1)}>Sau ›</button>
      </div>
    </div>
  );
}

function MembersManagerStyles() {
  return (
    <style>{`
      .admv3-dev-cell { display:grid; gap:2px; font-size:11px; line-height:1.3; }
      .admv3-bulk-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 12px; margin:8px 0; background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.25); border-radius:10px; font-size:12.5px; }
      .admv3-bulk-bar .is-danger { color:#dc2626; }
      .admv3-time-select, .admv3-date-input { padding:4px 8px; }
      .admv3-vio { display:inline-block; min-width:22px; padding:2px 6px; text-align:center; border-radius:999px; font-size:11px; font-weight:700; }
      .admv3-vio-0 { background:#e5e7eb; color:#6b7280; }
      .admv3-vio-lo { background:#fef3c7; color:#92400e; }
      .admv3-vio-mid { background:#fed7aa; color:#9a3412; }
      .admv3-vio-hi { background:#fecaca; color:#991b1b; }
      .admv3-modal-sm { width:min(460px, 92vw); }
      .admv3-form-label { display:block; font-size:12px; font-weight:600; color:#374151; margin:10px 0 4px; }
      .admv3-input { width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; }
      .admv3-btn.is-danger { background:#dc2626; color:#fff; }
      .admv3-dev-line { display:flex; align-items:center; gap:4px; opacity:.85; }
      .admv3-dev-line .admv3-mono { font-family: ui-monospace, Menlo, monospace; }

      .adp-member-view-v2 { background:#0f1220; color:#f5f7ff; }
      .adp-member-view-v2 .adp-modal-head { background:#151933; border-bottom:1px solid rgba(255,255,255,.08); }
      .adp-member-view-v2 .adp-modal-id { color:#fff; font-weight:700; font-size:15px; letter-spacing:.2px; }
      .adp-member-view-v2 .adp-modal-time { color:rgba(255,255,255,.65); font-size:12px; }
      .adp-member-view-v2 .adp-mv-hero-title { color:#fff; font-weight:700; font-size:17px; }
      .adp-member-view-v2 .adp-mv-hero-sub { color:rgba(255,255,255,.7); font-size:12.5px; }
      .adp-member-view-v2 .adp-mv-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px 14px; padding:0 16px 12px; }
      .adp-member-view-v2 .adp-mv-field { display:flex; justify-content:space-between; gap:12px; padding:8px 10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); border-radius:8px; }
      .adp-member-view-v2 .adp-mv-field .k { color:rgba(255,255,255,.6); font-size:11.5px; text-transform:uppercase; letter-spacing:.4px; font-weight:600; }
      .adp-member-view-v2 .adp-mv-field .v { color:#fff; font-size:13px; font-weight:600; text-align:right; overflow:hidden; text-overflow:ellipsis; }
      .adp-member-view-v2 .adp-mv-field .v.mono { font-family: ui-monospace, Menlo, monospace; font-size:12px; font-weight:500; }

      .admv3-dev-block { margin:6px 16px 12px; padding:12px; background:rgba(96,165,250,.08); border:1px solid rgba(96,165,250,.25); border-radius:10px; }
      .admv3-dev-block-title { display:flex; align-items:center; gap:6px; color:#93c5fd; font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
      .admv3-dev-block-grid { display:grid; grid-template-columns: 1fr 1fr; gap:6px 12px; }
      .admv3-dev-block-grid > div { display:flex; justify-content:space-between; gap:10px; }
      .admv3-dev-block-grid > div.full { grid-column: 1 / -1; }
      .admv3-dev-block-grid .k { color:rgba(255,255,255,.6); font-size:11px; font-weight:600; }
      .admv3-dev-block-grid .v { color:#fff; font-size:12.5px; text-align:right; overflow:hidden; text-overflow:ellipsis; }
      .admv3-dev-block-grid .v.mono { font-family: ui-monospace, Menlo, monospace; font-size:11.5px; }
      .admv3-dev-block-grid .v.ua { font-size:11px; opacity:.85; word-break:break-all; text-align:right; }
      .admv3-dev-block-empty { color:rgba(255,255,255,.6); font-size:12.5px; }
      .admv3-row-clickable { cursor: pointer; }
      .admv3-row-clickable:hover td { background: rgba(59,130,246,.06); }
      .admv3-ip-cell { display:inline-flex; flex-direction:column; align-items:flex-start; gap:2px; padding:4px 8px; border-radius:8px; font-size:11.5px; line-height:1.25; }
      .admv3-ip-cell .admv3-ip-badge { font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:999px; }
      .admv3-ip-green  { background:rgba(34,197,94,.10); color:#166534; }
      .admv3-ip-green  .admv3-ip-badge { background:#dcfce7; color:#166534; }
      .admv3-ip-orange { background:rgba(251,146,60,.12); color:#9a3412; }
      .admv3-ip-orange .admv3-ip-badge { background:#ffedd5; color:#9a3412; }
      .admv3-ip-red    { background:rgba(239,68,68,.14); color:#991b1b; }
      .admv3-ip-red    .admv3-ip-badge { background:#fee2e2; color:#991b1b; }

      .adp-ban-dialog { max-width: 460px; background:#0f1220; color:#f5f7ff; }
      .adp-ban-body { padding: 14px 16px; display:grid; gap:12px; }
      .adp-ban-label { display:grid; gap:6px; font-size:12.5px; color:#fff; font-weight:600; }
      .adp-ban-label input { padding:9px 12px; background:#1a1f3a; border:1px solid rgba(255,255,255,.12); border-radius:8px; color:#fff; font-size:14px; }
      .adp-ban-label small { color:rgba(255,255,255,.55); font-weight:500; font-size:11px; }
      .adp-ban-check { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px; font-size:12.5px; color:#fff; cursor:pointer; line-height:1.45; }
      .adp-ban-check input { margin-top:2px; accent-color:#f87171; }
      .adp-ban-check span { display:flex; gap:6px; align-items:flex-start; flex-wrap:wrap; }
    `}</style>
  );
}

