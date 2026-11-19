"use client";
/**
 * SectionJumpNav + SectionBlock + useSectionSpy — ของกลาง: "เมนูกระโดดไปหัวข้อ" ในหน้า/ป๊อปที่ยาว
 *
 * ใช้ทำอะไร: ฟอร์มยาวที่มีหลายหัวข้อเรียงลงมา (เช่น ป๊อปแก้ใบสั่งผลิต) → ทุกส่วนยังอยู่หน้าเดียวเลื่อนยาว
 *            แต่มีเมนูซ้าย (PC) / แถบชิปด้านบน (มือถือ) กดแล้วเลื่อนไปหัวข้อนั้น + ไฮไลต์หัวข้อที่กำลังดูอยู่
 *            + ป้ายเตือนต่อหัวข้อ (เช่น "วัตถุดิบ 1" สีแดง) · SectionBlock = กล่องหัวข้อมีแถบสีคั่น ให้รู้ว่าเริ่มหัวข้อใหม่
 * ใช้เมื่อไหร่: ป๊อป/ลิ้นชัก/หน้า ที่มี ~5 หัวข้อขึ้นไปและอยากให้เห็นต่อกันได้ (ไม่ซ่อนเป็นแท็บ)
 * ห้ามใช้เมื่อ: หน้าตั้งค่าที่กดแล้ว "เปลี่ยนเนื้อหา" ทั้งก้อน → SettingsNavLayout · แท็บธรรมดา → ScrollTabs
 *
 * ไม่เก็บข้อมูล ไม่ยิง API · หาตัวเลื่อน (scroll container) เองจากกล่องหัวข้อแรก
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";

export type SectionTone = "slate" | "blue" | "violet" | "teal" | "amber" | "emerald" | "indigo" | "rose";
export type JumpSection = {
  id: string;
  label: string;
  icon?: string;
  tone: SectionTone;
  /** ป้ายต่อหัวข้อ เช่น จำนวนที่ต้องแก้ · danger = แดง · warning = เหลือง */
  badge?: { text: string; tone: "danger" | "warning" } | null;
};

// โทนสีต่อหัวข้อ — แถบหัว (head) · จุดในเมนู (dot) · ตอนเลือก (active)
const TONE: Record<SectionTone, { head: string; border: string; dot: string; active: string }> = {
  slate:   { head: "bg-slate-50 text-slate-700",     border: "border-slate-200",   dot: "bg-slate-400",   active: "bg-slate-100 text-slate-800" },
  blue:    { head: "bg-blue-50 text-blue-800",       border: "border-blue-200",    dot: "bg-blue-500",    active: "bg-blue-50 text-blue-800" },
  violet:  { head: "bg-violet-50 text-violet-800",   border: "border-violet-200",  dot: "bg-violet-500",  active: "bg-violet-50 text-violet-800" },
  teal:    { head: "bg-teal-50 text-teal-800",       border: "border-teal-200",    dot: "bg-teal-500",    active: "bg-teal-50 text-teal-800" },
  amber:   { head: "bg-amber-50 text-amber-800",     border: "border-amber-200",   dot: "bg-amber-500",   active: "bg-amber-50 text-amber-800" },
  emerald: { head: "bg-emerald-50 text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500", active: "bg-emerald-50 text-emerald-800" },
  indigo:  { head: "bg-indigo-50 text-indigo-800",   border: "border-indigo-200",  dot: "bg-indigo-500",  active: "bg-indigo-50 text-indigo-800" },
  rose:    { head: "bg-rose-50 text-rose-800",       border: "border-rose-200",    dot: "bg-rose-500",    active: "bg-rose-50 text-rose-800" },
};
const BADGE = { danger: "bg-rose-100 text-rose-700", warning: "bg-amber-100 text-amber-800" };

function findScroller(el: HTMLElement | null): HTMLElement | Window {
  let p = el?.parentElement ?? null;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
    p = p.parentElement;
  }
  return window;
}

