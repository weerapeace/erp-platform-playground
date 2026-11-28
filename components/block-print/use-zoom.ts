"use client";
/**
 * 🧱 บล็อกพิมพ์ — ซูมภาพ (ใช้ร่วม: หน้าเลือกชิ้น grouper.tsx + หน้าจัดวางในบล็อก layout-editor.tsx)
 *   Ctrl + ล้อเมาส์ = ซูมตรงจุดที่ชี้ · ปุ่ม −/+ ไล่ระดับ 25% – 800% · "พอดีจอ" = 100% · มือถือถ่างนิ้ว 2 นิ้ว
 *   box = กล่องที่เลื่อนดูได้ (overflow-auto) ที่ครอบภาพ · ภาพกว้าง = zoom × ความกว้างกล่อง
 *   ลูกกลิ้งเฉย ๆ = เลื่อนตามปกติ (กล่องที่ซูมจนล้น = เลื่อนภาพ · ไม่ล้น = เลื่อนหน้าเว็บ) · Ctrl+ลูกกลิ้ง = ซูม (ไม่มีระบบล็อกกระดานแล้ว 2026-11-28)
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { wheelAction } from "@/lib/board-kit";

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const MIN = ZOOM_LEVELS[0], MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

/** active = กล่องภาพถูกวาดแล้ว (ใส่เมื่อกล่องโผล่ทีหลัง เช่น หลังสร้างบล็อกแรก) */
export function useCanvasZoom(box: RefObject<HTMLDivElement | null>, initial = 1, active = true) {
  const [zoom, setZoomState] = useState(initial);
  const anchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  /** ซูมโดยให้จุด (cx,cy ในกล่อง) อยู่ที่เดิม — ไม่ระบุ = กึ่งกลางกล่อง */
  const zoomTo = useCallback((z: number, cx?: number, cy?: number) => {
    const el = box.current;
    const next = clamp(Math.round(z * 1000) / 1000);
    if (el) {
      const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
      anchor.current = {
        fx: (el.scrollLeft + px) / Math.max(1, el.scrollWidth), fy: (el.scrollTop + py) / Math.max(1, el.scrollHeight), cx: px, cy: py,
      };
    }
    setZoomState(next);
  }, [box]);
  const step = useCallback((dir: 1 | -1) => {
    const z = zoomRef.current;
    const next = dir > 0 ? ZOOM_LEVELS.find((l) => l > z + 0.001) ?? MAX : [...ZOOM_LEVELS].reverse().find((l) => l < z - 0.001) ?? MIN;
    zoomTo(next);
  }, [zoomTo]);

  // หลังวาดใหม่ → เลื่อนให้จุดที่ชี้อยู่ที่เดิม
  useLayoutEffect(() => {
    const el = box.current, a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    el.scrollLeft = a.fx * el.scrollWidth - a.cx;
    el.scrollTop = a.fy * el.scrollHeight - a.cy;
  }, [zoom, box]);

  // Ctrl + ล้อเมาส์ · ถ่าง 2 นิ้ว (ต้องผูกแบบ passive:false ถึงจะกันหน้าเว็บซูมเองได้)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (wheelAction(e.ctrlKey || e.metaKey) === "pass") return;   // เลื่อนตามปกติ
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    };
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoomRef.current }; };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      zoomTo(pinch.z * (dist(e.touches) / Math.max(1, pinch.d)), mx, my);
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [box, zoomTo, active]);

  return { zoom, zoomTo, step };
}

/** ปุ่มซูม (− 100% + พอดีจอ) */
export function zoomLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}
