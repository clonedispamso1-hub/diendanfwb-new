import { createServerFn } from "@tanstack/react-start";
import {
  upsertMember,
  appendGift,
  appendGem,
  appendLogin,
  setLogout,
  verifyConnection,
  ensureSheets,
  fwbCheckUnique,
  fwbAppendOnboarding,
  fwbGetOnboarding,
  type MemberRow,
  type GiftRow,
  type GemRow,
  type LoginRow,
  type FwbOnboardingRow,
} from "./sheets-sync.server";

export const sheetsVerifyFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const v = await verifyConnection();
    await ensureSheets();
    return { ok: true, verify: v };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
});

export const sheetsUpsertMemberFn = createServerFn({ method: "POST" })
  .inputValidator((d: MemberRow) => d)
  .handler(async ({ data }) => {
    try {
      const r = await upsertMember(data);
      return { ...r, ok: true as const };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

export const sheetsAppendGiftFn = createServerFn({ method: "POST" })
  .inputValidator((d: GiftRow) => d)
  .handler(async ({ data }) => {
    try {
      const r = await appendGift(data);
      return { ...r, ok: true as const };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

export const sheetsAppendGemFn = createServerFn({ method: "POST" })
  .inputValidator((d: GemRow) => d)
  .handler(async ({ data }) => {
    try {
      const r = await appendGem(data);
      return { ...r, ok: true as const };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

export const sheetsAppendLoginFn = createServerFn({ method: "POST" })
  .inputValidator((d: LoginRow) => d)
  .handler(async ({ data }) => {
    try {
      const r = await appendLogin(data);
      return { ...r, ok: true as const };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

export const sheetsSetLogoutFn = createServerFn({ method: "POST" })
  .inputValidator((d: { rowKey: string; logoutTime?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const r = await setLogout(data.rowKey, data.logoutTime);
      return { ...r, ok: true as const };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

export const sheetsFwbCheckUniqueFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email?: string | null; phone?: string | null; excludeUid?: string | null }) => d)
  .handler(async ({ data }) => {
    try {
      const r = await fwbCheckUnique(data);
      return { ok: true as const, ...r };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  });

export const sheetsFwbOnboardFn = createServerFn({ method: "POST" })
  .inputValidator((d: FwbOnboardingRow) => d)
  .handler(async ({ data }) => {
    try {
      const r = await fwbAppendOnboarding(data);
      return { ok: true as const, ...r };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  });

export const sheetsFwbGetFn = createServerFn({ method: "POST" })
  .inputValidator((d: { uid: string }) => d)
  .handler(async ({ data }) => {
    try {
      const r = await fwbGetOnboarding(data.uid);
      return { ok: true as const, row: r };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message ?? e) };
    }
  });
