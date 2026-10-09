"use client";

/**
 * BulkActionBar — ของกลาง: แถบคำสั่งหลายรายการ "ลอยติดขอบล่างจอ" โผล่เมื่อมีรายการที่ติ๊กไว้
 *   เห็นได้ตลอดไม่ว่าจะเลื่อนไปถึงไหน (ต่างจากแถบด้านบนที่หายไปเมื่อเลื่อนลง)
 *
 * ใช้:
 *   <BulkActionBar count={selected.size} unit="รุ่น" onClear={() => setSelected(new Set())}
 *     extra={<button …>เลือกทั้งหมด 250 รุ่น</button>}>
 *     <button …>เปลี่ยนป้าย</button>
 *   </BulkActionBar>
 *
 * - count = 0 → ไม่แสดง (และไม่กินพื้นที่)
 * - วางผ่าน portal ที่ body + fixed → ไม่โดน overflow ของกล่องแม่ตัด
 * - z-40: อยู่เหนือเนื้อหา/เมนูล่างมือถือ (z-30) แต่ "ใต้" หน้าต่างเด้ง/ยืนยัน (z-50) → กดยืนยันได้ไม่โดนบัง
 * - จอเล็ก (< xl) ยกขึ้นเหนือแถบเมนูล่างของเชลล์ · มี spacer ท้ายหน้ากันแถบบังรายการสุดท้าย
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function BulkActionBar({ count, unit = "รายการ", onClear, extra, children }: {
  /** จำนวนที่เลือก (0 = ซ่อน) */
  count: number;
  /** หน่วยนับ เช่น "รุ่น" "ใบ" */
  unit?: string;
  /** ปุ่ม ✕ ล้างที่เลือก */
  onClear: () => void;
  /** ข้อความ/ลิงก์เสริมต่อจากตัวนับ เช่น "เลือกทั้งหมดที่กรองอยู่" */
  extra?: ReactNode;
  /** ปุ่มคำสั่ง (ชิดขวา) */
  children?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (count <= 0) return null;

  return (
    <>
      <div aria-hidden className="h-52 xl:h-24" />
      {mounted && createPortal(
        <div role="region" aria-label="คำสั่งสำหรับรายการที่เลือก"
          className="fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] xl:bottom-5 pointer-events-none">
          <div className="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 text-white shadow-2xl shadow-slate-900/30 backdrop-blur animate-[bulkbar-in_.18s_ease-out]">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs">{count.toLocaleString("th-TH")}</span>
              {unit}ที่เลือก
            </span>
            {extra && <span className="text-xs text-slate-300">{extra}</span>}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {children}
              <button type="button" onClick={onClear} title="ล้างที่เลือก" aria-label="ล้างที่เลือก"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white">✕</button>
            </div>
          </div>
          <style>{`@keyframes bulkbar-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>
        </div>,
        document.body,
      )}
    </>
  );
}
