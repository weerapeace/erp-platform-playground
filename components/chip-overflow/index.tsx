"use client";
/**
 * ChipOverflow — ของกลาง: รายการชิปที่ยาวมาก "โชว์แค่ไม่กี่ตัว แล้วกดดูที่เหลือ"
 *
 * ใช้ทำอะไร: ชิปหลายสิบตัวในแถวตารางทำให้แถวสูงเป็นหน้า (เช่น ลูกค้าประจำแบรนด์ 30 สาขา)
 *            → ปกติโชว์ max ตัวแรก + ปุ่ม "+N ดูทั้งหมด" · กดแล้วกางทั้งหมด (จัดกลุ่มได้) + ปุ่ม "ย่อ"
 * ใช้เมื่อไหร่: ชิป/ป้ายที่จำนวนไม่แน่นอนในแถวตาราง การ์ด หรือหัวข้อ (ลูกค้า · สาขา · แท็ก · ผู้รับผิดชอบ)
 * ห้ามใช้เมื่อ: ต้องเลือก/ติ๊กชิป (ใช้ FieldChipsPicker หรือ Picker กลาง) · กรองตามแท็ก (TagGroupFilter)
 *
 * ตัวนี้ไม่เก็บข้อมูล ไม่ยิง API — แค่จัดการ "ย่อ/กาง" · หน้าตาชิปและปุ่ม × เป็นของผู้เรียก (renderChip)
 * เปิดเผยลำดับ: ตอนย่อโชว์ตามลำดับเดิมของ items (ตัวแรก = ตัวสำคัญสุดของหน้านั้น)
 * คู่มือ: docs/chip-overflow.md
 */
import { useState, type ReactNode } from "react";
import { tr } from "@/lib/lang";

export type ChipOverflowGroup<T> = { label: string; items: T[] };

export function ChipOverflow<T>({
  items, getKey, renderChip, max = 3, groupItems, className = "",
}: {
  items: T[];
  getKey: (item: T) => string;
  /** วาดชิป 1 ตัว · grouped = กางแบบจัดกลุ่มอยู่ (ชื่อซ้ำกับหัวกลุ่มย่อได้) */
  renderChip: (item: T, ctx: { grouped: boolean }) => ReactNode;
  /** โชว์กี่ตัวตอนย่อ (ซ่อนแค่ 1 ตัว = โชว์ทั้งหมดเลย ไม่ทำปุ่ม "+1") */
  max?: number;
  /** ตอนกาง: จัดกลุ่มมีหัวข้อ (ใช้เฉพาะรายการยาวเกิน max+1 · ไม่ใส่ = เรียงต่อกัน) */
  groupItems?: (items: T[]) => ChipOverflowGroup<T>[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const canCollapse = items.length > max + 1;
  const hidden = items.length - max;
  const btn = "inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] leading-snug text-slate-600 hover:bg-slate-50 hover:text-slate-800";

  // ย่อ: max ตัวแรกตามลำดับเดิม + ปุ่ม +N
  if (canCollapse && !open) {
    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {items.slice(0, max).map((it) => <span key={getKey(it)} className="contents">{renderChip(it, { grouped: false })}</span>)}
        <button type="button" onClick={() => setOpen(true)} className={btn} title={tr(`ดูทั้งหมด ${items.length} รายการ`, `Show all ${items.length}`)}>
          +{hidden} {tr("ดูทั้งหมด", "show all")}
        </button>
      </div>
    );
  }

  const groups = groupItems ? groupItems(items) : [];
  const less = canCollapse && (
    <button type="button" onClick={() => setOpen(false)} className={btn}>{tr("ย่อ", "Show less")}</button>
  );

  // กางแบบจัดกลุ่ม (เฉพาะรายการยาวที่ย่อได้ — รายการสั้นโชว์ชื่อเต็มเรียงกันพอ)
  if (canCollapse && groups.length > 0) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="text-[11px] text-slate-500">{g.label} <span className="text-slate-400">· {g.items.length}</span></div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {g.items.map((it) => <span key={getKey(it)} className="contents">{renderChip(it, { grouped: true })}</span>)}
            </div>
          </div>
        ))}
        {less}
      </div>
    );
  }

  // กางแบบเรียงต่อกัน (หรือมีไม่เกิน max+1 ตัวอยู่แล้ว)
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {items.map((it) => <span key={getKey(it)} className="contents">{renderChip(it, { grouped: false })}</span>)}
      {less}
    </div>
  );
}
