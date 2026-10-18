"use client";

// ของกลาง: ลากจัดลำดับรายการ (drag to reorder)
// ใช้กับลิสต์ตั้งค่าทุกที่ (ประเภทงาน/แพลตฟอร์ม/สถานะ/ชนิดงานย่อย/ฟิลด์บังคับ/ลำดับส่วนหน้าสินค้า ฯลฯ)
//
// วิธีใช้ (API เดิม ไม่ต้องแก้ที่เรียกใช้):
//   const { rowProps, handleProps, rowCls, dragIdx, overIdx } = useDragReorder((from, to) => reorder(from, to));
//   {items.map((it, i) => (
//     <div key={it.id} {...rowProps(i)} className={rowCls(i)}>
//       <DragHandle {...handleProps(i)} />
//       …เนื้อแถว…
//     </div>
//   ))}
//
// 2026-10-12: เปลี่ยนจาก HTML5 drag&drop เป็น Pointer Events ของเราเอง
//   เหตุผล: HTML5 DnD เอาแน่ไม่ได้ (เจ้าของเจอ "ลากไม่ได้" ในหน้าดีไซน์ · บางเบราว์เซอร์ไม่ให้ลากปุ่ม · มือถือใช้ไม่ได้)
//   วิธี: กดค้างที่หูจับ → ขยับเกิน 4px = เริ่มลาก → หาแถวใต้เมาส์ด้วย elementFromPoint([data-reorder-row]) → ปล่อย = สลับ
//   แถวยังคลิก/พิมพ์ได้ปกติ เพราะจับลากเฉพาะที่หูจับ · รองรับนิ้วบนมือถือ (touch-action none ที่หูจับ)
//
// 2026-10-18: opts.group — หลายลิสต์ในหน้าเดียว (เช่น การ์ดรูปต่อ SKU) ใส่ group คนละค่า → ลากข้ามลิสต์ไม่ถูกนับเป็นที่วาง
//   (ไม่ใส่ = ทำงานแบบเดิมทุกอย่าง)

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** ย้ายสมาชิกในอาเรย์ from → to (คืนอาเรย์ใหม่) */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

const ROW_ATTR = "data-reorder-row";
const GROUP_ATTR = "data-reorder-group";

export function useDragReorder(onReorder: (from: number, to: number) => void, opts: { group?: string } = {}) {
  const group = opts.group;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const overRef = useRef<number | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // props ของ "แถว" = พื้นที่วาง (drop target) — ใส่ data attribute ไว้ให้หาเจอตอนลาก
  const rowProps = (i: number) => ({
    [ROW_ATTR]: i,
    ...(group ? { [GROUP_ATTR]: group } : {}),
    "data-drag-over": overIdx === i && dragIdx !== i ? "true" : undefined,
  });

  // props ของ "หูจับ" = ตัวเริ่มลาก
  const handleProps = (i: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      let active = false;
      overRef.current = null;

      const rowAt = (x: number, y: number): number | null => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        const row = el?.closest?.(`[${ROW_ATTR}]`) as HTMLElement | null;
        if (!row) return null;
        if (group && row.getAttribute(GROUP_ATTR) !== group) return null;   // แถวของลิสต์อื่น = ไม่ใช่ที่วาง
        const n = Number(row.getAttribute(ROW_ATTR));
        return Number.isFinite(n) ? n : null;
      };

      const move = (ev: PointerEvent) => {
        if (!active) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
          active = true;
          setDragIdx(i);
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
        }
        const over = rowAt(ev.clientX, ev.clientY);
        if (over !== overRef.current) {
          overRef.current = over;
          setOverIdx(over);
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        const to = overRef.current;
        if (active && to !== null && to !== i) onReorderRef.current(i, to);
        setDragIdx(null);
        setOverIdx(null);
        overRef.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    style: { touchAction: "none" } as const,
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