/** จำว่ากำลังดูหัวข้อไหน (ตามตำแหน่งเลื่อน) + ฟังก์ชันกระโดดไปหัวข้อ */
export function useSectionSpy(ids: string[], offset = 120) {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");
  const lock = useRef(0);   // กดเมนูแล้วระหว่างเลื่อนนุ่ม ๆ อย่าให้ไฮไลต์กระโดดไปมา
  const key = ids.join("|");
  useEffect(() => {
    if (ids.length === 0) return;
    let scroller: HTMLElement | Window | null = null;
    const calc = () => {
      if (Date.now() < lock.current) return;
      const topEdge = scroller && scroller !== window ? (scroller as HTMLElement).getBoundingClientRect().top : 0;
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - topEdge <= offset) cur = id;
      }
      // เลื่อนจนสุดแล้ว = หัวข้อสุดท้าย
      if (scroller && scroller !== window) { const s = scroller as HTMLElement; if (s.scrollTop + s.clientHeight >= s.scrollHeight - 4) cur = ids[ids.length - 1]; }
      setActiveId(cur);
    };
    // รอให้เนื้อหาวาดเสร็จก่อนหาตัวเลื่อน
    const t = setTimeout(() => {
      scroller = findScroller(document.getElementById(ids[0]));
      scroller.addEventListener("scroll", calc, { passive: true });
      calc();
    }, 50);
    return () => { clearTimeout(t); scroller?.removeEventListener("scroll", calc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offset]);
  const jump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    lock.current = Date.now() + 700;
    setActiveId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return { activeId, jump };
}

/** เมนูหัวข้อ — variant side = เมนูซ้าย (PC) · chips = แถบชิปเลื่อนแนวนอน (มือถือ) */
export function SectionJumpNav({ sections, activeId, onJump, variant = "side", className = "" }: {
  sections: JumpSection[];
  activeId: string;
  onJump: (id: string) => void;
  variant?: "side" | "chips";
  className?: string;
}) {
  if (variant === "chips") {
    return (
      <div className={`flex gap-1.5 overflow-x-auto scrollbar-hide ${className}`}>
        {sections.map((s) => {
          const on = s.id === activeId; const t = TONE[s.tone];
          return (
            <button key={s.id} type="button" onClick={() => onJump(s.id)}
              className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs whitespace-nowrap ${on ? `${t.active} ${t.border} font-medium` : "bg-white border-slate-200 text-slate-600"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
              {s.label}
              {s.badge && <span className={`ml-0.5 px-1.5 rounded-full text-[10px] font-semibold ${BADGE[s.badge.tone]}`}>{s.badge.text}</span>}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <nav className={`flex flex-col gap-0.5 ${className}`}>
      {sections.map((s) => {
        const on = s.id === activeId; const t = TONE[s.tone];
        return (
          <button key={s.id} type="button" onClick={() => onJump(s.id)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[13px] ${on ? `${t.active} font-medium` : "text-slate-600 hover:bg-slate-50"}`}>
            <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${t.dot}`} />
            <span className="flex-1 min-w-0 truncate">{s.label}</span>
            {s.badge && <span className={`px-1.5 rounded-full text-[10px] font-semibold ${BADGE[s.badge.tone]}`}>{s.badge.text}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** กล่องหัวข้อ — แถบหัวสีตามโทน (คั่นให้เห็นว่าเริ่มหัวข้อใหม่) · right = ปุ่มด้านขวาของหัว */
export function SectionBlock({ id, tone, icon, title, right, children, className = "", bodyClassName = "px-3 py-2.5" }: {
  id: string;
  tone: SectionTone;
  icon?: string;
  title: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const t = TONE[tone];
  return (
    <section id={id} className={`scroll-mt-28 md:scroll-mt-20 rounded-xl border ${t.border} bg-white overflow-hidden ${className}`}>
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b ${t.border} ${t.head}`}>
        <span className={`w-1 self-stretch rounded-full ${t.dot}`} />
        <h3 className="text-sm font-semibold flex-1 min-w-0 flex items-center gap-1.5">{icon && <Icon value={icon} className="shrink-0" />}{title}</h3>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      {children !== undefined && children !== null && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}
