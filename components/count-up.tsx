"use client";

/**
 * ตัวเลขวิ่งขึ้น (ของกลาง) — แอนิเมชันตัวเลขจากค่าเดิมไปค่าใหม่ ~0.8 วิ (ease-out)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-22 (แดชบอร์ดช่องทางขาย): "ขอเปลี่ยนดีไซน์เป็นปกติ … แต่อยากให้มี animation ด้วย"
 * ค้นทะเบียนแล้วไม่มีตัวทำงานนี้ (มี AnimatedIcon/ResultBurst สำหรับไอคอน/ผลลัพธ์ — คนละงาน)
 * ใช้: <CountUp value={12345} format={(n) => "฿" + Math.round(n).toLocaleString("th-TH")} />
 *   ค่าเปลี่ยน (เช่น รีเฟรช) = วิ่งจากค่าเดิมไปค่าใหม่ · ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" ในเครื่อง = โชว์ค่าเลย ไม่วิ่ง
 * ห้ามใช้กับช่องกรอก/ตัวเลขที่ต้องอ่านทันที (เช่น ราคาในฟอร์ม)
 */
import { useEffect, useRef, useState } from "react";

export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("th-TH"), duration = 800, className }: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || duration <= 0) { fromRef.current = target; setShown(target); return; }
    const start = performance.now(); const from = fromRef.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const v = from + (target - from) * (1 - Math.pow(1 - p, 3));
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = target; };
  }, [value, duration]);
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{format(shown)}</span>;
}
