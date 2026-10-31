"use client";

/**
 * 🔫 useScanGun — ของกลาง: จับ "เครื่องยิงบาร์โค้ด USB" ที่ยิงใส่หน้าเว็บได้เลย ไม่ต้องคลิกช่องค้นก่อน
 *   เครื่องยิงทำตัวเหมือนคีย์บอร์ดที่พิมพ์เร็วมาก แล้วจบด้วย Enter → แยกจากคนพิมพ์ด้วยความเร็ว
 *   (ทุกตัวห่างกันไม่เกิน GAP_MS · ยาวอย่างน้อย MIN_LEN ตัว)
 *   - ไม่ยุ่งตอนพิมพ์ในช่องกรอก (input / textarea / select / contenteditable) และตอนมีป๊อป ERPModal เปิดอยู่
 *   - ตัวอักษรที่ตามมาติด ๆ (ตัวที่ 2 เป็นต้นไป) ถูกกันไม่ให้ไปกดปุ่มลัดของหน้า (เช่น เลข 1-9 = เลือกมุมมองบนบอร์ด)
 *   ใช้คู่กับ <ScanInput> (กล้อง / พิมพ์มือ) — ห้ามเขียนตัวจับเครื่องยิงซ้ำที่อื่น
 */
import { useEffect, useRef } from "react";

const GAP_MS = 60;
const MIN_LEN = 4;

const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

export function useScanGun(onScan: (code: string) => void, opts: { enabled?: boolean } = {}) {
  const { enabled = true } = opts;
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!enabled) return;
    let buf = "", last = 0;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target) || document.querySelector("[data-erp-modal]")) { buf = ""; return; }
      const now = performance.now();
      const fast = now - last <= GAP_MS;
      last = now;
      if (!fast) buf = "";
      if (e.key === "Enter") {
        if (fast && buf.length >= MIN_LEN) { e.preventDefault(); e.stopImmediatePropagation(); cb.current(buf); }
        buf = "";
        return;
      }
      if (e.key.length !== 1) return;
      if (fast && buf) { e.preventDefault(); e.stopImmediatePropagation(); }   // ตัวที่ตามมาติด ๆ = ของเครื่องยิง ไม่ใช่ปุ่มลัด
      buf += e.key;
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [enabled]);
}
