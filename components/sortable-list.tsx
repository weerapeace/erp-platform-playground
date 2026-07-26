"use client";

// ของกลาง: ลากจัดลำดับรายการ (drag to reorder)
// ใช้กับลิสต์ตั้งค่าทุกที่ (ประเภทงาน/แพลตฟอร์ม/สถานะ/ชนิดงานย่อย/ฟิลด์บังคับ ฯลฯ)
//
// วิธีใช้:
//   const { rowProps, handleProps, dragIdx, overIdx } = useDragReorder((from, to) => reorder(from, to));
//   {items.map((it, i) => (
//     <div key={it.id} {...rowProps(i)}>
//       <DragHandle {...handleProps(i)} />
//       …เนื้อแถว…
//     </div>
//   ))}
//
// หมายเหตุ: จับลากได้เฉพาะที่ "หูจับ" (DragHandle) — ตัวแถวเป็นพื้นที่วางเท่านั้น
// เพื่อให้ input/ปุ่มในแถวยังคลิก/เลือกข้อความได้ตามปกติ

import { useState, type DragEvent } from "react";

/** ย้ายสมาชิกในอาเรย์ from → to (คืนอาเรย์ใหม่) */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const finish = () => { setDragIdx(null); setOverIdx(null); };

  // props ของ "แถว" = พื้นที่วาง (drop target)
  const rowProps = (i: number) => ({
    onDragOver: (e: DragEvent) => { if (dragIdx === null) return; e.preventDefault(); if (overIdx !== i) setOverIdx(i); },
    onDragLeave: () => { if (overIdx === i) setOverIdx(null); },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i); finish(); },
    "data-drag-over": overIdx === i && dragIdx !== i ? "true" : undefined,
  });

  // props ของ "หูจับ" = ตัวเริ่มลาก
  const handleProps = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* บางเบราว์เซอร์ต้องมี data */ } },
    onDragEnd: finish,
  });

  /** คลาสไฮไลต์แถว (กำลังลาก / กำลังจะวางตรงนี้) — ต่อท้าย className ของแถว */
  const rowCls = (i: number) => `${dragIdx === i ? "opacity-40" : ""} ${overIdx === i && dragIdx !== i ? "ring-2 ring-violet-300" : ""}`;

  return { rowProps, handleProps, rowCls, dragIdx, overIdx };
}

/** หูจับสำหรับลาก (วางไว้หัวแถว) — กระจาย props จาก handleProps(i) */
export function DragHandle({ title, className = "", ...rest }: { title?: string; className?: string } & Record<string, unknown>) {
  return (
    <span
      {...rest}
      title={title ?? "ลากเพื่อจัดลำดับ"}
      className={`shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none leading-none px-0.5 ${className}`}
      aria-label={title ?? "ลากเพื่อจัดลำดับ"}
    >⠿</span>
  );
}
