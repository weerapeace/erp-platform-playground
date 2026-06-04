"use client";

/**
 * Popover — ของกลาง: เมนู/แผงเล็กที่ "ลอยออกมา" (render ผ่าน portal ที่ body)
 *
 * แก้ปัญหา: แผง dropdown เล็ก ๆ ถูก container ที่มี overflow (เช่น panel ที่ scroll) บัง/ตัดขอบ
 * วิธีใช้:
 *   <Popover align="left" panelClassName="w-64 p-2"
 *     trigger={(toggle) => <button onClick={toggle}>เปิด</button>}>
 *     {(close) => <div>…เนื้อหาแผง… <button onClick={close}>ปิด</button></div>}
 *   </Popover>
 *
 * - คำนวณตำแหน่งจากปุ่ม (anchor) แล้ววางแบบ fixed → ไม่โดน overflow ตัด
 * - พลิกขึ้นบนอัตโนมัติถ้าพื้นที่ด้านล่างไม่พอ + จำกัดความสูงให้พอดีจอ
 * - ปิดเมื่อคลิกนอกพื้นที่ / กด Escape / เลื่อนหรือย่อขยายจอ (รีตำแหน่ง)
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export function Popover({ trigger, children, panelClassName = "", align = "left" }: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  panelClassName?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < 240 && r.top > spaceBelow;
    const s: CSSProperties = { position: "fixed", zIndex: 80 };
    if (align === "right") s.right = Math.max(8, window.innerWidth - r.right);
    else s.left = Math.min(Math.max(8, r.left), window.innerWidth - 280);
    if (above) { s.bottom = window.innerHeight - r.top + 4; s.maxHeight = r.top - 12; }
    else { s.top = r.bottom + 4; s.maxHeight = spaceBelow - 12; }
    setStyle(s);
  }, [align]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close  = useCallback(() => setOpen(false), []);

  return (
    <div ref={anchorRef} className="inline-block">
      {trigger(toggle, open)}
      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[79]" onClick={close} />
          <div style={style} className={`bg-white border border-slate-200 rounded-lg shadow-xl overflow-y-auto ${panelClassName}`}>
            {children(close)}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
