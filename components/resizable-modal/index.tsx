"use client";

// ============================================================
// ResizableModal (ของกลาง) — หน้าต่าง Popup ที่ "ลากมุมขวาล่างเพื่อปรับขนาด" ได้อิสระ
// - จำขนาดใน localStorage (ต่อ storageKey) → เปิดครั้งหน้าใช้ขนาดเดิม
// - ระหว่างลาก: คลุม overlay โปร่งใส กันไม่ให้ iframe ข้างในแย่ง mouse (drag ไม่หลุด)
// - Esc / คลิกฉากหลัง = ปิด
// ใช้ซ้ำได้ทุกที่: <ResizableModal onClose title headerActions>{เนื้อหา/iframe}</ResizableModal>
// ============================================================
import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;          // ซ้ายของหัว (ไอคอน+ชื่อ)
  headerActions?: React.ReactNode;  // ปุ่มเสริมก่อนปุ่มปิด (เช่น "เปิดเต็มจอ")
  storageKey?: string;              // จำขนาด (px) ต่อคีย์นี้
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  bodyClassName?: string;
};

export function ResizableModal({
  onClose, children, title, headerActions,
  storageKey, defaultWidth = 1150, defaultHeight = 780,
  minWidth = 360, minHeight = 320, bodyClassName,
}: Props) {
  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    let w = Math.min(defaultWidth, Math.round(vw * 0.96));
    let h = Math.min(defaultHeight, Math.round(vh * 0.92));
    if (typeof window !== "undefined" && storageKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (saved && typeof saved.w === "number" && typeof saved.h === "number") {
          w = Math.min(saved.w, Math.round(vw * 0.98));
          h = Math.min(saved.h, Math.round(vh * 0.96));
        }
      } catch { /* ค่าเดิมพัง → ใช้ default */ }
    }
    return { w: Math.max(minWidth, w), h: Math.max(minHeight, h) };
  });

  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.max(minWidth, Math.min(Math.round(vw * 0.98), d.w + (e.clientX - d.x)));
    const h = Math.max(minHeight, Math.min(Math.round(vh * 0.96), d.h + (e.clientY - d.y)));
    setSize({ w, h });
  }, [minWidth, minHeight]);

  const onUp = useCallback(() => { dragRef.current = null; setDragging(false); }, []);

  // จำขนาดทุกครั้งที่เปลี่ยน
  useEffect(() => {
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(size)); } catch { /* ignore */ } }
  }, [size, storageKey]);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, onMove, onUp]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    setDragging(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden relative max-w-[98vw] max-h-[96vh]"
        style={{ width: size.w, height: size.h }}
        onClick={(e) => e.stopPropagation()}>
        {/* หัว */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">{title}</div>
          {headerActions}
          <button onClick={onClose} aria-label="ปิด"
            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center shrink-0">✕</button>
        </div>

        {/* เนื้อหา */}
        <div className={`flex-1 min-h-0 ${bodyClassName ?? ""}`}>{children}</div>

        {/* มุมลากปรับขนาด (ขวาล่าง) */}
        <div onMouseDown={startDrag} title="ลากเพื่อปรับขนาด"
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 text-slate-400 hover:text-slate-600 z-10"
          style={{ touchAction: "none" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M11 5 L5 11 M11 9 L9 11" />
          </svg>
        </div>

        {/* ตอนลาก: overlay โปร่งใสคลุมทั้งจอ กันไม่ให้ iframe แย่ง mouse */}
        {dragging && <div className="fixed inset-0 z-[60] cursor-nwse-resize" />}
      </div>
    </div>
  );
}
