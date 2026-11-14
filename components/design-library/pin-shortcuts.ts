"use client";

/**
 * 📚 Design Library — คีย์ลัดของจุดบนรูป + ย้อนกลับ (รอบ 7 · เจ้าของเลือก 2026-11-14)
 *   Delete / Backspace = ลบจุดที่เลือก · Ctrl+C / Ctrl+V = คัดลอก-วาง (ผ่านคลิปบอร์ด → วางข้ามสูตร/ข้ามแท็บได้)
 *   Ctrl+D = ทำซ้ำ · ลูกศร = ขยับทีละ 0.5% (Shift = 2%) · Ctrl+Z = ย้อน · Ctrl+Shift+Z / Ctrl+Y = ทำซ้ำที่ย้อน · Esc = ปิดป๊อปจุด
 *   (Alt+ลากจุด = ทำซ้ำ อยู่ใน Stage ของ recipe-editor)
 * ไม่ทำงานตอนพิมพ์ในช่อง หรือมีป๊อปอัป/หน้าต่างเต็มจอเปิดทับ (ปล่อยให้ตัวนั้นใช้ Delete/Esc ของมันเอง)
 * คัดลอก/วางใช้ event copy/paste ของเบราว์เซอร์ (อ่านคลิปบอร์ดได้โดยไม่ต้องขอสิทธิ์) · ตัวอักษรใช้ shortcutKey (คีย์บอร์ดไทยก็ได้)
 */
import { useEffect, useRef } from "react";
import { shortcutKey } from "@/lib/shortcut-key";
import { pinFromClipboard, pinToClipboard, type Pin, type PinCopy } from "@/lib/design-library";

/** ประวัติไว้ย้อนกลับ — แก้ต่อเนื่องภายใน 0.6 วิ (ลากจุด/พิมพ์โน้ต) นับเป็นครั้งเดียว · เก็บ 60 ครั้ง */
export function useHistory<T>() {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastAt = useRef(0);
  return useRef({
    record(prev: T) {
      const now = Date.now();
      if (!past.current.length || now - lastAt.current > 600) {
        past.current.push(prev);
        if (past.current.length > 60) past.current.shift();
      }
      lastAt.current = now;
      future.current = [];
    },
    undo(cur: T): T | null {
      const p = past.current.pop();
      if (p === undefined) return null;
      future.current.push(cur); lastAt.current = 0;
      return p;
    },
    redo(cur: T): T | null {
      const n = future.current.pop();
      if (n === undefined) return null;
      past.current.push(cur); lastAt.current = 0;
      return n;
    },
    reset() { past.current = []; future.current = []; lastAt.current = 0; },
  }).current;
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};
/** มีป๊อปอัปกลาง / หน้าต่างเต็มจอ (แผงผ้า z-140) เปิดทับอยู่ไหม */
const overlayOpen = () => typeof document !== "undefined" && !!document.querySelector('[data-erp-modal], [role="dialog"], [class*="z-[140]"]');
const hasTextSelection = () => (typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "").length > 0 : false);

export function usePinShortcuts(o: {
  enabled: boolean;          // มีสิทธิ์แก้ (ดูอย่างเดียว = ใช้แค่ Esc / คัดลอก)
  canEdit: boolean;
  sel: number | null;
  pins: Pin[];               // จุดตามชุดสีที่ดูอยู่ (คัดลอกของที่เห็น)
  onDelete: (i: number) => void;
  onPaste: (p: PinCopy) => void;
  onDuplicate: (i: number) => void;
  onNudge: (i: number, dx: number, dy: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onEscape: () => void;
  onCopied: () => void;
}) {
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = ref.current;
      if (!c.enabled || e.defaultPrevented || typing(e.target) || overlayOpen()) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = shortcutKey(e);
      if (e.key === "Escape" && c.sel != null) { c.onEscape(); return; }
      if (!c.canEdit) return;
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) c.onRedo(); else c.onUndo(); return; }
      if (mod && k === "y") { e.preventDefault(); c.onRedo(); return; }
      if (c.sel == null || !c.pins[c.sel]) return;
      if (mod && k === "d") { e.preventDefault(); c.onDuplicate(c.sel); return; }
      if (!mod && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); c.onDelete(c.sel); return; }
      const step = e.shiftKey ? 2 : 0.5;
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (d && !mod && !e.altKey) { e.preventDefault(); c.onNudge(c.sel, d[0], d[1]); }
    };
    const onCopy = (e: ClipboardEvent) => {
      const c = ref.current;
      if (!c.enabled || c.sel == null || !c.pins[c.sel] || typing(e.target) || overlayOpen() || hasTextSelection()) return;
      e.clipboardData?.setData("text/plain", pinToClipboard(c.pins[c.sel]));
      e.preventDefault();
      c.onCopied();
    };
    const onPasteEv = (e: ClipboardEvent) => {
      const c = ref.current;
      if (!c.enabled || !c.canEdit || typing(e.target) || overlayOpen()) return;
      const p = pinFromClipboard(e.clipboardData?.getData("text/plain"));
      if (!p) return;   // ไม่ใช่จุด (เช่น รูป) → ปล่อยให้ตัวอื่นจัดการ
      e.preventDefault();
      c.onPaste(p);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPasteEv);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("copy", onCopy); document.removeEventListener("paste", onPasteEv); };
  }, []);
}
