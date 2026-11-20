"use client";

// ============================================================
// ปฏิทินรวม (/calendar) — เข้าจากเมนูหน้าหลักได้เลย ไม่ต้องผ่าน Dashboard
// เต็มหน้า ไม่มีหัวหน้า (เจ้าของขอ: ให้พื้นที่กับปฏิทินทั้งหมด)
// แท็บแรก "รวมทุกปฏิทิน" = ทุกอย่างที่มีวันที่ในระบบ ลากเปลี่ยนวันได้ที่เดียว (UnifiedCalendar · 2026-11-20)
// ต่อด้วยของกลาง CalendarTabs (ปฏิทินผลิต / จัดซื้อ / จัดการงาน / คอนเทนต์ / แผนงานทีม) + "เดดไลน์ทุกแผนก"
// Ctrl+คลิก / Ctrl+ลาก แท็บ = แบ่งจอ (components/split-screen)
// ============================================================
import { PlaygroundShell } from "@/components/playground-shell";
import { CalendarTabs } from "@/components/calendar-tabs";
import { DeadlineCalendar } from "./deadline-calendar";
import { UnifiedCalendar } from "./unified-calendar";

export default function CalendarPage() {
  return (
    <PlaygroundShell>
      <CalendarTabs
        fill
        extraTabs={[
          { key: "all", label: "🧭 รวมทุกปฏิทิน", content: <UnifiedCalendar />, lead: true },
          { key: "deadline", label: "📅 เดดไลน์ทุกแผนก", content: <DeadlineCalendar /> },
        ]}
      />
    </PlaygroundShell>
  );
}
