"use client";

/**
 * 📅 DispatchDatePick — ช่อง "วันที่จ่าย" ของป๊อปจ่ายงาน / รายละเอียดใบงาน
 * ตั้งต้น = วันนี้ · ย้อนวันได้ · คีย์ย้อนหลังแล้วจำไม่ได้ว่าวันไหน → กด "จำไม่ได้" = ไม่ระบุวัน (value null → บันทึกเป็นว่าง)
 *
 * เปิดปุ่ม "จำไม่ได้" (บันทึกวันว่าง) ได้เมื่อ DB ปลดข้อบังคับห้ามว่างแล้ว
 * — SQL ใน docs/crew-pick.md (รอเจ้าของอนุมัติ) · ยังไม่รัน = ส่งค่าว่างไป DB จะปฏิเสธ
 */
export const ALLOW_UNKNOWN_DATE = false;

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function DispatchDatePick({ value, onChange, disabled = false }: {
  /** "YYYY-MM-DD" · null = ไม่ระบุวัน (จำไม่ได้) */
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  if (value === null) return (
    <div>
      <button type="button" onClick={() => onChange(todayLocal())} disabled={disabled} title="กดเพื่อใส่วันที่จ่าย"
        className="w-full h-9 px-2 text-sm text-left border border-dashed border-amber-300 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 disabled:opacity-50">
        🤷 ไม่ระบุวัน
      </button>
      <span className="block text-[10px] text-slate-400">จำไม่ได้ว่าวันไหน · กดเพื่อใส่วัน</span>
    </div>
  );
  return (
    <div>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value || todayLocal())} disabled={disabled}
        title="วันที่จ่ายงานจริง — ตั้งต้นเป็นวันนี้ ย้อนวันได้ถ้าคีย์ตามหลัง"
        className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50" />
      {ALLOW_UNKNOWN_DATE && (
        <button type="button" onClick={() => onChange(null)} disabled={disabled}
          className="text-[10px] text-slate-500 underline decoration-dotted hover:text-violet-700 disabled:opacity-50">🤷 จำไม่ได้ว่าวันไหน</button>
      )}
    </div>
  );
}
