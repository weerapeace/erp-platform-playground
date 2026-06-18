"use client";

/**
 * NavProgress (ของกลาง) — แถบโหลดด้านบน + กันหน้า "ค้าง" ตอนเปลี่ยนหน้า
 *
 * ปัญหาเดิม: กดเมนูแล้วบางทีหน้าเปลี่ยนช้า/ค้าง และ "ไม่มีสัญญาณอะไรเลย"
 *   → ผู้ใช้นึกว่าปุ่มเสีย ต้องเปิดแท็บใหม่เอง
 *
 * ตัวนี้ทำ 2 อย่าง (ทำงานทั้งแอป — ติดที่ root layout):
 *   1) กดลิงก์ในแอป → ขึ้นแถบโหลดบาง ๆ ด้านบนทันที (รู้ว่าระบบรับคำสั่งแล้ว)
 *   2) ถ้าเปลี่ยนหน้าแบบ in-app แล้ว "ค้าง" เกิน WATCHDOG_MS → เด้งโหลดเต็มหน้าให้เอง
 *      (เหมือนเปิดแท็บใหม่ แต่ทำอัตโนมัติ — ไม่ต้องเปิดเอง)
 *
 * ไม่พึ่ง library ภายนอก (กัน Worker bundle เกิน)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const WATCHDOG_MS = 8000; // เปลี่ยนหน้าค้างนานกว่านี้ = ถือว่าหลุด → โหลดเต็มหน้าแทน

export function NavProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destHref = useRef<string | null>(null);
  const destPath = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (watchdog.current) { clearTimeout(watchdog.current); watchdog.current = null; }
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    destHref.current = null; destPath.current = null;
    setWidth(100);
    timers.current.push(setTimeout(() => { setActive(false); setWidth(0); }, 240));
  }, [clearTimers]);

  const start = useCallback((href: string, path: string) => {
    clearTimers();
    destHref.current = href; destPath.current = path;
    setActive(true);
    setWidth(8);
    // ไหลขึ้นเรื่อย ๆ ให้รู้สึกว่ากำลังทำงาน (ไม่ถึง 100 จนกว่าจะเปลี่ยนหน้าจริง)
    timers.current.push(setTimeout(() => setWidth(35), 120));
    timers.current.push(setTimeout(() => setWidth(62), 450));
    timers.current.push(setTimeout(() => setWidth(82), 1400));
    // กันค้าง: ถ้านานเกินไปยังไม่เปลี่ยนหน้า → โหลดเต็มหน้า (fallback แบบเปิดแท็บใหม่)
    watchdog.current = setTimeout(() => {
      const h = destHref.current;
      if (h && window.location.pathname !== destPath.current) {
        window.location.assign(h);   // hard navigation — หน้าจะโหลดแน่นอน
      } else {
        finish();
      }
    }, WATCHDOG_MS);
  }, [clearTimers, finish]);

  // ดักคลิกลิงก์ภายในแอป → เริ่มแถบโหลด
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const target = a.getAttribute("target");
      if (!href || target === "_blank" || a.hasAttribute("download")) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;                 // ลิงก์นอก → ปล่อยเบราว์เซอร์จัดการ
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // หน้าเดิม
      start(url.pathname + url.search + url.hash, url.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // เปลี่ยน path สำเร็จ → ปิดแถบ (ครั้งแรกที่ mount ไม่ต้องทำ)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (active) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // เคลียร์ timer ตอน unmount
  useEffect(() => clearTimers, [clearTimers]);

  if (!active) return null;
  return (
    <div aria-hidden="true" className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-0.5">
      <div
        className="h-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)] transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
