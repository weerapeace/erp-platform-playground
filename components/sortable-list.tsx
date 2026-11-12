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
//
// 2026-11-01: opts.onDropTarget — ลากไปวางนอกลิสต์ตัวเอง (เช่น ย้ายรูปไปแถวสีอื่น) · ที่วางใส่ data-reorder-drop="<key>"
//   ปล่อยบนที่วาง (ไม่ใช่แถวในลิสต์ตัวเอง) = เรียก onDropTarget(from, key) · ที่วางที่กำลังชี้ได้ data-drop-over="true" (ไว้ไฮไลต์)
//   (ไม่ใส่ = ทำงานแบบเดิมทุกอย่าง)
//
// 2026-11-12: holdProps(i) — "กดค้างที่ตัวมันเองแล้วลาก" (เช่น การ์ดรูป) ไม่ต้องจับที่หูจับ · เจ้าของขอ "กดที่รูปค้างแล้วเลื่อนได้"
//   นิ้ว (มือถือ) = กดค้าง ~0.35 วิ แล้วค่อยลาก (ปัดเร็ว ๆ = เลื่อนหน้าเหมือนเดิม) · เมาส์ = กดแล้วลากได้เลย
//   คลิกเฉย ๆ ยังทำงาน (เช่น เปิดรูปใหญ่) · ลากเสร็จ = กันคลิกที่ตามมา · ใส่ draggable={false} ที่ <img> กันเบราว์เซอร์ลากรูปเอง
//   ใช้ร่วมกับ handleProps ได้ (หูจับยังใช้ได้ตามเดิม)

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
const DROP_ATTR = "data-reorder-drop";
const DROP_OVER_ATTR = "data-drop-over";

