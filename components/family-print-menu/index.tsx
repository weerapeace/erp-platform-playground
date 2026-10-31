"use client";

/**
 * 🖨 ปุ่ม "พิมพ์ทั้งรุ่น ▾" (ของกลาง) — เลือกใบพิมพ์รวมทั้งรุ่น 4 แบบ แล้วเปิดแท็บใหม่ (ลิงก์จาก familyPrintUrl ใน lib/family-print เท่านั้น)
 *   by = { parent: รหัสสินค้าแม่ } (ทุกใบที่ยังเปิดของรุ่น) · { ids: [id ใบสั่งผลิต] } (เฉพาะใบที่ติ๊ก) · { mo: id } (ทั้งรุ่นของใบนี้)
 *   กดปุ่ม/เมนู ไม่ทำให้แถว/หัวกลุ่มที่ครอบอยู่ทำงาน (กันกาง/ย่อกลุ่มตอนกด)
 *   ใช้ที่: หัวกลุ่ม "สินค้าแม่" บนบอร์ดจ่ายงาน (3 แท็บ) · แถบคำสั่งตอนติ๊กหลายใบ
 */
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { familyPrintUrl, type FamilySheetKind } from "@/lib/family-print";

export const FAMILY_SHEETS: { k: FamilySheetKind; label: string; sub: string }[] = [
  { k: "buy", label: "ใบสั่งผลิตรวม", sub: "ของที่ต้องซื้อ + บล็อกตัด (ตาราง ของ × สี)" },
  { k: "route", label: "ใบติดตามงาน — เส้นทางงาน", sub: "แถวละใบจ่าย แยกตามสี (แบบ A)" },
  { k: "status", label: "ใบติดตามงาน — ตามสถานะ", sub: "รอเตรียม / รอจ่าย / อยู่ที่ช่าง / รอ QC (แบบ D)" },
  { k: "track", label: "ใบติดตามงาน A + D", sub: "พิมพ์ 2 แบบต่อกัน" },
];

export function FamilyPrintMenu({ by, label = "พิมพ์ทั้งรุ่น", className, title }: {
  by: Parameters<typeof familyPrintUrl>[0];
  label?: string;
  /** หน้าตาปุ่ม (ไม่ส่ง = ปุ่มเล็กขอบเทา) */
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const go = (k: FamilySheetKind) => { setOpen(false); window.open(familyPrintUrl(by, k), "_blank", "noopener"); };
  return (
    <span ref={anchor} className="inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={title ?? "พิมพ์ใบรวมทั้งรุ่น (ทุกสีในแผ่นเดียว)"}
        className={className ?? "inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-normal text-slate-600 hover:bg-slate-50"}>
        <Icon name="print" /> {label} ▾
      </button>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={280} maxWidth={340}>
        <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {FAMILY_SHEETS.map((s) => (
            <button key={s.k} type="button" onClick={() => go(s.k)} className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-50">
              <div className="text-[13px] font-medium text-slate-800">{s.label}</div>
              <div className="text-[11px] text-slate-500">{s.sub}</div>
            </button>
          ))}
        </div>
      </FloatingDropdown>
    </span>
  );
}
