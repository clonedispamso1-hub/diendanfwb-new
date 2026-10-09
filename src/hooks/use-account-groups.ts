import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb4 } from "@/lib/supabase-v4";
import { fetchAllSeedGroups, SEED_ACCOUNT_GROUPS_TABLE, type SeedAccountGroupRow, type SeedGroupOption } from "@/lib/seed-account-groups";

export function uniqueAccountGroups(groups: SeedGroupOption[]): SeedGroupOption[] {
  return [...new Map(groups.map((group) => [`${group.kind}:${group.id}`, group])).values()];
}

type Pending = { resolve: (groups: SeedGroupOption[]) => void; reject: (error: unknown) => void };
// A query-cache-scoped queue: posts in one render share a membership read.
// This is only a read cache, never durable application state.
const queues = new WeakMap<QueryClient, Map<string, Pending>>();

function loadAccountGroups(client: QueryClient, accountId: string): Promise<SeedGroupOption[]> {
  return new Promise((resolve, reject) => {
    let queue = queues.get(client);
    if (!queue) {
      queue = new Map();
      queues.set(client, queue);
      queueMicrotask(() => {
        const pending = queues.get(client);
        queues.delete(client);
        if (!pending) return;
        void (async () => {
          try {
            const ids = [...pending.keys()];
            const rows: SeedAccountGroupRow[] = [];
            for (let i = 0; i < ids.length; i += 200) {
              // Public reader, same visibility as the original browser popup.
              const { data, error } = await sb4().from(SEED_ACCOUNT_GROUPS_TABLE)
                .select("account_id, group_kind, group_id").in("account_id", ids.slice(i, i + 200));
              if (error) throw error;
              rows.push(...(data ?? []) as SeedAccountGroupRow[]);
            }
            const catalogue = rows.length ? await client.fetchQuery({
              queryKey: ["visible-account-group-catalogue", "public"],
              queryFn: () => fetchAllSeedGroups({ strict: true }),
              staleTime: 60_000,
              retry: false,
            }) : [];
            const byKey = new Map(catalogue.map((group) => [`${group.kind}:${group.id}`, group]));
            const byAccount = new Map<string, SeedGroupOption[]>();
            for (const row of rows) {
              const group = byKey.get(`${row.group_kind}:${row.group_id}`);
              if (!group) continue; // Never count an unavailable/inaccessible group.
              const list = byAccount.get(row.account_id) ?? [];
              list.push(group);
              byAccount.set(row.account_id, list);
            }
            for (const [id, request] of pending) request.resolve(uniqueAccountGroups(byAccount.get(id) ?? []));
          } catch (error) {
            for (const request of pending.values()) request.reject(error);
          }
        })();
      });
    }
    queue.set(accountId, { resolve, reject });
  });
}

export function useAccountGroups(accountId: string, enabled = true) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["visible-account-groups", "public", accountId],
    queryFn: () => loadAccountGroups(client, accountId),
    enabled: enabled && Boolean(accountId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
}