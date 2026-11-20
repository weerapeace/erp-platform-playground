"use client";

/**
 * CalendarTabs (ของกลาง) — แท็บสลับปฏิทินของแต่ละแผนก (ฝังหน้าจริง ?embed=1 — single-source ไม่เขียนใหม่)
 *   ผลิต / จัดซื้อ / จัดการงาน / คอนเทนต์  + ปุ่ม "เปิดใหญ่" → popup ปรับขนาดได้
 * ใช้ที่: แท็บปฏิทินใน /dashboard · หน้า /calendar (ปฏิทินรวม)
 * เพิ่มปฏิทินแผนกใหม่ = เติม 1 บรรทัดใน CALENDARS ที่เดียว ได้ทุกหน้าที่ใช้
 *   - height: ความสูงกรอบปฏิทิน (ค่าเริ่มต้น 620)
 *   - fill: โหมดเต็มหน้า — ไม่มีกรอบ/ขอบมน สูงเต็มจอที่เหลือจากแถบของ shell (ใช้กับหน้าที่มีปฏิทินอย่างเดียว)
 *   - extraTabs: แท็บเสริมต่อท้าย (เนื้อหาเป็น component ปกติ ไม่ใช่ iframe) · lead: true = วางหน้าสุด + เป็นแท็บเริ่มต้น
 *   - แท็บทุกอันมี role=tab + data-split-href → Ctrl+คลิก/ลาก = แบ่งจอ (components/split-screen) · ?cal=<key> เปิดแท็บนั้นก่อน
 */
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { EmbedFrame, EmbedModal } from "@/components/embed-modal";

/** lead = วางหน้าสุดและเป็นแท็บเริ่มต้น (เช่น "รวมทุกปฏิทิน" ของ /calendar) · ไม่ใส่ = ต่อท้าย */
export type CalendarExtraTab = { key: string; label: string; content: ReactNode; lead?: boolean };

// ปฏิทินที่ฝังได้ — url = หน้าเต็มของปฏิทินนั้น (ระบบเติม embed=1 ให้เองตอนฝัง)
const CALENDARS: { key: string; icon: string; label: string; url: string }[] = [
  { key: "prod",    icon: "🏭", label: "ปฏิทินผลิต",      url: "/master/production-dashboard?view=calendar" },
  { key: "buy",     icon: "🛒", label: "ปฏิทินจัดซื้อ",    url: "/purchasing/calendar" },
  { key: "tasks",   icon: "🗂️", label: "ปฏิทินจัดการงาน", url: "/tasks?view=calendar" },
  { key: "content", icon: "🗓️", label: "ปฏิทินคอนเทนต์",  url: "/tasks/content-calendar" },
  { key: "plan",    icon: "📋", label: "แผนงานทีม",      url: "/tasks/plan?view=calendar" },
];

const MIN_HEIGHT = 520;
// โหมดเต็มหน้า: หักแถบของ shell + แถบแท็บของตัวเอง (~45px)
//   จอเล็ก = แถบบน 48 + เมนูล่าง 64 · จอใหญ่ (xl) = แถบ App ด้านบน ~41
const FILL_HEIGHT = "h-[calc(100dvh-160px)] xl:h-[calc(100dvh-88px)]";

export function CalendarTabs({ height = 620, fill = false, extraTabs = [] }: { height?: number | string; fill?: boolean; extraTabs?: CalendarExtraTab[] }) {
  const leadTabs = extraTabs.filter((t) => t.lead), tailTabs = extraTabs.filter((t) => !t.lead);
  const allKeys = [...extraTabs.map((t) => t.key), ...CALENDARS.map((c) => c.key)];
  const [tab, setTab] = useState<string>(leadTabs[0]?.key ?? CALENDARS[0].key);
  const [big, setBig] = useState(false);
  // ?cal=<key> เปิดแท็บนั้นก่อน (ใช้ตอนแบ่งจอแท็บเสริมของหน้านี้ไปฝั่งขวา)
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("cal");
    if (k && allKeys.includes(k)) setTab(k);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const pathname = usePathname();
  const selfHref = (key: string) => `${pathname}?cal=${key}`;
  const [visited, setVisited] = useState<Set<string>>(() => new Set([tab]));
  useEffect(() => { setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))); }, [tab]);
  const extra = extraTabs.find((t) => t.key === tab);
  const cal = CALENDARS.find((c) => c.key === tab) ?? CALENDARS[0];
  const btn = (on: boolean) => `px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${on ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`;
  const bodyStyle = fill ? { minHeight: MIN_HEIGHT } : { height, minHeight: MIN_HEIGHT };
  const bodySize = fill ? FILL_HEIGHT : "";
  return (
    <div className={fill ? "bg-white" : "bg-white border border-slate-200 rounded-xl overflow-hidden"}>
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-slate-100">
        {/* role=tab + data-split-href → Ctrl+คลิก / Ctrl+ลาก แท็บ = แบ่งจอ (ของกลาง split-screen) */}
        <div role="tablist" className="inline-flex flex-wrap bg-slate-100 rounded-lg p-0.5">
          {leadTabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} data-split-href={selfHref(t.key)} onClick={() => setTab(t.key)} className={btn(tab === t.key)}>{t.label}</button>
          ))}
          {CALENDARS.map((c) => (
            <button key={c.key} role="tab" aria-selected={tab === c.key} data-split-href={c.url} onClick={() => setTab(c.key)} className={btn(tab === c.key)}>{c.icon} {c.label}</button>
          ))}
          {tailTabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} data-split-href={selfHref(t.key)} onClick={() => setTab(t.key)} className={btn(tab === t.key)}>{t.label}</button>
          ))}
        </div>
        {!extra && <button onClick={() => setBig(true)} className="ml-auto text-xs text-blue-600 hover:underline">⤢ เปิดใหญ่</button>}
      </div>
      {/* แท็บที่เคยเปิดแล้ว "ค้างไว้" (ซ่อนเฉย ๆ) → สลับกลับขึ้นทันที ไม่โหลดหน้าใหม่ (เจ้าของ 2026-11-20: สลับแท็บนาน) */}
      {extraTabs.filter((t) => visited.has(t.key)).map((t) => (
        <div key={t.key} className={`overflow-y-auto bg-slate-50 ${bodySize} ${t.key === tab ? "" : "hidden"}`} style={bodyStyle}>{t.content}</div>
      ))}
      {CALENDARS.filter((c) => visited.has(c.key)).map((c) => (
        <EmbedFrame key={c.key} url={c.url} title={c.label} className={`${bodySize} ${c.key === tab ? "" : "hidden"}`}
          height={fill ? null : height} minHeight={MIN_HEIGHT} />
      ))}
      {big && !extra && <EmbedModal url={cal.url} title={cal.label} onClose={() => setBig(false)} />}
    </div>
  );
}
