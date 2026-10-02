"use client";

/**
 * FloatingPanel — แผงลอย (ของกลาง): เปิดแบบ drawer แต่ "ลอย" อยู่เหนือหน้า ลากย้าย/ย่อ/ขยายได้ ไม่บังเนื้อหาข้างหลัง
 *
 * ใช้เมื่อ: อยากให้ผู้ใช้ทำงานในแผง "พร้อมกับ" ดูหน้าหลัก (เช่น จัดใบนำเสนอขณะดูบอร์ด) — ต่างจาก ERPModal/Drawer ที่บังทั้งจอ
 * ห้ามใช้เมื่อ: เป็นฟอร์มที่ต้องกรอกให้เสร็จก่อนทำอย่างอื่น (ใช้ ERPModal)
 *
 * - จอคอม/แท็บเล็ต: กล่อง fixed ลากด้วยหัว · ปุ่ม ▁ ย่อเหลือป้ายเล็กมุมล่างขวา · ปุ่ม ⛶ ขยายเต็ม · ✕ ปิด
 * - มือถือ (<640px): เปิดเต็มจอ (ลากไม่ได้)
 * - ไม่มี backdrop → คลิกข้างนอกไม่ปิด (ตั้งใจ) · กด Esc ปิด
 * - z-index 70 (อยู่เหนือ ERPModal z-50 · ใต้ FloatingDropdown 1000)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Pos = { x: number; y: number };

export function FloatingPanel({ open, onClose, title, icon, children, width = 440, height, footer, storageKey }: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  children: ReactNode;
  /** ความกว้างเริ่มต้น (px) */
  width?: number;
  /** ความสูงเริ่มต้น (px) — ไม่ส่ง = 80% ของจอ */
  height?: number;
  footer?: ReactNode;
  /** จำตำแหน่ง/ขนาดต่อเครื่อง (localStorage) — ไม่ส่ง = ไม่จำ */
  storageKey?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [phone, setPhone] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setPhone(window.innerWidth < 640);
    apply(); window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // ตำแหน่ง/ขนาดเริ่มต้น: ชิดขวา กลางจอ (หรือค่าที่จำไว้)
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let saved: { pos?: Pos; size?: { w: number; h: number } } | null = null;
    if (storageKey) { try { saved = JSON.parse(localStorage.getItem(`floating-panel:${storageKey}`) ?? "null"); } catch { saved = null; } }
    const w = Math.min(saved?.size?.w ?? width, window.innerWidth - 16);
    const h = Math.min(saved?.size?.h ?? height ?? Math.round(window.innerHeight * 0.8), window.innerHeight - 16);
    setSize({ w, h });
    const p = saved?.pos ?? { x: window.innerWidth - w - 16, y: Math.max(8, Math.round((window.innerHeight - h) / 2)) };
    setPos({ x: Math.max(0, Math.min(p.x, window.innerWidth - 80)), y: Math.max(0, Math.min(p.y, window.innerHeight - 60)) });
    setMinimized(false); setMaximized(false);
  }, [open, width, height, storageKey]);

  const persist = useCallback((p: Pos | null, s: { w: number; h: number } | null) => {
    if (!storageKey || !p || !s) return;
    try { localStorage.setItem(`floating-panel:${storageKey}`, JSON.stringify({ pos: p, size: s })); } catch { /* ไม่มี storage */ }
  }, [storageKey]);

  // Esc = ปิด
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // ลากหัว
  const onHeadDown = (e: React.PointerEvent) => {
    if (phone || maximized || !pos) return;
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const x = Math.max(-((size?.w ?? 0) - 80), Math.min(e.clientX - d.dx, window.innerWidth - 80));
    const y = Math.max(0, Math.min(e.clientY - d.dy, window.innerHeight - 40));
    setPos({ x, y });
  };
  const onHeadUp = () => { if (dragRef.current) { dragRef.current = null; persist(pos, size); } };
  // ย่อ/ขยายขนาดจากมุมล่างขวา
  const onResizeDown = (e: React.PointerEvent) => {
    if (!size) return;
    resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current; if (!r) return;
    setSize({ w: Math.max(320, Math.min(r.w + (e.clientX - r.x), window.innerWidth - (pos?.x ?? 0))), h: Math.max(240, Math.min(r.h + (e.clientY - r.y), window.innerHeight - (pos?.y ?? 0))) });
  };
  const onResizeUp = () => { if (resizeRef.current) { resizeRef.current = null; persist(pos, size); } };

  if (!open || !mounted || !pos || !size) return null;

  const full = phone || maximized;
  const style: React.CSSProperties = full
    ? { left: 0, top: 0, width: "100vw", height: "100dvh", borderRadius: 0 }
    : minimized
      ? { right: 16, bottom: 16, width: "auto" }
      : { left: pos.x, top: pos.y, width: size.w, height: size.h };

  return createPortal(
    <div className={`fixed z-[70] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl ${full ? "" : "rounded-xl"}`} style={style} role="dialog" aria-label={title}>
      <div onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}
        className={`flex h-11 shrink-0 select-none items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 ${full || minimized ? "" : "cursor-move"}`}>
        {icon && <span className="text-base">{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{title}</span>
        {!phone && (
          <>
            <button type="button" onClick={() => { setMinimized((m) => !m); setMaximized(false); }} title={minimized ? "ขยายกลับ" : "ย่อเก็บ"}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200">{minimized ? "▢" : "▁"}</button>
            {!minimized && (
              <button type="button" onClick={() => setMaximized((m) => !m)} title={maximized ? "กลับขนาดเดิม" : "ขยายเต็มจอ"}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200">{maximized ? "🗗" : "⛶"}</button>
            )}
          </>
        )}
        <button type="button" onClick={onClose} title="ปิด" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600">✕</button>
      </div>
      {!minimized && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2">{footer}</div>}
          {!full && (
            <div onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={onResizeUp} title="ลากเพื่อปรับขนาด"
              className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize text-slate-300" style={{ background: "linear-gradient(135deg, transparent 50%, #cbd5e1 50%)" }} />
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
