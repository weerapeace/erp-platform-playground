"use client";

// ============================================================
// 📌 หัวหน้าติดบนตอนเลื่อน (ของกลาง) — แถบปุ่มของหน้าค้างอยู่ใต้แถบเมนูของแอป เลื่อนไปไหนก็ยังเจอ
//   ทำหัวทั้งก้อนเป็น sticky แบบ "เหลือโชว์แค่แถบล่าง" (top ติดลบ) → ป้าย/คำอธิบายด้านบนเลื่อนหายไปเอง เหลือแถบบาง
//   ความสูงหัวไม่เปลี่ยนตอนติด → เนื้อหาด้านล่างไม่กระตุก · `stuck` ไว้สลับหน้าตาตอนติด (พื้นหลัง / ชื่อหน้าแบบย่อ)
//   วัดแถบบนของแอปเองจาก element ที่ติด `data-shell-topbar` (playground-shell / standalone-shell)
//   อยู่ในกรอบจำลองมือถือ (DevicePreviewFrame · กรอบเลื่อนเอง) → ติดขอบบนกรอบแทน (ไม่บวกแถบของแอป)
//
//   const sticky = useStickyHeader();
//   <div ref={sticky.headerRef} style={sticky.style} className={sticky.stuck ? "bg-white/90 …" : ""}>
//     …ป้าย / ชื่อหน้า / คำอธิบาย…
//     <div ref={sticky.keepRef}>…ปุ่มที่ต้องเห็นตลอด…</div>    ← ไม่ใส่ keepRef = ติดทั้งก้อน
//   </div>
//   หัวคอลัมน์/หัวตารางที่ sticky ต่อด้านล่าง ใช้ top = sticky.below (px)
// ============================================================

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/** ความสูงแถบบนของแอปที่ติดขอบบนจออยู่ (px) — 0 ถ้าไม่มี/ซ่อน (โหมดโฟกัส · เปิดในกรอบ) */
export function measureShellTop(): number {
  let h = 0;
  document.querySelectorAll<HTMLElement>("[data-shell-topbar]").forEach((el) => {
    if (!el.getClientRects().length) return;   // display:none (แถบของจออีกขนาด)
    const r = el.getBoundingClientRect();
    if (r.top <= 1 && r.bottom > 0) h = Math.max(h, r.bottom);
  });
  return Math.round(h);
}

/** กรอบที่เลื่อนเองที่ใกล้ที่สุด (เช่น กรอบจำลองมือถือ) — null = เลื่อนทั้งหน้า */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}

type Metrics = { top: number; below: number; stuck: boolean };

/** gap = ที่ว่างเหนือส่วนที่ต้องเห็น (px) · watch = ค่าที่เปลี่ยนเมื่อหัวถูกสลับเป็นอีกก้อน (เช่น รูปแบบจอ) ให้วัดใหม่ */
export function useStickyHeader({ gap = 8, enabled = true, watch }: { gap?: number; enabled?: boolean; watch?: string | number | boolean } = {}) {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const keepRef = useRef<HTMLDivElement | null>(null);
  const [m, setM] = useState<Metrics | null>(null);

  const measure = useCallback(() => {
    const header = headerRef.current;
    if (!header || !enabled) { setM(null); return; }
    const parent = scrollParentOf(header);
    const offset = parent ? 0 : measureShellTop();
    const hr = header.getBoundingClientRect();
    const keep = keepRef.current;
    // ส่วนที่ต้องเห็นตลอด = จากขอบบนของ keep (เผื่อ gap) ถึงขอบล่างหัว · ไม่มี keep = ทั้งก้อน
    const keepFrom = keep ? Math.max(0, keep.getBoundingClientRect().top - hr.top - gap) : 0;
    const visible = Math.round(header.offsetHeight - keepFrom);
    const top = offset - Math.round(keepFrom);
    const rootTop = parent ? parent.getBoundingClientRect().top : 0;
    const stuck = (parent ? parent.scrollTop : window.scrollY) > 0 && hr.top - rootTop <= top + 0.5;
    setM((prev) => (prev && prev.top === top && prev.below === offset + visible && prev.stuck === stuck ? prev : { top, below: offset + visible, stuck }));
  }, [gap, enabled]);

  useEffect(() => {
    if (!enabled) { setM(null); return; }
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });   // capture = รวมกรอบที่เลื่อนเอง
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (ro) {
      if (headerRef.current) ro.observe(headerRef.current);
      if (keepRef.current) ro.observe(keepRef.current);
      document.querySelectorAll<HTMLElement>("[data-shell-topbar]").forEach((el) => ro.observe(el));
    }
    const late = window.setTimeout(schedule, 1500);   // แถบบนของแอปบางแถบโผล่ทีหลัง (โหลดเมนูเสร็จ)
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      window.clearTimeout(late);
    };
  }, [measure, enabled, watch]);

  const style: CSSProperties | undefined = m ? { position: "sticky", top: m.top } : undefined;
  return { headerRef, keepRef, style, stuck: !!m?.stuck, below: m?.below ?? null, top: m?.top ?? null };
}
