"use client";
// useEscLayer — ให้ชั้นลอย (ป๊อป/ลิ้นชัก/แผ่นล่าง/ดูรูปเต็มจอ/แผงลอย) ปิดด้วย Esc ทีละชั้น
// ใช้กองกลาง lib/esc-stack กองเดียวทั้งระบบ — ชั้นบนสุดปิดก่อนเสมอ ไม่ว่าจะเป็นของชนิดไหน
//   useEscLayer(open, () => setOpen(false));            // ฟัง Esc ให้เลย
//   const isTop = useEscLayer(open);                      // ไม่ส่ง onEsc = แค่จดชั้น แล้วเช็ก isTop() เองใน handler เดิม
// ข้าม Esc ที่ช่องพิมพ์ด้านในจัดการแล้ว (e.defaultPrevented) เช่น ยกเลิกแก้ในช่อง / ปิด dropdown ในป๊อป
import { useEffect, useRef } from "react";
import { isTopEscLayer, popEscLayer, pushEscLayer } from "@/lib/esc-stack";

export function useEscLayer(open: boolean, onEsc?: () => void): () => boolean {
  const id = useRef(0);
  const cb = useRef(onEsc);
  cb.current = onEsc;
  useEffect(() => {
    if (!open) return;
    const my = pushEscLayer();
    id.current = my;
    const hasHandler = !!cb.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !isTopEscLayer(my)) return;
      e.preventDefault();          // ชั้นล่าง/ตัวฟังอื่นรู้ว่า Esc นี้ถูกใช้แล้ว
      cb.current?.();
    };
    if (hasHandler) document.addEventListener("keydown", onKey);
    return () => {
      if (hasHandler) document.removeEventListener("keydown", onKey);
      popEscLayer(my);
    };
  }, [open]);
  return () => isTopEscLayer(id.current);
}
