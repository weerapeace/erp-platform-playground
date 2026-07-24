"use client";

/**
 * CalendarTabs (ของกลาง) — แท็บสลับ ปฏิทินผลิต / ปฏิทินจัดซื้อ (ฝังหน้าจริง ?embed=1)
 * + ปุ่ม "เปิดใหญ่" → popup ปรับขนาดได้ · single-source ไม่เขียนใหม่
 */
import { useState } from "react";
import { EmbedModal } from "@/components/embed-modal";

export function CalendarTabs() {
  const [tab, setTab] = useState<"prod" | "buy">("prod");
  const [big, setBig] = useState(false);
  const src = tab === "prod" ? "/master/production-dashboard?embed=1&view=calendar" : "/purchasing/calendar?embed=1";
  const full = tab === "prod" ? "/master/production-dashboard?view=calendar" : "/purchasing/calendar";
  const label = tab === "prod" ? "ปฏิทินผลิต" : "ปฏิทินจัดซื้อ";
  const btn = (on: boolean) => `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${on ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setTab("prod")} className={btn(tab === "prod")}>🏭 ปฏิทินผลิต</button>
          <button onClick={() => setTab("buy")} className={btn(tab === "buy")}>🛒 ปฏิทินจัดซื้อ</button>
        </div>
        <button onClick={() => setBig(true)} className="ml-auto text-xs text-blue-600 hover:underline">⤢ เปิดใหญ่</button>
      </div>
      <iframe key={tab} src={src} title={label} className="w-full border-0 bg-slate-50" style={{ height: 620 }} />
      {big && <EmbedModal url={full} title={label} onClose={() => setBig(false)} />}
    </div>
  );
}
