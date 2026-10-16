"use client";

/**
 * การ์ดชิ้นส่วน 1 ใบในสตูดิโอ: รูปย่อจาก R2 (ไม่มีรูป = วงกลมสีจาก attrs + ป้าย "ไม่มีรูป") · ชื่อ · +ราคาเพิ่ม
 *  - สวิตช์เปิด/ปิด (PATCH ทันที) · หูจับลากจัดลำดับ (useDragReorder ของกลาง) · ติ๊กเลือกหลายใบ
 *  - ลากไฟล์ PNG จากเครื่องมาวางบนการ์ด = อัปโหลดแทนรูปเดิมทันที
 */
import { useState } from "react";
import { DragHandle } from "@/components/sortable-list";
import { r2ImageUrl } from "@/lib/r2-image";
import { PART_TYPE_LABEL } from "@/lib/belt-builder";
import { hasImage, money, partColor, partWidth, type BeltPart } from "./studio-data";

export function PartCard({ part, selected, checked, canEdit, busy, dragHandleProps, onSelect, onToggleCheck, onToggleActive, onDropFile }: {
  part: BeltPart;
  selected: boolean;
  checked: boolean;
  canEdit: boolean;
  /** กำลังอัปโหลด/บันทึกใบนี้อยู่ */
  busy?: boolean;
  dragHandleProps?: Record<string, unknown>;
  onSelect: () => void;
  onToggleCheck: () => void;
  onToggleActive: (next: boolean) => void;
  onDropFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const img = part.image_url || r2ImageUrl(part.image_key, 400);
  const color = partColor(part);
  const width = partWidth(part);
  const label = PART_TYPE_LABEL[part.part_type]?.th ?? part.part_type;

  return (
    <div
      role="button" tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      onDragOver={(e) => { if (!canEdit) return; if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!canEdit) return; e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onDropFile(f); }}
      className={`group relative flex flex-col rounded-xl border bg-white text-left shadow-sm transition
        ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300 hover:shadow"}
        ${over ? "border-dashed border-emerald-500 bg-emerald-50" : ""} ${!part.is_active ? "opacity-70" : ""}`}
      title={canEdit ? "กดเพื่อแก้ไข · ลากไฟล์ PNG มาวางเพื่อเปลี่ยนรูป" : "กดเพื่อดูรายละเอียด"}
    >
      {/* แถวบน: ติ๊ก + หูจับ + สวิตช์ */}
      <div className="flex items-center gap-1.5 px-2 pt-2" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={onToggleCheck} className="h-4 w-4 accent-indigo-600" aria-label="เลือกชิ้นนี้" />
        {canEdit && dragHandleProps && <DragHandle {...dragHandleProps} />}
        <span className="ml-auto flex items-center gap-1">
          <span className={`text-[10px] ${part.is_active ? "text-emerald-700" : "text-slate-400"}`}>{part.is_active ? "เปิด" : "ปิด"}</span>
          <button type="button" role="switch" aria-checked={part.is_active} disabled={!canEdit || busy}
            onClick={() => onToggleActive(!part.is_active)}
            className={`relative h-5 w-9 rounded-full transition disabled:opacity-50 ${part.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
            title={part.is_active ? "เปิดอยู่ — กดเพื่อซ่อนจากเว็บ" : "ปิดอยู่ — กดเพื่อให้ลูกค้าเลือกได้"}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${part.is_active ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </span>
      </div>

      {/* รูป */}
      <div className="mx-2 mt-1.5 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] [background-size:16px_16px] [background-position:0_0,8px_8px]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={part.name_th} loading="lazy" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span className="h-12 w-12 rounded-full border-2 border-white shadow-inner" style={{ background: color ?? "#cbd5e1" }} />
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">ไม่มีรูป</span>
          </div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 text-xs text-slate-600">กำลังบันทึก…</div>}
        {over && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-medium text-emerald-700">วางเพื่อเปลี่ยนรูป</div>}
      </div>

      {/* ชื่อ + ราคา */}
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="flex items-start gap-1.5">
          {color && <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: color }} />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{part.name_th || "(ไม่มีชื่อ)"}</div>
            <div className="truncate text-[11px] text-slate-500">{part.code || label}{width ? ` · ${width} มม.` : ""}{hasImage(part) ? "" : ""}</div>
          </div>
        </div>
        <div className={`mt-1 text-xs tabular-nums ${part.price_delta > 0 ? "font-medium text-indigo-700" : "text-slate-400"}`}>
          {part.price_delta > 0 ? `+${money(part.price_delta)}` : "ไม่บวกราคา"}
        </div>
      </div>
    </div>
  );
}
