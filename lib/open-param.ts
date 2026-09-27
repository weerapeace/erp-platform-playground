"use client";

/**
 * ของกลาง — เปิดเอกสารใบที่ระบุอัตโนมัติจาก `?open=<id>` บน URL
 *
 * ใช้ทำ "ลิงก์ตรงถึงใบ" จากหน้าอื่น เช่น กระดานเงินสดกด "เปิดเอกสารต้นทาง"
 * แล้วเด้งไปหน้ารายการพร้อมเปิดป๊อปของใบนั้นให้เลย ไม่ต้องไล่หาเอง
 *
 * หน้าที่ใช้ MasterCRUD มีตัวนี้ในตัวอยู่แล้ว — hook นี้สำหรับหน้าที่เขียนป๊อปรายละเอียดเอง
 * (ใบขาย · ใบวางบิล · รายการ PO ฯลฯ) จะได้ใช้ชื่อพารามิเตอร์ `open` เหมือนกันทั้งระบบ
 *
 * ⚠️ อ่านจาก window.location ไม่ใช้ useSearchParams —
 * useSearchParams บังคับให้ต้องมี <Suspense> ครอบ ไม่งั้นพังตอน build (prerender)
 *
 * 🔁 กรณี "อยู่หน้านั้นอยู่แล้ว" (เช่นอยู่หน้า SKU แล้วกดผลค้นหา SKU ตัวอื่นจาก Global Search):
 *   URL เปลี่ยนแค่ query → หน้าไม่ mount ใหม่ → effect ตอน mount ไม่ทำงาน
 *   จึงมี announceParams(href) ให้ตัวที่สั่งนำทางยิง event บอกหน้าปัจจุบัน — hook ทั้งสองฟัง event นี้ด้วย
 */
import { useEffect, useRef } from "react";

export const OPEN_PARAM_EVENT = "erp:open-param";
export type OpenParamDetail = { open?: string; new?: boolean };

/**
 * เรียกคู่กับ router.push(href) เสมอเมื่อ href มี `?open=` หรือ `?new=1`
 * → ถ้าเป็นหน้าเดียวกับที่เปิดอยู่ hook จะเปิดใบ/ฟอร์มให้ทันที · ถ้าเป็นหน้าอื่น hook ตอน mount อ่านจาก URL เอง
 */
export function announceParams(href: string): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(href, window.location.origin);
    const open = u.searchParams.get("open");
    const nw = u.searchParams.get("new");
    if (!open && !nw) return;
    const detail: OpenParamDetail = { open: open ?? undefined, new: !!nw && nw !== "0" };
    // ยิงหลัง router เปลี่ยน URL แล้ว (tick ถัดไป)
    setTimeout(() => window.dispatchEvent(new CustomEvent<OpenParamDetail>(OPEN_PARAM_EVENT, { detail })), 60);
  } catch { /* href เพี้ยน — ไม่ต้องยิง */ }
}

/**
 * @param ready  พร้อมเปิดหรือยัง (เช่น เช็คสิทธิ์เสร็จ / โหลดรายการเสร็จ) — false = ยังไม่เรียก
 * @param open   ฟังก์ชันเปิดใบของหน้านั้น รับ id
 */
export function useOpenParam(ready: boolean, open: (id: string) => void): void {
  const openedRef = useRef<{ id: string; at: number } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // ตอน mount / พร้อม → อ่านจาก URL
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id || openedRef.current?.id === id) return;   // เปิดไปแล้ว ไม่เปิดซ้ำตอน re-render
    openedRef.current = { id, at: Date.now() };
    openRef.current(id);
  }, [ready]);

  // อยู่หน้าเดิมแล้วมีคนสั่งเปิดใบใหม่ (Global Search ฯลฯ) → เปิดทันที
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEvt = (e: Event) => {
      const id = (e as CustomEvent<OpenParamDetail>).detail?.open;
      if (!id || !readyRef.current) return;
      // กันซ้ำกับ effect ตอน mount ที่เพิ่งเปิด id เดียวกัน (ตอนเปลี่ยนหน้า event ตามมาติด ๆ)
      if (openedRef.current?.id === id && Date.now() - openedRef.current.at < 1500) return;
      openedRef.current = { id, at: Date.now() };
      openRef.current(id);
    };
    window.addEventListener(OPEN_PARAM_EVENT, onEvt);
    return () => window.removeEventListener(OPEN_PARAM_EVENT, onEvt);
  }, []);
}

/**
 * ของกลาง — เปิด "ฟอร์มสร้างใหม่" อัตโนมัติจาก `?new=1` บน URL
 * ใช้ทำ "คำสั่งลัด" จาก Global Search (เช่น พิมพ์ "สร้าง PO") → เด้งมาหน้านั้นพร้อมเปิดฟอร์มให้เลย
 * @param ready  พร้อมไหม (เช่น มีสิทธิ์สร้าง + โหลดค่าตั้งต้นเสร็จ)
 * @param openCreate ฟังก์ชันเปิดฟอร์มสร้างใหม่ของหน้านั้น
 */
export function useNewParam(ready: boolean, openCreate: () => void): void {
  const doneAtRef = useRef<number>(0);
  const fnRef = useRef(openCreate);
  fnRef.current = openCreate;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (!ready || doneAtRef.current || typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("new");
    if (!v || v === "0") return;
    doneAtRef.current = Date.now();
    fnRef.current();
  }, [ready]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEvt = (e: Event) => {
      if (!(e as CustomEvent<OpenParamDetail>).detail?.new || !readyRef.current) return;
      if (Date.now() - doneAtRef.current < 1500) return;   // เพิ่งเปิดจากตอน mount ไปแล้ว
      doneAtRef.current = Date.now();
      fnRef.current();
    };
    window.addEventListener(OPEN_PARAM_EVENT, onEvt);
    return () => window.removeEventListener(OPEN_PARAM_EVENT, onEvt);
  }, []);
}

/** สร้างลิงก์ตรงถึงใบ — ตัวจริงอยู่ lib/open-link.ts (server-safe) · re-export ให้หน้าจอที่ import จากที่นี่อยู่แล้ว
 *  ⚠️ API route ห้าม import จากไฟล์นี้ (เป็น "use client") — ให้ import จาก @/lib/open-link แทน */
export { openLink } from "./open-link";
