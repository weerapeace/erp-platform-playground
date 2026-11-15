"use client";

/**
 * useStepHistory — ปุ่ม Back (เบราว์เซอร์ · ปุ่มย้อนของเมาส์ · ปัด/ปุ่มย้อนมือถือ) ย้อน "ทีละก้าว"
 * ของการเดินภายในหน้าเดียว (ของกลาง)
 *
 * ปัญหาที่แก้: หน้าที่เดินลึกลงไปด้วย React state (แฟ้ม → อัลบั้ม → อัลบั้มย่อย · แบรนด์ → Parent)
 * ไม่มีก้าวในประวัติเบราว์เซอร์ → กด Back = เด้งออกจากหน้าไปเลย ทั้งที่อยากถอยแค่ชั้นเดียว
 * (เจ้าของสั่ง 2026-11-15 หน้า SAMPLE Images "เวลากดย้อนกลับให้ย้อนตาม step สิ")
 *
 * ใช้:
 *   const steps = useStepHistory<{ album: string | null }>("sample-album", (s) => go(s?.album ?? null));
 *   const open = (id) => { go(id); steps.push({ album: id }); }     // เดินเอง = จดก้าว
 *   // กด Back → onStep(ก้าวก่อนหน้า) · ย้อนถึงก้าวแรกของหน้า = onStep(null) (= หน้าแรกของหน้านั้น)
 *
 * กฎ:
 *   - เรียก push เฉพาะตอน "ผู้ใช้เดินเอง" — ห้ามเรียกใน onStep (จะวนเพิ่มก้าวไม่จบ)
 *   - ลิ้นชัก/ป๊อปของกลางที่เปิดอยู่ (drawer-history) ปิดด้วย Back ก็ยิง popstate → ข้าม ไม่ถือเป็นการย้อนของหน้า
 *   - ป๊อปที่ใช้ useBackClose ปิดแล้ว popstate จะพากลับมาก้าวเดิมของเรา → onStep ได้ค่าเดิม ให้เช็ก "ค่าเดิมอยู่แล้ว = ไม่ทำอะไร"
 *   - URL ไม่เปลี่ยน (จดใน history.state เท่านั้น) — แบบเดียวกับหน้า brand-album / sku-tag-browser ที่ทำไว้ก่อน
 *   - จอซ้อนชั้นเดียว (เปิด/ปิด) ใช้ lib/use-back-close · ลิ้นชักใช้ lib/drawer-history
 */
import { useCallback, useEffect, useRef } from "react";
import { hasOpenDrawer } from "@/lib/drawer-history";

export function useStepHistory<T>(key: string, onStep: (step: T | null) => void): { push: (step: T) => void } {
  const fn = useRef(onStep);
  fn.current = onStep;
  const tag = `__step:${key}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = (e: PopStateEvent) => {
      if (hasOpenDrawer()) return;
      const step = (e.state as Record<string, unknown> | null)?.[tag] as T | undefined;
      fn.current(step ?? null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tag]);

  const push = useCallback((step: T) => {
    try { window.history.pushState({ [tag]: step }, ""); } catch { /* history ใช้ไม่ได้ (เช่น iframe แปลก ๆ) = ไม่จดก้าว */ }
  }, [tag]);

  return { push };
}
