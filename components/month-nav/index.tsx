"use client";

/**
 * ของกลาง — ตัวเลือกเดือน  ◀ [เดือน/ปี] ▶  (+ ปุ่ม "เดือนนี้" เมื่อไม่ได้อยู่เดือนปัจจุบัน)
 *
 * ใช้ในหน้ารายงานรายเดือนทุกหน้า (สรุปยอดขาย / รายงานภาษีขาย ...) — อยากเปลี่ยนหน้าตา/พฤติกรรม แก้ที่นี่ที่เดียว
 * ค่า value เป็น "YYYY-MM" · helper คำนวณเดือนอยู่ที่ lib/month.ts (ไม่มี "use client" → API ใช้ได้ด้วย)
 *
 *   <MonthNav value={month} onChange={setMonth} />
 */
import { shiftMonth, thisMonth } from "@/lib/month";

export function MonthNav({ value, onChange, showToday = true, className = "" }: {
  value: string;
  onChange: (ym: string) => void;
  /** โชว์ปุ่ม "เดือนนี้" เมื่อเลือกเดือนอื่นอยู่ (ค่าเริ่มต้น: โชว์) */
  showToday?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
        <button type="button" onClick={() => onChange(shiftMonth(value, -1))}
          className="h-9 px-2.5 text-slate-500 hover:bg-slate-50" title="เดือนก่อน" aria-label="เดือนก่อน">◀</button>
        <input type="month" value={value} onChange={e => e.target.value && onChange(e.target.value)}
          className="h-9 px-2 text-sm border-x border-slate-200 outline-none" aria-label="เลือกเดือน" />
        <button type="button" onClick={() => onChange(shiftMonth(value, 1))}
          className="h-9 px-2.5 text-slate-500 hover:bg-slate-50" title="เดือนถัดไป" aria-label="เดือนถัดไป">▶</button>
      </div>
      {showToday && value !== thisMonth() && (
        <button type="button" onClick={() => onChange(thisMonth())}
          className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">เดือนนี้</button>
      )}
    </div>
  );
}
