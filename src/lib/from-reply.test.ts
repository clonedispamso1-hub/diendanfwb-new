import { describe, it, expect } from "vitest";
import { decideEnqueue, applyComplete, isRealUser, isSecondAccount, parseTemplates, pickTemplate, type ReplyState } from "./from-reply";

const T = { r1: ["Chào bạn"], r2: ["Mình đây"] };
// Mô phỏng trạng thái toàn hệ thống: khoá theo user, KHÔNG theo bot.
function sim() {
  const st = new Map<string, ReplyState>();
  const get = (u: string) => st.get(u) ?? { count: 0, status: "idle" as const };
  return {
    get,
    message(user: string, _bot: string, ok = true) {
      const d = decideEnqueue(get(user), T);
      if (d.result !== "queued") return d;
      st.set(user, { ...get(user), status: "pending" });
      st.set(user, applyComplete(get(user), ok));
      return d;
    },
  };
}

describe("From Reply", () => {
  it("hai user khác nhau nhắn Bot 1 đều bắt đầu 0/2 và dùng lần 1 sau 1 phút", () => {
    const s = sim();
    expect(s.get("A").count).toBe(0);
    expect(s.get("B").count).toBe(0);
    expect(s.message("A", "bot1")).toEqual({ result: "queued", delayMs: 60_000 });
    expect(s.message("B", "bot1")).toEqual({ result: "queued", delayMs: 60_000 });
  });
  it("đã nhận lần 1 ở Bot 1 thì nhắn Bot 2 dùng lần 2 sau 3 phút", () => {
    const s = sim();
    s.message("A", "bot1");
    expect(s.message("A", "bot2")).toEqual({ result: "queued", delayMs: 180_000 });
    expect(s.get("A").count).toBe(2);
  });
  it("đạt 2/2 thì không bot nào trả lời thêm", () => {
    const s = sim();
    s.message("A", "bot1"); s.message("A", "bot1");
    expect(s.message("A", "bot2").result).toBe("done");
    expect(s.get("A").count).toBe(2);
  });
  it("đang có lượt chờ thì tin tiếp theo không tạo lượt trùng", () => {
    expect(decideEnqueue({ count: 0, status: "pending" }, T).result).toBe("busy");
    expect(decideEnqueue({ count: 1, status: "sending" }, T).result).toBe("busy");
  });
  it("chỉ tăng bộ đếm khi gửi thành công", () => {
    expect(applyComplete({ count: 0, status: "sending" }, false).count).toBe(0);
    expect(applyComplete({ count: 0, status: "sending" }, true).count).toBe(1);
    expect(applyComplete({ count: 2, status: "sending" }, true).count).toBe(2);
  });
  it("chưa có mẫu thì không gửi và không tăng", () => {
    expect(decideEnqueue({ count: 0, status: "idle" }, { r1: [" "], r2: ["x"] }).result).toBe("no_template");
    expect(decideEnqueue({ count: 1, status: "idle" }, { r1: ["x"], r2: [] }).result).toBe("no_template");
    expect(pickTemplate([])).toBeNull();
  });
  it("một bot phục vụ nhiều user", () => {
    const s = sim();
    for (const u of ["A", "B", "C", "D"]) expect(s.message(u, "bot1").result).toBe("queued");
  });
  it("Admin, tài khoản thứ hai, mô phỏng không phải user thật", () => {
    expect(isRealUser({ account_source: null })).toBe(true);
    expect(isRealUser({ is_admin: true })).toBe(false);
    expect(isRealUser({ account_source: "internal" })).toBe(false);
    expect(isRealUser({ is_virtual: true })).toBe(false);
    expect(isRealUser({ is_seed_account: true })).toBe(false);
    expect(isSecondAccount({ account_source: "internal" })).toBe(true);
    expect(isSecondAccount({ account_source: null })).toBe(false);
  });
  it("mỗi dòng là một mẫu, bỏ dòng trống", () => {
    expect(parseTemplates("a\n\n b \r\nc")).toEqual(["a", "b", "c"]);
  });
});
