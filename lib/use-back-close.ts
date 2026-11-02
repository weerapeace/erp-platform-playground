"use client";

/**
 * useBackClose — ปุ่ม "ย้อนกลับ" ของเบราว์เซอร์/มือถือ = ปิดหน้าจอซ้อน (ของกลาง)
 *
 * ปัญหาที่แก้: หน้าจอที่เปิดทับด้วย state (หน้าตะกร้า, ป๊อปเต็มจอ, drawer) ไม่ได้อยู่ใน
 * ประวัติเบราว์เซอร์ → กด back / ปัดขวาบนมือถือ = **เด้งออกจากหน้านั้นไปเลย** ทั้งที่ผู้ใช้
 * แค่อยากถอยกลับไปหน้าก่อนหน้าในจอเดียวกัน
 *
 * วิธีทำ: ตอนเปิด เพิ่ม 1 ก้าวในประวัติ (URL เดิม) · กด back = popstate → เรียก onClose
 *         ถ้าปิดด้วยปุ่มในจอเอง จะถอยประวัติคืนให้ 1 ก้าว (ประวัติไม่บวม กด back ต่อไม่ต้องกด 2 ที)
 *
 * ใช้:  useBackClose(cartOpen, () => setCartOpen(false));
 *
 * จอซ้อนหลายชั้น (เช่น หน้าขอซื้อ: รวมตามรุ่น → เปิดทีละใบ) — back 1 ครั้ง = ปิดแค่ชั้นบนสุด
 *   แต่ละชั้นจำ id ก้าวของตัวเอง · ถ้า back แล้วกลับมาเจอก้าวของเรา = ชั้นที่ทับเราถูกปิด ไม่ใช่เรา → ไม่ปิด
 */
import { useEffect, useRef } from "react";

export function useBackClose(open: boolean, onClose: () => void, key = "view"): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /**
   * ⚠️ ต้องประกาศ effect นี้ "ก่อน" ตัวล่าง — React ล้าง effect ตามลำดับที่ประกาศ
   * ตอนคอมโพเนนต์ถูกถอด (เช่นผู้ใช้กดเมนูอื่นทั้งที่ยังเปิดจอซ้อนอยู่) ธงนี้จะถูกตั้งก่อน
   * แล้วตัวล่างจะ "ไม่" สั่ง history.back() ทับการเปลี่ยนหน้าของผู้ใช้
   */
  const unmounted = useRef(false);
  useEffect(() => () => { unmounted.current = true; }, []);
  const stepId = useRef(`${key}:${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let mine = true;                                  // ก้าวที่เราเพิ่มยังอยู่บนสุดไหม
    window.history.pushState({ __backClose: key, __id: stepId.current }, "");
    const onPop = () => {
      if ((window.history.state as { __id?: string } | null)?.__id === stepId.current) return;   // ชั้นบนเราถูกปิด — เรายังอยู่
      mine = false; closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // ปิดเองจากปุ่มในจอ (ไม่ได้มาจาก back) → เก็บกวาดก้าวที่เพิ่มไว้
      if (mine) window.history.back();
    };
  }, [open, key]);
}
