"use client";

/**
 * ของกลาง — ลากด้วยนิ้ว (iPad / มือถือ): กดค้างแล้วลากของไปวางที่เป้า — useTouchDrag
 *   ทำไมต้องมี: ลากแบบ HTML5 (draggable) ใช้ได้แค่เมาส์ · บน iPad นิ้วลากแล้วกลายเป็นเลื่อนจอ
 *   วิธี: กดค้าง ~0.3 วิ (ไม่ขยับ) = เริ่มลาก → มีเงาการ์ดตามนิ้ว · หาเป้าใต้นิ้วด้วย elementFromPoint([data-drop-id]) → ปล่อย = onDrop
 *         ขยับก่อนครบเวลา = ผู้ใช้กำลังเลื่อนจอ → ไม่ลาก (เลื่อนจอได้ปกติ) · ระหว่างลาก กันจอเลื่อน (touchmove non-passive)
 *   ใช้คู่กับลาก HTML5 เดิมได้ (เมาส์ใช้ของเดิม นิ้วใช้ตัวนี้)
 * ใช้:
 *   const td = useTouchDrag<string>({ onDrop: (dropId, id) => … });
 *   <div {...td.bind(id, <ป้ายตอนลาก/>)} onClick={(e) => { if (td.justDragged()) return; … }}>…</div>
 *   <button data-drop-id={desk.id} className={td.overId === desk.id ? "ยกขึ้น" : ""}>…</button>
 *   {td.ghost}
 * ใช้แล้วที่: บอร์ดจ่ายงาน โหมดผู้บริหาร (การ์ด → โต๊ะ)
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";

type Drag<T> = { payload: T; label: ReactNode; x: number; y: number };

export function useTouchDrag<T>({ onDrop, attr = "data-drop-id", delay = 300 }: {
  onDrop: (dropId: string, payload: T) => void;
  /** แอตทริบิวต์ที่บอกว่า element นี้รับของได้ (ค่า = id ของเป้า) */
  attr?: string;
  /** กดค้างกี่ ms ถึงเริ่มลาก */
  delay?: number;
}) {
  const [drag, setDrag] = useState<Drag<T> | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const st = useRef<{ timer: number | null; sx: number; sy: number; active: boolean; over: string | null; payload: T | null; endedAt: number }>({ timer: null, sx: 0, sy: 0, active: false, over: null, payload: null, endedAt: 0 });
  const dropRef = useRef(onDrop);
  useEffect(() => { dropRef.current = onDrop; }, [onDrop]);

  const clearTimer = () => { if (st.current.timer != null) { window.clearTimeout(st.current.timer); st.current.timer = null; } };
  const finish = useCallback((commit: boolean) => {
    const s = st.current;
    clearTimer();
    if (!s.active) return;
    const over = s.over, payload = s.payload;
    s.active = false; s.over = null; s.payload = null; s.endedAt = Date.now();
    setDrag(null); setOverId(null);
    if (commit && over && payload != null) dropRef.current(over, payload);
  }, []);

  // ฟังทั้งหน้าแบบ non-passive ตั้งแต่ต้น — iOS ให้ preventDefault ได้เฉพาะตัวฟังที่ไม่ passive (กันจอเลื่อนระหว่างลาก)
  useEffect(() => {
    const move = (e: TouchEvent) => {
      const s = st.current;
      if (!s.active) return;
      e.preventDefault();
      const t = e.touches[0]; if (!t) return;
      setDrag((d) => (d ? { ...d, x: t.clientX, y: t.clientY } : d));
      const el = document.elementFromPoint(t.clientX, t.clientY)?.closest(`[${attr}]`);
      const id = el?.getAttribute(attr) ?? null;
      if (id !== s.over) { s.over = id; setOverId(id); }
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", cancel);
    return () => { document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end); document.removeEventListener("touchcancel", cancel); };
  }, [attr, finish]);
  useEffect(() => () => clearTimer(), []);

  /** ผูกกับของที่ลากได้ — payload = สิ่งที่ส่งให้ onDrop · label = เงาที่โชว์ใต้นิ้ว */
  const bind = (payload: T, label: ReactNode) => ({
    onTouchStart: (e: ReactTouchEvent) => {
      const t = e.touches[0]; if (!t || e.touches.length > 1) return;
      const s = st.current; clearTimer();
      s.sx = t.clientX; s.sy = t.clientY;
      s.timer = window.setTimeout(() => {
        s.timer = null; s.active = true; s.payload = payload; s.over = null;
        setDrag({ payload, label, x: s.sx, y: s.sy });
        try { navigator.vibrate?.(12); } catch { /* บางเครื่องไม่มี */ }
      }, delay);
    },
    onTouchMove: (e: ReactTouchEvent) => {
      const s = st.current; if (s.active || s.timer == null) return;
      const t = e.touches[0]; if (t && Math.hypot(t.clientX - s.sx, t.clientY - s.sy) > 8) clearTimer();   // ขยับก่อนครบเวลา = เลื่อนจอ
    },
    onTouchEnd: () => { if (!st.current.active) clearTimer(); },
    onContextMenu: (e: { preventDefault: () => void }) => { if (st.current.active || st.current.timer != null) e.preventDefault(); },
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as CSSProperties,
  });

  const ghost = drag && typeof document !== "undefined" ? createPortal(
    <div style={{ position: "fixed", left: drag.x, top: drag.y, transform: "translate(-50%, -60%) rotate(-3deg) scale(1.03)", pointerEvents: "none", zIndex: 9999 }}
      className="rounded-xl border-2 border-violet-500 bg-white/95 px-3 py-2 shadow-2xl">
      {drag.label}
    </div>, document.body) : null;

  return {
    bind, ghost, overId, dragging: drag !== null,
    /** เพิ่งลากเสร็จ (กันการแตะที่ตามมาไปติ๊ก/เปิดของ) */
    justDragged: () => Date.now() - st.current.endedAt < 450,
  };
}
