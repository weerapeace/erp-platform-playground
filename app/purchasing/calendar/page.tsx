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
        <div className="max-w-5xl mx-auto w-full">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">📅 ปฏิทินจัดซื้อ</h1>
          <p className="text-sm text-slate-500 mt-1">ลากใบสั่งซื้อไปวางบนวัน = ตั้งวัน · กด ⚑ = ติดตาม (งานเร่ง)</p>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 max-w-5xl mx-auto w-full">
        <PurchasingCalendarBoard mode="in" />
      </div>
    </PlaygroundShell>
  );
}
