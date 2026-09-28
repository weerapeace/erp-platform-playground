"use client";

/**
 * CalendarTabs (ของกลาง) — แท็บสลับ ปฏิทินผลิต / ปฏิทินจัดซื้อ (ฝังหน้าจริง ?embed=1)
 * + ปุ่ม "เปิดใหญ่" → popup ปรับขนาดได้ · single-source ไม่เขียนใหม่
 * ใช้ที่: แท็บปฏิทินใน /dashboard · หน้า /calendar (ปฏิทินรวม)
 *   - height: ความสูงกรอบปฏิทิน (ค่าเริ่มต้น 620 · หน้าเต็มส่ง "calc(100vh - …)" ได้)
 *   - extraTabs: แท็บเสริมต่อท้าย (เนื้อหาเป็น component ปกติ ไม่ใช่ iframe)
 */
import { useState, type ReactNode } from "react";
import { EmbedModal } from "@/components/embed-modal";

export type CalendarExtraTab = { key: string; label: string; content: ReactNode };

const MIN_HEIGHT = 520;

export function CalendarTabs({ height = 620, extraTabs = [] }: { height?: number | string; extraTabs?: CalendarExtraTab[] }) {
  const [tab, setTab] = useState<string>("prod");
  const [big, setBig] = useState(false);
  const extra = extraTabs.find((t) => t.key === tab);
  const src = tab === "prod" ? "/master/production-dashboard?embed=1&view=calendar" : "/purchasing/calendar?embed=1";
  const full = tab === "prod" ? "/master/production-dashboard?view=calendar" : "/purchasing/calendar";
  const label = tab === "prod" ? "ปฏิทินผลิต" : "ปฏิทินจัดซื้อ";
  const btn = (on: boolean) => `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${on ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-slate-100">
        <div className="inline-flex flex-wrap bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setTab("prod")} className={btn(tab === "prod")}>🏭 ปฏิทินผลิต</button>
          <button onClick={() => setTab("buy")} className={btn(tab === "buy")}>🛒 ปฏิทินจัดซื้อ</button>
          {extraTabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={btn(tab === t.key)}>{t.label}</button>
          ))}
        </div>
        {!extra && <button onClick={() => setBig(true)} className="ml-auto text-xs text-blue-600 hover:underline">⤢ เปิดใหญ่</button>}
      </div>
      {extra ? (
        <div className="overflow-y-auto bg-slate-50" style={{ height, minHeight: MIN_HEIGHT }}>{extra.content}</div>
      ) : (
        <iframe key={tab} src={src} title={label} className="w-full border-0 bg-slate-50" style={{ height, minHeight: MIN_HEIGHT }} />
      )}
      {big && !extra && <EmbedModal url={full} title={label} onClose={() => setBig(false)} />}
    </div>
  );
}
