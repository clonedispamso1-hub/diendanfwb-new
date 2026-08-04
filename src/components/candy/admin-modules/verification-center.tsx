import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

interface Row {
  id: string;
  user_id: string;
  selfie_url: string;
  portrait_url: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  created_at: string;
  profiles?: { full_name: string | null; username: string | null; avatar: string | null } | null;
}

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from("verification-photos").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? "";
}

export default function VerificationCenter() {
  const [rows, setRows] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, { selfie: string; portrait: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profile_verifications")
      .select("id, user_id, selfie_url, portrait_url, status, reason, created_at, profiles:profiles!profile_verifications_user_id_fkey(full_name, username, avatar)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data as any as Row[]) ?? [];
    setRows(list);
    const map: Record<string, { selfie: string; portrait: string }> = {};
    await Promise.all(
      list.map(async (r) => {
        const [s, p] = await Promise.all([signedUrl(r.selfie_url), signedUrl(r.portrait_url)]);
        map[r.id] = { selfie: s, portrait: p };
      }),
    );
    setUrls(map);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const approve = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("approve_verification", { _id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Đã duyệt");
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Lý do từ chối?") || "";
    if (!reason.trim()) return;
    setBusy(id);
    const { error } = await supabase.rpc("reject_verification", { _id: id, _reason: reason });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Đã từ chối");
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Duyệt xác thực hồ sơ</h2>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground">Tải lại</button>
      </header>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không có yêu cầu nào đang chờ.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3 mb-3">
                {r.profiles?.avatar ? (
                  <img loading="lazy" decoding="async" src={r.profiles.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{r.profiles?.full_name || r.profiles?.username || r.user_id}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <figure>
                  <img loading="lazy" decoding="async" src={urls[r.id]?.selfie} alt="selfie" className="aspect-square w-full rounded-lg object-cover" />
                  <figcaption className="mt-1 text-[11px] text-center text-muted-foreground">Selfie</figcaption>
                </figure>
                <figure>
                  <img loading="lazy" decoding="async" src={urls[r.id]?.portrait} alt="portrait" className="aspect-square w-full rounded-lg object-cover" />
                  <figcaption className="mt-1 text-[11px] text-center text-muted-foreground">Chân dung</figcaption>
                </figure>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy === r.id}
                  onClick={() => approve(r.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Check size={16} /> Duyệt
                </button>
                <button
                  disabled={busy === r.id}
                  onClick={() => reject(r.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <X size={16} /> Từ chối
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
