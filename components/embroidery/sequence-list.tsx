"use client";
/**
 * 🧵 ไฟล์ปัก — รายการชิ้นตามลำดับปัก (รอบ 4 ข้อ 6 · แบบแถบซ้ายของโปรแกรม Tajima)
 *   ลากหูจับ = เปลี่ยนลำดับปัก (ใช้ลากจัดลำดับกลาง useDragReorder) → settings.sequence · "เรียงอัตโนมัติ" = ล้างลำดับที่ตั้ง
 *   คลิกแถว = เลือกชิ้น (ไฮไลต์ในภาพ + แผงตั้งค่ารายชิ้น)
 */
import { DragHandle, useDragReorder } from "@/components/sortable-list";
import { STITCH_TYPES, type EmbPlan } from "@/lib/embroidery";
import { fmtNum } from "./shared";

export function SequenceList({ plan, custom, selectedId, onSelect, onReorder, onAuto, canEdit }: {
  plan: EmbPlan; custom: boolean; selectedId: string | null; canEdit: boolean;
  onSelect: (id: string) => void; onReorder: (from: number, to: number) => void; onAuto: () => void;
}) {
  const { rowProps, handleProps, rowCls } = useDragReorder(onReorder);
  const items = plan.pieces;
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
        ลำดับปัก ({items.length})
        {custom ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">ตั้งเอง</span> : <span className="text-[10px] font-normal text-slate-400">อัตโนมัติ</span>}
        {custom && canEdit && <button type="button" onClick={onAuto} className="ml-auto font-normal text-slate-500 underline">เรียงอัตโนมัติ</button>}
      </div>
      <div className="max-h-[52vh] overflow-auto py-1">
        {items.map((p, i) => (
          <div key={p.id} {...rowProps(i)} onClick={() => onSelect(p.id)}
            className={`flex cursor-pointer items-center gap-1.5 px-2 py-1 text-xs ${p.id === selectedId ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50"} ${rowCls(i)}`}>
            {canEdit && <DragHandle {...handleProps(i)} title="ลากเพื่อเปลี่ยนลำดับปัก" />}
            <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{i + 1}</span>
            <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className={`shrink-0 text-[10px] ${p.type === "skip" ? "text-slate-300" : p.warn ? "text-amber-600" : "text-slate-400"}`}>
              {STITCH_TYPES.find((t) => t.key === p.type)?.th}{p.type !== "skip" ? ` · ${fmtNum(p.stitches)}` : ""}
            </span>
          </div>
        ))}
        {!items.length && <p className="px-3 py-4 text-center text-xs text-slate-400">ยังไม่มีชิ้นที่ปัก</p>}
      </div>
    </section>
  );
}
