import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/huongdan")({
  head: () => ({
    meta: [
      { title: "Hướng dẫn — Diễn Đàn FWB" },
      { name: "description", content: "Hướng dẫn sử dụng Diễn Đàn FWB." },
      { property: "og:title", content: "Hướng dẫn — Diễn Đàn FWB" },
      { property: "og:description", content: "Hướng dẫn sử dụng Diễn Đàn FWB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HuongDanPage,
});

function HuongDanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data.user) {
          navigate({ to: "/", replace: true });
        } else {
          setAuthed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useLayoutEffect(() => {
    if (!ready || !authed) return;
    const hash = (location.hash || "").replace(/^#/, "");
    if (hash !== "vip-zalo-tham-gia") return;
    const el = document.getElementById("vip-zalo-tham-gia");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ready, authed, location.hash]);

  if (!ready || !authed) return null;

  return (
    <main style={{ minHeight: "100dvh", padding: 24 }}>
      <h1 id="vip-zalo-tham-gia">Vip Zalo Tham Gia</h1>
    </main>
  );
}
