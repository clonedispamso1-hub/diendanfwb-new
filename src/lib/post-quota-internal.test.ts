import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db/router", () => ({ supabase: { rpc: vi.fn() } }));
import { insertInternalPost } from "./post-quota";

function clients(rpcResult: any) {
  const inserted: any[] = [];
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const client = { from: () => ({ insert: (rows: any[]) => { inserted.push(...rows); return Promise.resolve({ data: null, error: null }); } }) };
  return { inserted, rpc, client, rpcClient: { rpc } };
}

describe("second account internal post ticket", () => {
  it("attaches the server-signed internal ticket and never calls the paid reserve_post_slot", async () => {
    const c = clients({ data: { ok: true, ticket: "n.acc.internal.9.sig" }, error: null });
    await insertInternalPost(c.client, c.rpcClient, { user_id: "acc", content: "x" });
    expect(c.rpc).toHaveBeenCalledWith("reserve_internal_post_ticket", { p_account_id: "acc" });
    expect(c.rpc).not.toHaveBeenCalledWith("reserve_post_slot", expect.anything());
    expect(c.inserted[0].post_ticket).toBe("n.acc.internal.9.sig");
  });
  it("does not insert when the server refuses (not admin / not second account)", async () => {
    const c = clients({ data: { ok: false, code: "FORBIDDEN", message: "no" }, error: null });
    await expect(insertInternalPost(c.client, c.rpcClient, { user_id: "acc" })).rejects.toThrow();
    expect(c.inserted.length).toBe(0);
  });
});
