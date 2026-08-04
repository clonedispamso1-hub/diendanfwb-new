import { useMemo, type ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "@/components/candy/auth-provider";
import type { Profile } from "@/lib/app-types";

/**
 * MockAuthProvider — chỉ dùng cho test-harness `/__test/feed`.
 *
 * Nhồi thẳng vào `AuthContext` một `me` giả để `FeedPage` có thể render mà
 * KHÔNG cần Supabase Auth thật. Không cover bất kỳ route thật nào.
 */
export function MockAuthProvider({
  children,
  me,
}: {
  children: ReactNode;
  me?: Partial<Profile>;
}) {
  const value = useMemo<AuthContextValue>(() => {
    const fullMe = {
      id: "test-user-id",
      full_name: "Playwright Tester",
      username: "playwright",
      avatar: null,
      vip_level: 0,
      is_admin: false,
      gender: "male",
      province: "Hà Nội",
      location: "Hà Nội",
      intent: "fwb",
      created_at: new Date().toISOString(),
      gem_balance: 0,
      account_status: "active",
      ...(me ?? {}),
    } as unknown as Profile;
    return {
      session: { user: { id: fullMe.id } } as any,
      me: fullMe,
      ready: true,
      isAdmin: (fullMe as any).is_admin === true,
      login: async () => ({ success: true }),
      register: async () => ({ success: true }),
      logout: async () => {},
      refreshMe: async () => {},
      applyGemDelta: () => {},
      setGemBalance: () => {},
    };
  }, [me]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
