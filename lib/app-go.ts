"use client";

import { useEffect, useRef } from "react";

/**
 * ของกลาง: "เปิดหน้านี้ในแอปเดี่ยวที่เปิดอยู่" (/app/<key>)
 * ของลอยทั้งระบบ (ป๊อปเตือนงาน ฯลฯ) อยู่ชั้นบนสุด — ถ้า router.push ตรง ๆ จะพาหลุดออกจากแอปเดี่ยวไป ERP เต็ม
 * → ยิงคำขอนี้ก่อน: หน้าแอปเดี่ยวรับไปเปิดในแท็บเมนูของตัวเอง (คืน true)
 *   ไม่มีแอปเดี่ยวรับ (ใช้ ERP เต็มอยู่) คืน false = ให้ผู้เรียกนำทางแบบเดิม
 */
const EVENT = "erp:app-go";
type AppGoDetail = { path: string; handled: boolean };

export function isStandaloneAppPath(pathname: string): boolean {
  return /^\/app\/[^/]+/.test(pathname);
}

export function openInStandaloneApp(path: string): boolean {
  if (typeof window === "undefined") return false;
  const detail: AppGoDetail = { path, handled: false };
  window.dispatchEvent(new CustomEvent<AppGoDetail>(EVENT, { detail }));
  return detail.handled;
}

/** หน้าแอปเดี่ยววางบรรทัดเดียว: useAppGo((path) => เปิดได้ไหม) — คืน true ถ้าเปิดในแอปนี้แล้ว */
export function useAppGo(handler: (path: string) => boolean): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<AppGoDetail>).detail;
      if (d && !d.handled && ref.current(d.path)) d.handled = true;
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
}