export function useDragReorder(onReorder: (from: number, to: number) => void, opts: { group?: string; onDropTarget?: (from: number, key: string) => void } = {}) {
  const group = opts.group;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const overRef = useRef<number | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onDropTargetRef = useRef(opts.onDropTarget);
  onDropTargetRef.current = opts.onDropTarget;

  // props ของ "แถว" = พื้นที่วาง (drop target) — ใส่ data attribute ไว้ให้หาเจอตอนลาก
  const rowProps = (i: number) => ({
    [ROW_ATTR]: i,
    ...(group ? { [GROUP_ATTR]: group } : {}),
    "data-drag-over": overIdx === i && dragIdx !== i ? "true" : undefined,
  });

  /**
   * เริ่มติดตามการลากของแถว i จากจุดกด (sx, sy)
   *   mode "move" = ขยับเกิน 4px ค่อยเริ่มลาก (หูจับ / เมาส์บนตัวแถว)
   *   mode "hold" = ต้องกดค้าง holdMs ก่อน · ขยับเกิน 8px ก่อนครบเวลา = ยกเลิก (ปล่อยให้เลื่อนหน้า) · ครบเวลา = เริ่มลากทันที (นิ้วบนมือถือ)
   */
  const track = (i: number, sx: number, sy: number, mode: "move" | "hold", holdMs = 350) => {
      let active = false;
      let cancelled = false;
      let holdTimer: ReturnType<typeof setTimeout> | null = null;
      overRef.current = null;
      let dropEl: HTMLElement | null = null;
      const setDropEl = (el: HTMLElement | null) => {
        if (el === dropEl) return;
        dropEl?.removeAttribute(DROP_OVER_ATTR);
        dropEl = el;
        dropEl?.setAttribute(DROP_OVER_ATTR, "true");
      };

      const rowAt = (el: HTMLElement | null): number | null => {
        const row = el?.closest?.(`[${ROW_ATTR}]`) as HTMLElement | null;
        if (!row) return null;
        if (group && row.getAttribute(GROUP_ATTR) !== group) return null;   // แถวของลิสต์อื่น = ไม่ใช่ที่วาง
        const n = Number(row.getAttribute(ROW_ATTR));
        return Number.isFinite(n) ? n : null;
      };

      const activate = () => {
        if (active || cancelled) return;
        active = true;
        setDragIdx(i);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        if (mode === "hold") { try { navigator.vibrate?.(10); } catch { /* บางเครื่องไม่มี */ } }
      };
      // ระหว่างลากด้วยนิ้ว: กันหน้าเลื่อนตาม (touchmove ต้องไม่ passive ถึงกันได้)
      const blockScroll = (ev: TouchEvent) => { if (active) ev.preventDefault(); };
      const blockMenu = (ev: Event) => { if (active || (mode === "hold" && !cancelled)) ev.preventDefault(); };
      if (mode === "hold") {
        holdTimer = setTimeout(activate, holdMs);
        window.addEventListener("touchmove", blockScroll, { passive: false });
        window.addEventListener("contextmenu", blockMenu);
      }
      const move = (ev: PointerEvent) => {
        if (!active) {
          const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
          if (mode === "hold") {
            if (d > 8) { cancelled = true; if (holdTimer) clearTimeout(holdTimer); up(); }   // ปัด = เลื่อนหน้า ไม่ใช่ลาก
            return;
          }
          if (d < 4) return;
          activate();
        }
        const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const over = rowAt(el);
        if (over !== overRef.current) {
          overRef.current = over;
          setOverIdx(over);
        }
        // ไม่ได้ชี้แถวในลิสต์ตัวเอง → ที่วางนอกลิสต์ (ถ้าเปิดใช้)
        setDropEl(over === null && onDropTargetRef.current ? ((el?.closest?.(`[${DROP_ATTR}]`) as HTMLElement | null) ?? null) : null);
      };
      function up() {
        if (holdTimer) clearTimeout(holdTimer);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        window.removeEventListener("touchmove", blockScroll);
        // เมนูกดค้างของรูป (บันทึกรูป ฯลฯ) มาหลังปล่อยนิ้วได้ — ถอดตัวกันทีหลังนิดหนึ่ง
        setTimeout(() => window.removeEventListener("contextmenu", blockMenu), 400);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        const to = overRef.current;
        const dropKey = dropEl?.getAttribute(DROP_ATTR) ?? null;
        setDropEl(null);
        if (active) {
          // ลากแล้ว = กันคลิกที่ตามมา (ไม่ให้เปิดรูป/กดปุ่มใต้นิ้วโดยไม่ตั้งใจ)
          const eat = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
          window.addEventListener("click", eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0);
        }
        if (active && to !== null && to !== i) onReorderRef.current(i, to);
        else if (active && to === null && dropKey) onDropTargetRef.current?.(i, dropKey);
        cancelled = true;
        active = false;
        setDragIdx(null);
        setOverIdx(null);
        overRef.current = null;
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
  };

  // props ของ "หูจับ" = ตัวเริ่มลาก (ขยับเกิน 4px)
  const handleProps = (i: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      track(i, e.clientX, e.clientY, "move");
    },
    style: { touchAction: "none" } as const,
  });

  // props ของ "ตัวแถวทั้งตัว" (เช่น การ์ดรูป) = กดค้างแล้วลาก — นิ้ว: ค้าง holdMs ก่อน · เมาส์: ลากได้เลย · คลิกเฉย ๆ ยังทำงาน
  const holdProps = (i: number, holdMs = 350) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement | null)?.closest?.("[data-no-hold-drag]")) return;   // ปุ่มย่อยในการ์ด (ลบ/ตั้งปก) ไม่เริ่มลาก
      track(i, e.clientX, e.clientY, e.pointerType === "mouse" ? "move" : "hold", holdMs);
    },
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as const,
  });

  /** คลาสไฮไลต์แถว (กำลังลาก / กำลังจะวางตรงนี้) — ต่อท้าย className ของแถว */
  const rowCls = (i: number) => `${dragIdx === i ? "opacity-40" : ""} ${overIdx === i && dragIdx !== i ? "ring-2 ring-violet-300" : ""}`;

  return { rowProps, handleProps, holdProps, rowCls, dragIdx, overIdx };
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
