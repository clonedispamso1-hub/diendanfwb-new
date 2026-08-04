/**
 * GuidePage — "Hướng Dẫn" knowledge center.
 *
 * Loads guide articles from `public.guides` (Supabase). Admins & staff can
 * manage articles from the Admin Panel. This page is read-only for all users.
 *
 * Mobile-first card grid → tap card → in-place readable article view.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Pin, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_GUIDES } from "./guide-default-content";

export type GuideRow = {
  id: string;
  slug: string | null;
  title: string;
  category: string | null;
  excerpt: string | null;
  body: string | null;
  cover_url: string | null;
  is_pinned: boolean | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const DEFAULTS_AS_ROWS: GuideRow[] = DEFAULT_GUIDES.map((g) => ({
  id: g.id,
  slug: null,
  title: g.title,
  category: g.category,
  excerpt: g.excerpt,
  body: g.body,
  cover_url: null,
  is_pinned: g.is_pinned ?? false,
  sort_order: g.sort_order ?? 100,
  created_at: null,
  updated_at: null,
}));

async function fetchGuides(): Promise<GuideRow[]> {
  const { data, error } = await (supabase.from("guides") as any)
    .select("id, slug, title, category, excerpt, body, cover_url, is_pinned, sort_order, created_at, updated_at")
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GuideRow[];
}

export function GuidePage() {
  const [rows, setRows] = useState<GuideRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GuideRow | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchGuides();
      const dbTitles = new Set(list.map((r) => r.title.trim().toLowerCase()));
      const merged = [
        ...list,
        ...DEFAULTS_AS_ROWS.filter((d) => !dbTitles.has(d.title.trim().toLowerCase())),
      ];
      setRows(merged);
    } catch {
      // Fall back to defaults so the Guide Center is never empty.
      setRows(DEFAULTS_AS_ROWS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, GuideRow[]>();
    for (const g of rows ?? []) {
      const k = (g.category?.trim() || "Khác");
      const arr = map.get(k) ?? [];
      arr.push(g);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [rows]);

  if (selected) {
    return (
      <div style={{ padding: "16px 14px 96px", maxWidth: 760, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => setSelected(null)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            border: "1px solid var(--border, #e5e7eb)", background: "transparent",
            padding: "6px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
            marginBottom: 14,
          }}
        >
          <ArrowLeft size={14} /> Quay lại
        </button>

        {selected.cover_url ? (
          <img loading="lazy" decoding="async"
            src={selected.cover_url}
            alt=""
            style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 16, marginBottom: 16 }}
          />
        ) : null}

        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.6, marginBottom: 6 }}>
          {selected.category || "Hướng dẫn"}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>
          {selected.title}
        </h1>

        <article
          style={{ fontSize: 16, lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          // Body is authored by admins in a trusted admin panel; render as HTML.
          dangerouslySetInnerHTML={{ __html: selected.body || "" }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 14px 96px", maxWidth: 960, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg,#ffd580,#ff8ac1)",
            display: "grid", placeItems: "center", color: "#fff",
            boxShadow: "0 6px 20px rgba(255,138,193,.35)",
          }}
        >
          <BookOpen size={20} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>Hướng dẫn</h1>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Kiến thức, mẹo và quy tắc cộng đồng — cập nhật liên tục.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Tải lại"
          title="Tải lại"
          style={{
            marginLeft: "auto", width: 34, height: 34, borderRadius: 10,
            border: "1px solid var(--border,#e5e7eb)", background: "transparent",
            display: "grid", placeItems: "center", cursor: "pointer",
          }}
        >
          <RefreshCw size={14} style={{ opacity: loading ? 0.5 : 1 }} />
        </button>
      </header>

      {err ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#fee2e2", color: "#991b1b", fontSize: 13, marginTop: 12 }}>
          {err}
        </div>
      ) : null}

      {loading && !rows?.length ? (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.6, fontSize: 14 }}>Đang tải…</div>
      ) : null}

      {!loading && rows && rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.65, fontSize: 14, marginTop: 20 }}>
          <Sparkles size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div>Chưa có bài hướng dẫn nào. Admin sẽ sớm cập nhật.</div>
        </div>
      ) : null}

      {grouped.map(([cat, items]) => (
        <section key={cat} style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.65, marginBottom: 10 }}>
            {cat}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {items.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelected(g)}
                style={{
                  textAlign: "left", cursor: "pointer",
                  border: "1px solid var(--border,#e5e7eb)",
                  borderRadius: 16, overflow: "hidden",
                  background: "var(--card, #fff)",
                  display: "flex", flexDirection: "column",
                  transition: "transform .15s ease, box-shadow .15s ease",
                  boxShadow: "0 2px 8px rgba(15,23,42,.04)",
                }}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.985)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
              >
                {g.cover_url ? (
                  <img loading="lazy" decoding="async" src={g.cover_url} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }} />
                ) : (
                  <div
                    style={{
                      aspectRatio: "16/9",
                      background: "linear-gradient(135deg,#fde68a,#fca5a5)",
                      display: "grid", placeItems: "center",
                      color: "#7c2d12",
                    }}
                  >
                    <BookOpen size={30} />
                  </div>
                )}
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {g.is_pinned ? (
                      <Pin size={12} style={{ color: "#f59e0b" }} />
                    ) : null}
                    <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {g.category || "Hướng dẫn"}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{g.title}</div>
                  {g.excerpt ? (
                    <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {g.excerpt}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default GuidePage;
