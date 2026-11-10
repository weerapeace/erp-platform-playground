"use client";

/**
 * useLongPress — "กดค้าง" บนจอสัมผัส (ของกลาง) · ใช้แรก: การ์ด Design Dashboard มือถือ = กดค้างเพื่อเปลี่ยนสถานะเร็ว
 *
 *   const lp = useLongPress(() => openStatus(sheet), { disabled: !canEdit });
 *   <div {...lp.handlers} onClick={() => { if (lp.consumed()) return; open(); }} style={lp.style}>
 *
 * - ค้างครบ ms (ค่าตั้งต้น 500) = เรียก onLong ครั้งเดียว · ขยับนิ้วเกิน 10px (กำลังเลื่อนจอ) = ยกเลิก
 * - กดค้างแล้วปล่อย เบราว์เซอร์จะส่ง click ตามมา → เรียก consumed() ในตัวจัดการ click (true = เพิ่งกดค้าง ไม่ต้องเปิดอย่างอื่น)
 * - กันเมนูของเบราว์เซอร์ตอนกดค้าง (Android contextmenu / iOS callout บนรูป) เฉพาะตอนเปิดใช้
 */
import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent } from "react";

export function useLongPress(onLong: () => void, opts: { ms?: number; disabled?: boolean } = {}) {
  const { ms = 500, disabled = false } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cb = useRef(onLong);
  cb.current = onLong;

  const clear = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } start.current = null; }, []);
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (disabled || e.button > 0) return;
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      fired.current = true;
      try { navigator.vibrate?.(15); } catch { /* บางเครื่องไม่มี */ }
      cb.current();
    }, ms);
  }, [disabled, ms]);
  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = start.current;
    if (s && timer.current && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
  }, [clear]);

  /** เรียกในตัวจัดการ click: true = click นี้มาจากการกดค้าง (กลืนทิ้ง) */
  const consumed = useCallback(() => { if (!fired.current) return false; fired.current = false; return true; }, []);

  const style: CSSProperties | undefined = disabled ? undefined : { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" };
  return {
    handlers: disabled ? {} : {
      onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
    consumed,
    style,
  };
}
