import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";

export const Route = createFileRoute("/__test/guide-tab")({
  component: GuideTabTestPage,
});

type Tab = "foryou" | "following";

function GuideTabTestPage() {
  const [activeTab, setActiveTab] = useState<Tab>("foryou");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const go = () => setActiveTab("following");
    window.addEventListener("goto-vip-zalo-tab", go);
    return () => window.removeEventListener("goto-vip-zalo-tab", go);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Test: Hướng dẫn tham gia → tab Vip Zalo</h1>

      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "foryou"}
          className={`px-4 py-2 rounded-lg font-semibold ${
            activeTab === "foryou" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setActiveTab("foryou")}
        >
          For You
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "following"}
          className={`px-4 py-2 rounded-lg font-semibold ${
            activeTab === "following" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setActiveTab("following")}
        >
          Vip Zalo Tham Gia
        </button>
      </div>

      <p data-testid="active-tab" className="text-lg">
        Active tab: <span className="font-bold">{activeTab}</span>
      </p>

      <button
        type="button"
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold"
        onClick={() => setOpen(true)}
      >
        Mở popup khoá tính năng
      </button>

      <CommonLockedPopup open={open} onClose={() => setOpen(false)} featureName="Xem số Zalo" />
    </div>
  );
}
