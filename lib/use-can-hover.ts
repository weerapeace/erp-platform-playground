"use client";

/**
 * useCanHover — อุปกรณ์นี้ "ชี้เมาส์ค้าง" ได้จริงไหม (ของกลาง)
 *
 * ปัญหาที่แก้: มือถือ/แท็บเล็ตไม่มีเมาส์ แต่เบราว์เซอร์ยังยิง onMouseEnter ปลอมตอนแตะ
 * → พรีวิวรูปเด้งค้างทับจอ ต้องแตะที่อื่นเพื่อปิด (กวนมากบนหน้าที่มีการ์ดเยอะ)
 *
 * ใช้: const canHover = useCanHover();  → ถ้า false ให้ "ไม่ต้องผูก" onMouseEnter/onMouseLeave เลย
 * (ไม่ใช้ความกว้างจอตัดสิน เพราะแท็บเล็ตแนวนอนก็จอกว้าง — ต้องดูที่ "ชนิดตัวชี้" แทน)
 */
import { useEffect, useState } from "react";

const QUERY = "(hover: hover) and (pointer: fine)";

export function useCanHover(): boolean {
  // เริ่มที่ true เพื่อไม่ให้เดสก์ท็อปกระพริบ — ทัชจะถูกสลับเป็น false ทันทีที่ effect ทำงาน
  const [can, setCan] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const apply = () => setCan(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return can;
}
