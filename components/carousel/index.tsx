"use client";
/**
 * 🎠 Carousel (ของกลาง) — การ์ดเรียงแนวนอน การ์ดกลางขยาย ข้าง ๆ หดและจาง · ลูกศร · จุดบอกตำแหน่ง · ปัดนิ้ว · คีย์ ←→ / Enter
 * ทำด้วย CSS transform ล้วน (ไม่ใช้โปรแกรมแอนิเมชันเสริม — หน้าเว็บไม่หนักขึ้น) · เคารพ "ลดการเคลื่อนไหว" ของเครื่อง
 *
 * ใช้:
 *   <Carousel items={brands} index={i} onIndexChange={setI} itemKey={(b) => b.id}
 *     renderItem={(b, active) => <BrandCard b={b} active={active} />} onSelect={(b) => router.push(...)} />
 *   กดการ์ดข้าง ๆ = เลื่อนมากลาง · กดการ์ดกลาง (หรือ Enter) = onSelect
 *
 * ใช้เมื่อ: หน้าเลือก 1 อย่างจากไม่กี่สิบอย่างแบบมีภาพ (เช่น เลือกแบรนด์ /brand-hub)
 * ห้ามใช้เมื่อ: รายการยาวที่ต้องค้นหา/กรอง (ใช้ตารางกลาง/การ์ดกริด) · ดูรูปทีละรูป (ใช้ตัวดูรูปกลาง)
 * อยู่ในพื้นที่ปัดของ useSwipeNav ได้ — ใส่ data-no-swipe ไว้แล้ว (ปัดในกรอบนี้ไม่เปลี่ยนแท็บ)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";

export function Carousel<T>({ items, index, onIndexChange, renderItem, itemKey, onSelect, itemWidth = 240, gap = 20, height = 300, ariaLabel = "เลือกรายการ" }: {
  items: T[];
  index: number;
  onIndexChange: (i: number) => void;
  renderItem: (item: T, active: boolean) => ReactNode;
  itemKey: (item: T) => string;
  /** กดการ์ดกลาง / Enter */
  onSelect?: (item: T) => void;
  itemWidth?: number;
  gap?: number;
  /** ความสูงพื้นที่ (px) — การ์ดอยู่กลางแนวตั้ง */
  height?: number;
  ariaLabel?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [ready, setReady] = useState(false);   // วัดความกว้างครั้งแรกแล้วค่อยเปิดแอนิเมชัน (กันการ์ดไหลเข้าตอนเปิดหน้า)
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);   // เพิ่งปัด → คลิกที่ตามมาไม่นับ (กันปัดแล้วเผลอเข้าแบรนด์)

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    try { setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* เบราว์เซอร์เก่า */ }
    const raf = requestAnimationFrame(() => setReady(true));
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const n = items.length;
  const clamp = useCallback((i: number) => (n ? (i + n) % n : 0), [n]);
  const go = useCallback((i: number) => onIndexChange(clamp(i)), [onIndexChange, clamp]);
  // จอแคบ (มือถือ) → การ์ดไม่เกิน ~78% ของกรอบ ให้เห็นการ์ดข้าง ๆ โผล่มานิดหนึ่ง
  const cardW = width ? Math.min(itemWidth, Math.round(width * 0.78)) : itemWidth;
  const step = cardW + gap;
  const offset = width / 2 - cardW / 2 - index * step;
  const motion = reduce || !ready ? "none" : "transform 420ms cubic-bezier(.2,.8,.2,1), opacity 420ms";

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    else if (e.key === "Enter" && items[index]) { e.preventDefault(); onSelect?.(items[index]); }
  };

  if (n === 0) return null;
  return (
    <div className="select-none" data-no-swipe>
      <div ref={boxRef} role="listbox" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey}
        className="relative overflow-hidden rounded-2xl bg-slate-100/70 outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        // 🐛 overflow-hidden ยังถูกเบราว์เซอร์เลื่อนเองได้ (โฟกัสปุ่ม/scrollIntoView) → การ์ดกลางเลื่อนหลุดกลาง · clip = เลื่อนไม่ได้เลย + รีเซ็ตกันเหนียว
        style={{ height, touchAction: "pan-y", overflow: "clip" }}
        onScroll={(e) => { if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0; }}
        onPointerDown={(e) => { startX.current = e.clientX; dragged.current = false; }}
        onPointerUp={(e) => {
          const s = startX.current; startX.current = null;
          if (s != null && Math.abs(e.clientX - s) > 40) { dragged.current = true; go(index + (e.clientX < s ? 1 : -1)); }
        }}>
        <div className="absolute left-0 flex" style={{ gap, top: "50%", transform: `translate(${offset}px, -50%)`, transition: motion }}>
          {items.map((it, i) => {
            const d = Math.abs(i - index);
            const active = i === index;
            return (
              <div key={itemKey(it)} role="option" aria-selected={active}
                onClick={() => { if (dragged.current) { dragged.current = false; return; } if (active) onSelect?.(it); else go(i); }}
                className="shrink-0 cursor-pointer"
                style={{ width: cardW, transform: `scale(${active ? 1 : 0.86})`, opacity: active ? 1 : d > 1 ? 0.35 : 0.65, transition: motion }}>
                {renderItem(it, active)}
              </div>
            );
          })}
        </div>
        {n > 1 && (
          <>
            <button type="button" aria-label="ก่อนหน้า" onClick={() => go(index - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center"><Icon value="i:arrow-left" /></button>
            <button type="button" aria-label="ถัดไป" onClick={() => go(index + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center"><Icon value="i:arrow-left" className="rotate-180" /></button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {items.map((it, i) => (
            <button key={itemKey(it)} type="button" aria-label={`ไปที่รายการที่ ${i + 1}`} onClick={() => go(i)}
              className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-slate-700" : "w-2 bg-slate-300 hover:bg-slate-400"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
