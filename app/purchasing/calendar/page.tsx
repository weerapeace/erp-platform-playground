"use client";

// ============================================================
// ปฏิทินจัดซื้อ (หน้าเต็ม) — เนื้อในทั้งหมดเป็นของกลาง: PurchasingCalendarBoard
// แดชบอร์ดจัดซื้อ (มุมมองปฏิทินในแผงเจาะรายการ) ใช้ component ตัวเดียวกันนี้
// ============================================================
import { PlaygroundShell } from "@/components/playground-shell";
import { PurchasingCalendarBoard } from "@/components/purchasing-calendar-board";

export default function PurchasingCalendarPage() {
  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="w-full">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📅 ปฏิทินจัดซื้อ</h1>
          <p className="text-sm text-slate-500 mt-1">ลากใบสั่งซื้อไปวางบนวัน = ตั้งวัน · เส้นประ = วันกะจากวันสั่ง + วันส่งของร้าน · กดวันที่ = ป๊อปรายการ</p>
        </div>
      </div>

      {/* เต็มความกว้างจอ + ปุ่มเต็มจอ (จำต่อคน) — เจ้าของขอ 2026-11-20 */}
      <div className="px-3 sm:px-4 py-4 w-full">
        <PurchasingCalendarBoard mode="in" fullscreen />
      </div>
    </PlaygroundShell>
  );
}
