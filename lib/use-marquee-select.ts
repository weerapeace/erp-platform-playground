"use client";
/**
 * useMarqueeSelect — ลากกรอบสี่เหลี่ยมจากที่ว่างเพื่อเลือกหลายชิ้น (แบบเลือกไฟล์ในเครื่อง) · ของกลาง
 *
 * ใช้:  const mq = useMarqueeSelect({ getSelected: () => [...], setSelected: (ids) => … });
 *       <div ref={mq.ref} className="relative"> … <div data-select-id="p:123">…</div> … {mq.box && <div style={mq.box} className="…" />} </div>
 * - ชิ้นที่เลือกได้ = มี data-select-id (ใส่ prefix แยกชนิดเองได้ เช่น "p:" รูป "a:" อัลบั้ม)
 * - เริ่มลากได้เฉพาะที่ว่าง (ไม่ใช่บนชิ้นงาน ปุ่ม ช่องพิมพ์ ลิงก์ หรือของที่ลากได้) · เมาส์เท่านั้น (มือถือ/ทัชไม่ยุ่ง เลื่อนจอได้ปกติ)
 * - กด Ctrl / Shift / ⌘ ค้างตอนเริ่ม = เลือกเพิ่มจากที่เลือกอยู่ · ไม่กด = เริ่มใหม่
 * - box = ตำแหน่งกรอบเทียบกับตัว container (container ต้อง position: relative)
 * ใช้ที่แรก: หน้า SAMPLE Images (รูป + การ์ดอัลบั้มย่อย · เจ้าของขอ 2026-11-17)
 */
import { useCallback, useRef, useState, type CSSProperties } from "react";

const SKIP = "[data-select-id],button,a,input,textarea,select,label,[draggable='true'],[contenteditable='true'],[role='button']";
const MIN_MOVE = 5;

export function useMarqueeSelect({ getSelected, setSelected, disabled }: {
  getSelected: () => string[];
  setSelected: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [box, setBox] = useState<CSSProperties | null>(null);
  const live = useRef({ getSelected, setSelected, disabled });
  live.current = { getSelected, setSelected, disabled };
  const detach = useRef<(() => void) | null>(null);

  const ref = useCallback((el: HTMLElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (live.current.disabled || e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target || target.closest(SKIP)) return;
      const sx = e.clientX, sy = e.clientY;
      const base = e.ctrlKey || e.shiftKey || e.metaKey ? live.current.getSelected() : [];
      let moved = false;
      const onMove = (m: PointerEvent) => {
        if (!moved && Math.abs(m.clientX - sx) < MIN_MOVE && Math.abs(m.clientY - sy) < MIN_MOVE) return;
        if (!moved) { moved = true; document.body.style.userSelect = "none"; }
        const L = Math.min(sx, m.clientX), T = Math.min(sy, m.clientY), R = Math.max(sx, m.clientX), B = Math.max(sy, m.clientY);
        const r = el.getBoundingClientRect();
        setBox({ position: "absolute", left: L - r.left, top: T - r.top, width: R - L, height: B - T, pointerEvents: "none", zIndex: 20 });
        const hits: string[] = [];
        el.querySelectorAll<HTMLElement>("[data-select-id]").forEach((n) => {
          const b = n.getBoundingClientRect();
          if (b.left < R && b.right > L && b.top < B && b.bottom > T) hits.push(n.dataset.selectId!);
        });
        live.current.setSelected([...new Set([...base, ...hits])]);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setBox(null);
        if (moved) {
          document.body.style.userSelect = "";
          // กันคลิกที่ตามหลังการลาก ไปโดนอะไรเข้า (เช่น ล้างที่เลือก)
          const eat = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
          window.addEventListener("click", eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
    el.addEventListener("pointerdown", onDown);
    detach.current = () => el.removeEventListener("pointerdown", onDown);
  }, []);

  return { ref, box };
}
