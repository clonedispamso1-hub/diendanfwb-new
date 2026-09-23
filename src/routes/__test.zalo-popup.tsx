import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ZaloGroupsPrototype } from "@/components/candy/zalo-groups-prototype";

function TestZaloPopupHarness() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <button onClick={() => setOpen(true)} style={{ color: "#fff", padding: "12px 20px" }}>
        Mở popup
      </button>
      {open ? <ZaloGroupsPrototype open={open} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export const Route = createFileRoute("/__test/zalo-popup")({
  head: () => ({
    meta: [
      { title: "Test Zalo Popup | Internal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TestZaloPopupHarness,
});
