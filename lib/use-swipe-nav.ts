"use client";

/**
 * useSwipeNav — ปัดซ้าย-ขวาเพื่อไปแท็บถัดไป/ก่อนหน้า (ของกลาง · มือถือ/จอสัมผัส · เมาส์ลากก็ได้)
 * ใช้แรก: Design Dashboard มือถือ — ปัดตรงรายการการ์ด = เปลี่ยนแท็บสถานะ (เจ้าของสั่ง 2026-11-11)
 *
 *   const sw = useSwipeNav({ onNext: () => go(+1), onPrev: () => go(-1), canNext, canPrev });
 *   <div ref={sw.ref} {...sw.bind} style={sw.style}>…รายการ…</div>
 *
 * ทิศทาง (แบบ LINE / IG): ปัดนิ้วไปทางซ้าย ← = แท็บถัดไป (ทางขวา) · ปัดไปทางขวา → = แท็บก่อนหน้า
 * กันปัดพลาด:
 *   - ต้องปัดแนวนอนชัด ๆ (แนวนอนมากกว่าแนวตั้ง) และเกิน threshold (60px) — เลื่อนจอขึ้นลงไม่นับ
 *   - เริ่มปัดจากขอบจอ (20px) ไม่นับ — iPhone ใช้ปัดขอบซ้ายเป็น "ย้อนกลับ"
 *   - เริ่มบนช่องพิมพ์ / [data-no-swipe] (เช่น แถวที่เลื่อนแนวนอนเองได้ รูปที่ปัดดูทีละรูป) ไม่นับ
 *   - ปัดแล้วไม่เปิดการ์ดที่นิ้ววางอยู่ (กันคลิกที่ตามมา) · กดค้างการ์ด (useLongPress) ยกเลิกเองเมื่อขยับเกิน 10px
 * ระหว่างปัด รายการเลื่อนตามนิ้ว (สุดทางแล้วหนืด) · เปลี่ยนแท็บแล้วรายการใหม่เลื่อนเข้ามาจากด้านที่ปัด
 */
import { useCallback, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

/** ตัดสินทิศ: null = ยังไม่พอ · "x" = แนวนอน (เริ่มปัด) · "y" = แนวตั้ง (เลื่อนจอ ปล่อยไป) */
export function swipeAxis(mx: number, my: number, slop = 10): "x" | "y" | null {
  if (Math.abs(mx) < slop && Math.abs(my) < slop) return null;
  return Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
}
/** ปล่อยนิ้วแล้วไปไหน: 1 = แท็บถัดไป · -1 = ก่อนหน้า · 0 = อยู่ที่เดิม */
export function swipeResult(dx: number, opts: { threshold?: number; canNext?: boolean; canPrev?: boolean } = {}): -1 | 0 | 1 {
  const { threshold = 60, canNext = true, canPrev = true } = opts;
  if (dx <= -threshold && canNext) return 1;
  if (dx >= threshold && canPrev) return -1;
  return 0;
}
/** ระยะที่รายการเลื่อนตามนิ้ว — ปัดไปทางที่ไม่มีแท็บแล้ว = หนืด (30%) */
export function swipeOffset(dx: number, canNext = true, canPrev = true): number {
  return (dx < 0 && !canNext) || (dx > 0 && !canPrev) ? dx * 0.3 : dx;
}

const NO_SWIPE = "input, textarea, select, [contenteditable='true'], [data-no-swipe]";

export function useSwipeNav({ onNext, onPrev, canNext = true, canPrev = true, enabled = true, threshold = 60, edge = 20 }: {
  onNext: () => void;
  onPrev: () => void;
  canNext?: boolean;
  canPrev?: boolean;
  enabled?: boolean;
  threshold?: number;
  /** ระยะจากขอบจอที่ไม่รับการปัด (px) */
  edge?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ x: number; y: number; id: number; axis: "x" | "y" | null; dx: number } | null>(null);
  const swallowClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const cbs = useRef({ onNext, onPrev });
  cbs.current = { onNext, onPrev };

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || e.button > 0) return;
    if ((e.target as HTMLElement).closest?.(NO_SWIPE)) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    if (e.clientX < edge || (vw && e.clientX > vw - edge)) return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, dx: 0 };
  }, [enabled, edge]);

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s || e.pointerId !== s.id || s.axis === "y") return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.axis) {
      s.axis = swipeAxis(mx, my);
      if (s.axis !== "x") return;
      setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ไม่ให้ */ }
    }
    s.dx = mx;
    setDx(swipeOffset(mx, canNext, canPrev));
  }, [canNext, canPrev]);

  const finish = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    st.current = null;
    if (!s || e.pointerId !== s.id || s.axis !== "x") return;
    swallowClick.current = Math.abs(s.dx) > 10;
    setDragging(false);
    setDx(0);
    const go = e.type === "pointercancel" ? 0 : swipeResult(s.dx, { threshold, canNext, canPrev });
    if (!go) return;
    if (go === 1) cbs.current.onNext(); else cbs.current.onPrev();
    try { navigator.vibrate?.(8); } catch { /* บางเครื่องไม่มี */ }
    // รายการใหม่เลื่อนเข้ามาจากด้านที่ปัด (Web Animations — ไม่ต้องมี CSS เพิ่ม)
    window.requestAnimationFrame(() => {
      ref.current?.animate?.([{ transform: `translateX(${go * 48}px)`, opacity: 0.4 }, { transform: "translateX(0)", opacity: 1 }], { duration: 200, easing: "ease-out" });
    });
  }, [threshold, canNext, canPrev]);

  // ปัดเสร็จ เบราว์เซอร์ส่ง click ตามมา → ไม่ให้ไปเปิดการ์ดที่นิ้ววางอยู่
  const onClickCapture = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const style: CSSProperties = {
    touchAction: "pan-y",
    transform: dx ? `translateX(${dx}px)` : undefined,
    transition: dragging ? "none" : "transform 0.2s ease",
    ...(dragging ? { userSelect: "none" } : {}),
  };
  return { ref, bind: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClickCapture }, style, dragging };
}
