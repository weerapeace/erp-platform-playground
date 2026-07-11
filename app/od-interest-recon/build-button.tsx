"use client";
// ปุ่มคำนวณประมาณการดอกเบี้ยรายเดือน (จาก daily balances) — headerActions ของหน้ากระทบยอด
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function ReconBuildButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/od-recon/build", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { alert(j?.error || "คำนวณไม่สำเร็จ"); setBusy(false); return; }
      if (typeof window !== "undefined") window.location.reload();
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
      setBusy(false);
    }
  };
  return (
    <button onClick={run} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
      {busy ? "กำลังคำนวณ..." : "🔄 คำนวณประมาณการ"}
    </button>
  );
}
