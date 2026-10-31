"use client";

/**
 * ของกลาง: ลากของลอย (position: fixed) ไปวางที่ไหนก็ได้ แล้วจำเป็น "มุมจอที่ใกล้สุด + ระยะจากมุม"
 * → ย่อ/ขยายหน้าต่าง หรือเปิดเครื่องจอคนละขนาด ของยังเกาะมุมเดิม ไม่หลุดจอ · กางการ์ดใหญ่จากปุ่มเล็กก็งอกออกจากมุมเดียวกัน
 * กดเฉย ๆ (ขยับ < 5px) = คลิกปกติ · ลากแล้วปล่อย = เรียก onDrop(anchor) — ใช้ consumeClick() กันคลิกหลังลาก
 * ใส่ data-no-drag ที่ปุ่ม/ช่องในหัวที่ไม่อยากให้เริ่มลาก
 */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

export type CornerAnchor = { h: "l" | "r"; v: "t" | "b"; x: number; y: number };

const MARGIN = 8;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, Math.max(lo, hi)));

export function parseCornerAnchor(raw: unknown): CornerAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CornerAnchor>;
  if ((r.h !== "l" && r.h !== "r") || (r.v !== "t" && r.v !== "b")) return null;
  if (typeof r.x !== "number" || typeof r.y !== "number" || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
  return { h: r.h, v: r.v, x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)) };
}

/** กล่องที่ปล่อยไว้ → มุมที่ใกล้สุด + ระยะจากมุมนั้น */
export function anchorFromRect(rect: { left: number; top: number; right: number; bottom: number }, vw: number, vh: number): CornerAnchor {
  const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
  const h = cx < vw / 2 ? "l" : "r", v = cy < vh / 2 ? "t" : "b";
  return {
    h, v,
    x: Math.max(0, Math.round(h === "l" ? rect.left : vw - rect.right)),
    y: Math.max(0, Math.round(v === "t" ? rect.top : vh - rect.bottom)),
  };
}

/** style ตำแหน่งจากมุม (กันหลุดจอ: ระยะไม่เกินจอ − ขนาดกล่องโดยประมาณ) */
export function cornerStyle(a: CornerAnchor, box: { w: number; h: number } = { w: 0, h: 0 }): CSSProperties {
  const vw = typeof window === "undefined" ? 1920 : window.innerWidth;
  const vh = typeof window === "undefined" ? 1080 : window.innerHeight;
  const x = clamp(a.x, 0, vw - box.w - MARGIN), y = clamp(a.y, 0, vh - box.h - MARGIN);
  return { [a.h === "l" ? "left" : "right"]: x, [a.v === "t" ? "top" : "bottom"]: y };
}

export function useCornerDrag(onDrop: (a: CornerAnchor) => void) {
  const [live, setLive] = useState<{ left: number; top: number } | null>(null);
  const moved = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const el = (e.currentTarget.closest("[data-drag-root]") as HTMLElement | null) ?? e.currentTarget;
    const r = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    moved.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved.current && Math.hypot(dx, dy) < 5) return;
      moved.current = true;
      ev.preventDefault();   // ไม่ให้ลากแล้วไปลากเลือกข้อความทั้งหน้า
      setLive({ left: clamp(r.left + dx, 0, window.innerWidth - r.width), top: clamp(r.top + dy, 0, window.innerHeight - r.height) });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (moved.current) dropRef.current(anchorFromRect(el.getBoundingClientRect(), window.innerWidth, window.innerHeight));
      setLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return {
    /** ระหว่างลาก = ตำแหน่งสด (ใช้แทน cornerStyle) */
    liveStyle: live ? ({ left: live.left, top: live.top, right: "auto", bottom: "auto" } as CSSProperties) : null,
    dragging: !!live,
    onPointerDown,
    /** เรียกใน onClick — true = เพิ่งลากเสร็จ ให้ข้ามคลิกนี้ */
    consumeClick: () => { const m = moved.current; moved.current = false; return m; },
  };
}
