/**
 * ĐẠI LÝ — danh sách đại lý được Admin chọn từ "Tài khoản thứ hai" có sẵn.
 *
 * Lưu tại `admin_site_settings.key = 'agents_config'`:
 *   { guide: string, agents: [{ id, name, avatar, uid, level }] }
 *
 * KHÔNG tạo tài khoản mới, KHÔNG bảng mới, KHÔNG chạm wallet/Xu/Auth.
 */
import { useEffect, useState } from "react";
import { adminSetSiteSetting } from "@/lib/admin-db";
import { getSiteSetting } from "@/lib/site-settings-cache";

export const AGENTS_KEY = "agents_config";
export const AGENTS_EVENT = "agents-config-changed";

export interface AgentEntry {
  /** profiles.id của tài khoản thứ hai đã có sẵn */
  id: string;
  name: string;
  avatar: string | null;
  uid: string | null;
  /** Mức giao dịch, ví dụ "50.000 – 5.000.000 xu" */
  level: string;
}

export interface AgentsConfig {
  guide: string;
  agents: AgentEntry[];
}

export const DEFAULT_AGENTS_CONFIG: AgentsConfig = { guide: "", agents: [] };

let cached: AgentsConfig | null = null;
let inflight: Promise<AgentsConfig> | null = null;

function normalize(raw: unknown): AgentsConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(v.agents) ? v.agents : [];
  const agents: AgentEntry[] = [];
  for (const it of list) {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id || agents.some((a) => a.id === id)) continue;
    agents.push({
      id,
      name: typeof o.name === "string" ? o.name : "",
      avatar: typeof o.avatar === "string" && o.avatar ? o.avatar : null,
      uid: typeof o.uid === "string" && o.uid ? o.uid : null,
      level: typeof o.level === "string" ? o.level : "",
    });
  }
  return { guide: typeof v.guide === "string" ? v.guide : "", agents };
}

export async function fetchAgentsConfig(): Promise<AgentsConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      cached = normalize(await getSiteSetting(AGENTS_KEY));
    } catch {
      cached = DEFAULT_AGENTS_CONFIG;
    } finally {
      inflight = null;
    }
    return cached as AgentsConfig;
  })();
  return inflight;
}

export function invalidateAgentsConfig(): void {
  cached = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AGENTS_EVENT));
}

export async function saveAgentsConfig(cfg: AgentsConfig): Promise<void> {
  await adminSetSiteSetting(AGENTS_KEY, normalize(cfg));
  invalidateAgentsConfig();
}

export function useAgentsConfig(): { cfg: AgentsConfig; loading: boolean } {
  const [cfg, setCfg] = useState<AgentsConfig>(cached ?? DEFAULT_AGENTS_CONFIG);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchAgentsConfig().then((v) => {
        if (!alive) return;
        setCfg(v);
        setLoading(false);
      });
    };
    load();
    const on = () => {
      cached = null;
      load();
    };
    window.addEventListener(AGENTS_EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(AGENTS_EVENT, on);
    };
  }, []);
  return { cfg, loading };
}
