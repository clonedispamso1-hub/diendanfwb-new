/**
 * V6 — Cấu hình Mini Chat / Trợ lý (không hardcode).
 * Đọc từ admin_site_settings key = 'assistant_config'.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AssistantPages = {
  home: boolean;
  profile: boolean;
  live: boolean;
  wallet: boolean;
  post: boolean;
};

export type AssistantConfig = {
  enabled: boolean;
  title: string;
  subtitle: string;
  game_url: string;
  admin_url: string;
  /** Link "Liên hệ Admin" theo từng kênh — cấu hình trong Admin Panel, không hardcode. */
  facebook_url: string;
  zalo_url: string;
  telegram_url: string;
  pages: AssistantPages;
};

export const ASSISTANT_DEFAULT: AssistantConfig = {
  enabled: true,
  title: "Xin chào 👋",
  subtitle: "Tôi có thể giúp gì?",
  game_url: "/taixiu",
  admin_url: "",
  facebook_url: "",
  zalo_url: "",
  telegram_url: "",
  pages: { home: true, profile: true, live: true, wallet: true, post: true },
};

let cached: AssistantConfig | null = null;
let inflight: Promise<AssistantConfig> | null = null;

function normalize(v: any): AssistantConfig {
  const p = v?.pages ?? {};
  return {
    enabled: v?.enabled !== false,
    title: typeof v?.title === "string" && v.title.trim() ? v.title : ASSISTANT_DEFAULT.title,
    subtitle:
      typeof v?.subtitle === "string" && v.subtitle.trim() ? v.subtitle : ASSISTANT_DEFAULT.subtitle,
    game_url: typeof v?.game_url === "string" && v.game_url.trim() ? v.game_url.trim() : ASSISTANT_DEFAULT.game_url,
    admin_url: typeof v?.admin_url === "string" ? v.admin_url.trim() : "",
    facebook_url: typeof v?.facebook_url === "string" ? v.facebook_url.trim() : "",
    zalo_url: typeof v?.zalo_url === "string" ? v.zalo_url.trim() : "",
    telegram_url: typeof v?.telegram_url === "string" ? v.telegram_url.trim() : "",
    pages: {
      home: p.home !== false,
      profile: p.profile !== false,
      live: p.live !== false,
      wallet: p.wallet !== false,
      post: p.post !== false,
    },
  };
}

export async function fetchAssistantConfig(): Promise<AssistantConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await (supabase as any)
        .from("admin_site_settings")
        .select("value")
        .eq("key", "assistant_config")
        .maybeSingle();
      cached = normalize(data?.value ?? {});
    } catch {
      cached = ASSISTANT_DEFAULT;
    } finally {
      inflight = null;
    }
    return cached as AssistantConfig;
  })();
  return inflight;
}

export function invalidateAssistantConfig() {
  cached = null;
}

export const ASSISTANT_EVENT = "assistant-config-changed";

export function useAssistantConfig(): AssistantConfig {
  const [cfg, setCfg] = useState<AssistantConfig>(cached ?? ASSISTANT_DEFAULT);
  useEffect(() => {
    let alive = true;
    void fetchAssistantConfig().then((c) => { if (alive) setCfg(c); });
    const on = () => {
      invalidateAssistantConfig();
      void fetchAssistantConfig().then((c) => { if (alive) setCfg(c); });
    };
    window.addEventListener(ASSISTANT_EVENT, on);
    return () => { alive = false; window.removeEventListener(ASSISTANT_EVENT, on); };
  }, []);
  return cfg;
}
