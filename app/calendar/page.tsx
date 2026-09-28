"use client";

// ============================================================
// ปฏิทินรวม (/calendar) — เข้าจากเมนูหน้าหลักได้เลย ไม่ต้องผ่าน Dashboard
// เต็มหน้า ไม่มีหัวหน้า (เจ้าของขอ: ให้พื้นที่กับปฏิทินทั้งหมด)
// เนื้อในเป็นของกลาง CalendarTabs (ปฏิทินผลิต / ปฏิทินจัดซื้อ — ตัวเดียวกับแท็บปฏิทินใน /dashboard)
// + แท็บเสริม "เดดไลน์ทุกแผนก" (DeadlineCalendar = ปฏิทินรวมตัวเดิมของหน้านี้)
// ============================================================
import { PlaygroundShell } from "@/components/playground-shell";
import { CalendarTabs } from "@/components/calendar-tabs";
import { DeadlineCalendar } from "./deadline-calendar";

export default function CalendarPage() {
  return (
    <PlaygroundShell>
      <CalendarTabs
        fill
        extraTabs={[{ key: "deadline", label: "📅 เดดไลน์ทุกแผนก", content: <DeadlineCalendar /> }]}
      />
    </PlaygroundShell>
  );
}
