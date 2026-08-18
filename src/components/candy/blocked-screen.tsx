/**
 * Màn hình chặn Level 3 — giao diện tối giản kiểu "404: NOT_FOUND".
 * Không logo, không lý do, không nút bấm, không gọi backend.
 * ID sinh ngẫu nhiên mỗi lần tải trang.
 */
import { useEffect, useState } from "react";

function randomId(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function BlockedScreen(_props: { info?: unknown }) {
  const [id, setId] = useState("");

  useEffect(() => {
    setId(randomId());
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          border: "1px solid #eaeaea",
          borderRadius: "8px",
          padding: "28px 24px",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          color: "#000000",
          backgroundColor: "#ffffff",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 600 }}>404: NOT_FOUND</div>
        <div style={{ marginTop: "16px", fontSize: "13px", color: "#666666" }}>
          Code:
          <div style={{ color: "#000000" }}>DEPLOYMENT_NOT_FOUND</div>
        </div>
        <div style={{ marginTop: "14px", fontSize: "13px", color: "#666666" }}>
          ID:
          <div style={{ color: "#000000", wordBreak: "break-all" }}>{id}</div>
        </div>
      </div>
    </main>
  );
}
