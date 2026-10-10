import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";

// Mô phỏng: getUser() = 1 request GET /auth/v1/user.
const { getUser, fetchCurrentBangchu } = vi.hoisted(() => {
  const getUser = vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null }));
  const fetchCurrentBangchu = vi.fn(async () => {
    await getUser();
    return { id: "b1", auth_user_id: "u1", username: "bangchu", role: "admin_1", status: "approved", is_active: true } as any;
  });
  return { getUser, fetchCurrentBangchu };
});

vi.mock("@/integrations/supabase/admin-client", () => ({
  supabaseAdminSession: { auth: { getUser, signOut: vi.fn(async () => ({})) } },
  fetchCurrentBangchu: () => fetchCurrentBangchu(),
}));

const router = vi.hoisted(() => ({ navigate: vi.fn(), history: { go: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => router,
  useRouterState: () => ({}),
  Link: () => null,
}));

vi.mock("@/components/candy/auth-provider", () => ({ AuthProvider: ({ children }: any) => children }));
vi.mock("@/components/candy/notification-provider", () => ({ NotificationProvider: ({ children }: any) => children }));
vi.mock("@/components/candy/app-loading", () => ({ AppLoading: () => <div>loading</div> }));
vi.mock("@/lib/admin-slug", () => ({ adminPath: (p: string) => `/admin${p}` }));
vi.mock("@/components/admin-v2/AdminV2Shell", () => ({ AdminV2Shell: () => <div>v2</div> }));

// Shell giả: liên tục cập nhật state mỗi giây (như đồng hồ, badge, realtime)
// để buộc toàn bộ cây render lại trong suốt thời gian mở Admin Panel.
const counters = vi.hoisted(() => ({ shellRenders: 0 }));
vi.mock("@/components/admin-v3/AdminV3Shell", async () => {
  const { useEffect, useState } = await import("react");
  return { AdminV3Shell: () => {
    const [n, setN] = useState(0);
    counters.shellRenders++;
    useEffect(() => {
      const t = setInterval(() => setN((x) => x + 1), 1000);
      return () => clearInterval(t);
    }, []);
    return <div>panel {n}</div>;
  } };
});

import AdminPage from "./AdminPage";

afterEach(() => vi.useRealTimers());

describe("AdminPage chạy dài", () => {
  it("10 phút mở Admin Panel + re-render liên tục → fetchCurrentBangchu/getUser chỉ gọi 1 lần", async () => {
    vi.useFakeTimers();
    // Parent cũng re-render định kỳ (mô phỏng cập nhật state ở tầng trên).
    function Host() {
      const [, setK] = useState(0);
      useEffect(() => {
        const t = setInterval(() => setK((k) => k + 1), 700);
        return () => clearInterval(t);
      }, []);
      return <AdminPage />;
    }
    render(<Host />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByText(/panel/)).toBeTruthy();

    const samples: number[] = [];
    for (let minute = 0; minute < 10; minute++) {
      for (let sec = 0; sec < 60; sec++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      }
      samples.push(getUser.mock.calls.length);
    }
    console.log("shellRenders", counters.shellRenders, "getUser", getUser.mock.calls.length);
    expect(counters.shellRenders).toBeGreaterThan(500); // thực sự đã render lại rất nhiều
    expect(fetchCurrentBangchu).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(new Set(samples).size).toBe(1); // không tăng theo thời gian
  });
});
