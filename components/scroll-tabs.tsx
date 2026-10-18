"use client";

/**
 * ScrollTabs (ของกลาง) — แถบแท็บแนวนอนที่ยาวเกินพื้นที่
 *   - แท็บที่เลือกเปลี่ยน (กด/เปิดมา) → เลื่อนแถบให้แท็บนั้นอยู่กลาง → เห็นแท็บข้าง ๆ ทั้งซ้ายและขวา
 *     (เจ้าของขอ 2026-10-18: กดแท็บที่โดนขอบบัง "อันซ้ายกดต้องเลื่อนให้ด้วย")
 *   - มีแท็บซ่อนอยู่เลยขอบ → โชว์ปุ่ม ‹ / › + เงาจางที่ขอบนั้น (กด = เลื่อนเกือบหนึ่งหน้า)
 *   - เลื่อนเฉพาะแนวนอนของแถบเอง (ไม่ดึงหน้า/ลิ้นชักเลื่อนขึ้นลง)
 *
 * ใช้: <ScrollTabs activeKey={active} className="border-b border-slate-200">
 *        {tabs.map((t) => <button key={t.key} data-tab-key={t.key} …>{t.label}</button>)}
 *      </ScrollTabs>
 * ปุ่มแท็บต้องมี data-tab-key = key เดียวกับ activeKey
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function ScrollTabs({ activeKey, className = "", children }: { activeKey?: string | null; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const first = useRef(true);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdge((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);

  // ขนาดแถบ/จำนวนแท็บเปลี่ยน → คำนวณขอบใหม่ (setEdge คืนค่าเดิมถ้าไม่เปลี่ยน จึงไม่วนเรนเดอร์)
  useEffect(() => { update(); });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  // แท็บที่เลือก → เลื่อนมาไว้กลางแถบ
  useEffect(() => {
    const el = ref.current;
    if (!el || !activeKey) return;
    const btn = Array.from(el.querySelectorAll<HTMLElement>("[data-tab-key]")).find((b) => b.dataset.tabKey === activeKey);
    if (!btn) return;
    const c = el.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const target = el.scrollLeft + (b.left - c.left) - (c.width - b.width) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [activeKey]);

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  };

  const arrow = "absolute top-0 bottom-px z-10 flex w-9 items-center text-lg leading-none text-slate-400 hover:text-slate-800";
  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className={`flex items-center gap-1 overflow-x-auto scrollbar-hide ${className}`}>
        {children}
      </div>
      {edge.left && (
        <button type="button" onClick={() => nudge(-1)} aria-label="เลื่อนแท็บไปทางซ้าย" title="มีแท็บอีกทางซ้าย"
          className={`${arrow} left-0 justify-start bg-gradient-to-r from-white via-white/90 to-transparent pl-1`}>‹</button>
      )}
      {edge.right && (
        <button type="button" onClick={() => nudge(1)} aria-label="เลื่อนแท็บไปทางขวา" title="มีแท็บอีกทางขวา"
          className={`${arrow} right-0 justify-end bg-gradient-to-l from-white via-white/90 to-transparent pr-1`}>›</button>
      )}
    </div>
  );
}
