"use client";

import { useState, useRef, useLayoutEffect, useEffect, type ReactNode, type RefObject, type CSSProperties } from "react";
import { createPortal } from "react-dom";

// ============================================================
// FloatingDropdown กลาง — ทำให้ dropdown "ลอย" ทับเนื้อหา
// แก้ปัญหา dropdown โดน popup/ตาราง (overflow) ตัด หรือดันเลย์เอาต์
// วิธี: render ผ่าน portal ไป <body> + ตำแหน่ง fixed คำนวณจากปุ่ม trigger
// - anchorRef = กล่องที่ครอบปุ่ม trigger (ใช้วัดตำแหน่ง + กันปิดเมื่อคลิกปุ่ม)
// - ปิดเมื่อคลิกนอก (ทั้งนอก trigger และนอก dropdown)
// - เลื่อน/รีไซส์หน้าจอ → ตามตำแหน่งใหม่; ที่ว่างด้านล่างไม่พอ → เปิดขึ้นบน
// ============================================================

export function FloatingDropdown({
  anchorRef, open, onClose, children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; top: number; bottom: number } | null>(null);

  // วัดตำแหน่งปุ่ม + ตามเมื่อ scroll/resize
  useLayoutEffect(() => {
    if (!open) { setBox(null); return; }
    const compute = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ left: r.left, width: r.width, top: r.top, bottom: r.bottom });
    };
    compute();
    window.addEventListener("scroll", compute, true);  // true = จับ scroll ของ ancestor ทุกชั้น
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, anchorRef]);

  // ปิดเมื่อคลิกนอก (ไม่ปิดถ้าคลิกในปุ่ม trigger หรือใน dropdown)
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, anchorRef, onClose]);

  if (!open || !box || typeof document === "undefined") return null;

  const GAP = 4;
  const spaceBelow = window.innerHeight - box.bottom;
  const openUp = spaceBelow < 280 && box.top > spaceBelow;
  const style: CSSProperties = {
    position: "fixed",
    left: box.left,
    width: box.width,
    zIndex: 1000,
    ...(openUp
      ? { bottom: Math.round(window.innerHeight - box.top + GAP) }
      : { top: Math.round(box.bottom + GAP) }),
  };

  return createPortal(<div ref={panelRef} style={style}>{children}</div>, document.body);
}
