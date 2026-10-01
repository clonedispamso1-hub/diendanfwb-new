import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom chưa có Element.scrollTo (dùng bởi thanh quận/huyện).
if (typeof Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
});

