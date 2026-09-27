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
 */
import { useEffect, useRef } from "react";

/**
 * @param ready  พร้อมเปิดหรือยัง (เช่น เช็คสิทธิ์เสร็จ / โหลดรายการเสร็จ) — false = ยังไม่เรียก
 * @param open   ฟังก์ชันเปิดใบของหน้านั้น รับ id
 */
export function useOpenParam(ready: boolean, open: (id: string) => void): void {
  const openedRef = useRef<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("open");
    if (!id || openedRef.current === id) return;   // เปิดไปแล้ว ไม่เปิดซ้ำตอน re-render
    openedRef.current = id;
    openRef.current(id);
  }, [ready]);
}

/**
 * ของกลาง — เปิด "ฟอร์มสร้างใหม่" อัตโนมัติจาก `?new=1` บน URL
 * ใช้ทำ "คำสั่งลัด" จาก Global Search (เช่น พิมพ์ "สร้าง PO") → เด้งมาหน้านั้นพร้อมเปิดฟอร์มให้เลย
 * @param ready  พร้อมไหม (เช่น มีสิทธิ์สร้าง + โหลดค่าตั้งต้นเสร็จ)
 * @param openCreate ฟังก์ชันเปิดฟอร์มสร้างใหม่ของหน้านั้น
 */
export function useNewParam(ready: boolean, openCreate: () => void): void {
  const doneRef = useRef(false);
  const fnRef = useRef(openCreate);
  fnRef.current = openCreate;
  useEffect(() => {
    if (!ready || doneRef.current || typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("new");
    if (!v || v === "0") return;
    doneRef.current = true;
    fnRef.current();
  }, [ready]);
}

/** สร้างลิงก์ตรงถึงใบ — ตัวจริงอยู่ lib/open-link.ts (server-safe) · re-export ให้หน้าจอที่ import จากที่นี่อยู่แล้ว
 *  ⚠️ API route ห้าม import จากไฟล์นี้ (เป็น "use client") — ให้ import จาก @/lib/open-link แทน */
export { openLink } from "./open-link";
