import { describe, expect, it } from "vitest";

import {
  buildNamePhoneLines,
  buildNamePhoneText,
  canCopyNamePhone,
  countIncomplete,
  pickSelected,
} from "./member-copy";

const A = { id: "1", full_name: "Nguyễn Văn A", phone: "0900000001" };
const B = { id: "2", full_name: "Trần Văn B", phone: "0900000002" };
const C = { id: "3", full_name: "Lê Văn C", phone: "0900000003" };

describe("canCopyNamePhone", () => {
  it("chỉ cho copy khi chọn từ 2 thành viên trở lên", () => {
    expect(canCopyNamePhone(0)).toBe(false);
    expect(canCopyNamePhone(1)).toBe(false);
    expect(canCopyNamePhone(2)).toBe(true);
    expect(canCopyNamePhone(3)).toBe(true);
    expect(canCopyNamePhone(84)).toBe(true);
  });
});

describe("buildNamePhoneText", () => {
  it("3 người đã chọn → đúng 3 dòng '[Tên] [SĐT]' theo thứ tự đã chọn", () => {
    expect(buildNamePhoneText([A, B, C])).toBe(
      "Nguyễn Văn A 0900000001\nTrần Văn B 0900000002\nLê Văn C 0900000003",
    );
    expect(buildNamePhoneLines([A, B, C])).toHaveLength(3);
  });

  it("tên và SĐT luôn thuộc cùng một member (thứ tự đảo vẫn đúng cặp)", () => {
    expect(buildNamePhoneText([C, A, B])).toBe(
      "Lê Văn C 0900000003\nNguyễn Văn A 0900000001\nTrần Văn B 0900000002",
    );
  });

  it("không có dấu phẩy, dấu ngoặc, nhãn, số thứ tự hay dòng trống", () => {
    const text = buildNamePhoneText([A, B, C]);
    expect(text).not.toContain(",");
    expect(text).not.toMatch(/[(){}[\]]/);
    expect(text).not.toMatch(/^(Tên|SĐT|SDT|Name|Phone):/im);
    expect(text).not.toMatch(/^\s*\d+[.)]/m);
    expect(text).not.toContain("\n\n");
    expect(text.split("\n").every((l) => l.trim().length > 0)).toBe(true);
  });

  it("member thiếu SĐT → dòng chỉ có tên, không mượn SĐT của người khác", () => {
    const noPhone = { id: "4", full_name: "Không SĐT", phone: null };
    expect(buildNamePhoneText([A, noPhone, C])).toBe(
      "Nguyễn Văn A 0900000001\nKhông SĐT\nLê Văn C 0900000003",
    );
    expect(buildNamePhoneText([A, noPhone, C]).split("\n")).toHaveLength(3);
  });

  it("member thiếu tên → dòng chỉ có SĐT của chính người đó", () => {
    const noName = { id: "5", full_name: "   ", phone: "0900000005" };
    expect(buildNamePhoneText([noName, A])).toBe("0900000005\nNguyễn Văn A 0900000001");
  });

  it("rút gọn khoảng trắng thừa trong tên, giữ nguyên SĐT", () => {
    expect(buildNamePhoneText([{ id: "6", full_name: "  Quân   000111203012 ", phone: "000111203012" }]))
      .toBe("Quân 000111203012 000111203012");
  });

  it("countIncomplete đếm đúng số member thiếu tên/SĐT", () => {
    const noPhone = { id: "4", full_name: "Không SĐT", phone: null };
    const noName = { id: "5", full_name: "", phone: "0900000005" };
    expect(countIncomplete([A, B, noPhone, noName])).toBe(2);
    expect(countIncomplete([A, B, C])).toBe(0);
  });
});

describe("pickSelected", () => {
  const rows = [A, B, C, { id: "4", full_name: "Không SĐT", phone: null }];
  const visible = [C, A, B]; // danh sách đang hiển thị (đã lọc/sắp xếp)

  it("lấy đúng các member đang chọn, theo thứ tự hiển thị", () => {
    expect(pickSelected(visible, rows, new Set(["1", "3"])).map((r) => r.id)).toEqual(["3", "1"]);
  });

  it("không thêm member chưa được chọn", () => {
    expect(pickSelected(visible, rows, new Set(["1", "2"])).map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("member đã chọn nhưng không còn trong danh sách hiển thị vẫn được giữ (nối cuối)", () => {
    const picked = pickSelected(visible, rows, new Set(["1", "2", "4"]));
    expect(picked.map((r) => r.id)).toEqual(["1", "2", "4"]);
    expect(picked).toHaveLength(3);
  });

  it("chọn tất cả → số dòng bằng số member đã chọn", () => {
    const all = new Set(rows.map((r) => r.id));
    const picked = pickSelected(visible, rows, all);
    expect(picked).toHaveLength(4);
    expect(buildNamePhoneText(picked).split("\n")).toHaveLength(4);
  });
});
