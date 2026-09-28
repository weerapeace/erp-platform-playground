"use client";

// ============================================================
// ปฏิทินรวม (/calendar) — เข้าจากเมนูหน้าหลักได้เลย ไม่ต้องผ่าน Dashboard
// เนื้อในเป็นของกลาง CalendarTabs (ปฏิทินผลิต / ปฏิทินจัดซื้อ — ตัวเดียวกับแท็บปฏิทินใน /dashboard)
// + แท็บเสริม "เดดไลน์ทุกแผนก" (DeadlineCalendar = ปฏิทินรวมตัวเดิมของหน้านี้)
// ============================================================
import { PlaygroundShell } from "@/components/playground-shell";
import { CalendarTabs } from "@/components/calendar-tabs";
import { DeadlineCalendar } from "./deadline-calendar";

export default function CalendarPage() {
  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto w-full">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📅 ปฏิทินรวม</h1>
          <p className="text-sm text-slate-500 mt-1">ปฏิทินผลิต · ปฏิทินจัดซื้อ · เดดไลน์ทุกแผนก — สลับดูได้ในหน้าเดียว</p>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-4 max-w-7xl mx-auto w-full">
        <CalendarTabs
          height="calc(100vh - 200px)"
          extraTabs={[{ key: "deadline", label: "📅 เดดไลน์ทุกแผนก", content: <DeadlineCalendar /> }]}
        />
      </div>
    </PlaygroundShell>
  );
}
