// Tab "From Reply": mẫu trả lời tự động lần 1 / lần 2 + danh sách user thật đã được trả lời.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase, supabaseAdminSession } from "@/lib/db/router";
import { fromReplyLoadFn, fromReplySaveFn } from "@/lib/from-reply.functions";
import { parseTemplates } from "@/lib/from-reply";
type FromReplyRow = { userId: string; name: string; count: number; status: string; lastSentAt: string | null; lastBot: string | null };

async function adminToken(): Promise<string> {
  const a = (await supabaseAdminSession.auth.getSession()).data.session?.access_token;
  if (a) return a;
  const b = (await supabase.auth.getSession()).data.session?.access_token;
  if (b) return b;
  throw new Error("Chưa đăng nhập Admin Panel.");
}

const STATUS: Record<string, string> = { idle: "", pending: "Đang chờ gửi", sending: "Đang gửi" };

export function FromReplyTab() {
  const [r1, setR1] = useState("");
  const [r2, setR2] = useState("");
  const [rows, setRows] = useState<FromReplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fromReplyLoadFn({ data: { token: await adminToken() } });
      if (!res.ok) { setMsg(res.error); return; }
      setR1(res.data.replies1.join("\n"));
      setR2(res.data.replies2.join("\n"));
      setRows(res.data.rows);
      setMsg(null);
    } catch (e) { setMsg((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fromReplySaveFn({ data: { token: await adminToken(), replies1: r1, replies2: r2 } });
      setMsg(res.ok ? "Đã lưu cấu hình." : res.error);
    } catch (e) { setMsg((e as Error).message); }
    finally { setSaving(false); }
  };

  const n1 = parseTemplates(r1).length, n2 = parseTemplates(r2).length;

  return (
    <div className="space-y-4 p-3">
      <p className="text-xs text-muted-foreground">
        Mỗi dòng là một mẫu. Khi user thật bấm “Nhắn tin” trên bài viết của tài khoản thứ hai: lần 1 trả lời sau 1 phút,
        lần 2 trả lời sau 3 phút. Tối đa 2 lần cho mỗi user trên toàn hệ thống.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>From Reply 1 ({n1} mẫu)</span>
          <textarea className="min-h-40 w-full rounded-md border border-border bg-background p-2 text-sm font-normal"
            value={r1} onChange={(e) => setR1(e.target.value)} disabled={loading} placeholder="Mỗi dòng một nội dung…" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>From Reply 2 ({n2} mẫu)</span>
          <textarea className="min-h-40 w-full rounded-md border border-border bg-background p-2 text-sm font-normal"
            value={r2} onChange={(e) => setR2(e.target.value)} disabled={loading} placeholder="Mỗi dòng một nội dung…" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => void save()} disabled={saving || loading}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</Button>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>Tải lại</Button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs">
            <tr><th className="px-3 py-2">User thật</th><th className="px-3 py-2">Đã trả lời</th><th className="px-3 py-2">Tài khoản thứ hai</th><th className="px-3 py-2">Lần gửi gần nhất</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">{loading ? "Đang tải…" : "Chưa có user nào."}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.userId} className="border-t border-border">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{r.count}/2 {STATUS[r.status] ? <span className="ml-1 text-xs font-normal text-muted-foreground">· {STATUS[r.status]}</span> : null}</td>
                <td className="px-3 py-2">{r.lastBot ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.lastSentAt ? new Date(r.lastSentAt).toLocaleString("vi-VN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
