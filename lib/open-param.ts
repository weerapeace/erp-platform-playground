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

/** สร้างลิงก์ตรงถึงใบ เช่น openLink("/sales-orders", id) → "/sales-orders?open=<id>" */
export function openLink(path: string, id: string | null | undefined): string {
  return id ? `${path}?open=${encodeURIComponent(id)}` : path;
}
