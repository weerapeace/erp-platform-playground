"use client";

/**
 * ของกลาง — "เลือกสิ่งที่จะแสดงในรายงาน"
 *
 * ใช้กับหน้ารายงานไหนก็ได้ (สรุปยอดขายรายเดือน · รายงานจัดซื้อรายเดือน · รายงานอื่นในอนาคต)
 * ให้ผู้ใช้ติ๊กเปิด/ปิดแต่ละส่วนของรายงาน แล้ว **มีผลทั้งบนจอและบนใบพิมพ์**
 *
 * จำค่าให้ "รายคน" (per-user) ผ่าน /api/user-prefs (ตาราง user_ui_prefs, RLS เจ้าของเท่านั้น)
 * + cache localStorage → เปิดหน้าครั้งต่อไปได้ค่าเดิมทันที ไม่กระพริบ
 *
 * วิธีใช้:
 *   const SECTIONS = [{ key: "by_customer", label: "แยกตามลูกค้า" }, …] as const;
 *   const { on, toggle, reset } = useReportSections("sales_monthly_sections", SECTIONS);
 *   {on.by_customer && <Card>…</Card>}
 *   <ReportSectionPicker sections={SECTIONS} on={on} onToggle={toggle} onReset={reset} />
 *   // ตอนสร้าง HTML พิมพ์: ส่ง on เข้า data ของเทมเพลต แล้วห่อด้วย {{#show_by_customer}}…{{/show_by_customer}}
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FloatingDropdown } from "@/components/floating-dropdown";

export type ReportSection = {
  key: string;
  label: string;
  /** ปิดไม่ได้ (รายงานขาดไม่ได้ เช่น การ์ดสรุป) */
  locked?: boolean;
  /** เปิดไว้ตั้งแต่แรกไหม (ไม่ระบุ = เปิด) */
  on?: boolean;
  /** คำอธิบายสั้น ๆ ใต้ชื่อ */
  hint?: string;
};

export type SectionState = Record<string, boolean>;

const defaultsOf = (sections: readonly ReportSection[]): SectionState =>
  Object.fromEntries(sections.map(s => [s.key, s.locked ? true : s.on !== false]));

/** hook: สถานะ "เปิด/ปิด" ของแต่ละส่วน + จำให้รายคน */
export function useReportSections(prefKey: string, sections: readonly ReportSection[]) {
  const lsKey = `reportsections:${prefKey}`;
  const [on, setOn] = useState<SectionState>(() => defaultsOf(sections));
  const touched = useRef(false);   // ผู้ใช้ติ๊กเองแล้ว — กันค่าจากเซิร์ฟเวอร์เด้งทับ

  // อ่านค่าที่เคยตั้งไว้: localStorage ก่อน (เร็ว) แล้ว reconcile กับเซิร์ฟเวอร์
  useEffect(() => {
    let cancel = false;
    const merge = (saved: unknown) => {
      if (!saved || typeof saved !== "object") return;
      const base = defaultsOf(sections);
      for (const s of sections) {
        const v = (saved as SectionState)[s.key];
        if (typeof v === "boolean" && !s.locked) base[s.key] = v;
      }
      if (!cancel && !touched.current) setOn(base);
    };
    try { const raw = localStorage.getItem(lsKey); if (raw) merge(JSON.parse(raw)); } catch { /* ignore */ }
    apiFetch(`/api/user-prefs?key=${encodeURIComponent(prefKey)}`).then(r => r.json())
      .then(j => {
        const v = (j?.value as { sections?: unknown } | undefined)?.sections;
        if (v) { merge(v); try { localStorage.setItem(lsKey, JSON.stringify(v)); } catch { /* ignore */ } }
      }).catch(() => { /* ignore */ });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey]);

  const save = useCallback((next: SectionState) => {
    try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* ignore */ }
    apiFetch("/api/user-prefs", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: prefKey, value: { sections: next } }),
    }).catch(() => { /* ignore */ });
  }, [prefKey, lsKey]);

  const toggle = useCallback((key: string) => {
    touched.current = true;
    setOn(prev => {
      const next = { ...prev, [key]: !prev[key] };
      save(next);
      return next;
    });
  }, [save]);

  const reset = useCallback(() => {
    touched.current = true;
    const next = defaultsOf(sections);
    setOn(next); save(next);
  }, [sections, save]);

  return { on, toggle, reset };
}

/** ปุ่ม + เมนูติ๊กเลือกส่วนที่จะแสดง */
export function ReportSectionPicker({ sections, on, onToggle, onReset, label = "เลือกสิ่งที่จะแสดง" }: {
  sections: readonly ReportSection[];
  on: SectionState;
  onToggle: (key: string) => void;
  onReset?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const shown = sections.filter(s => on[s.key]).length;

  return (
    <div ref={anchor} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="h-9 px-3 inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">
        ⚙ {label} <span className="text-slate-400 text-xs">{shown}/{sections.length}</span>
      </button>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={260}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-[70vh] overflow-auto">
          <div className="px-3 py-1.5 text-[11px] text-slate-400">ติ๊กเลือกส่วนที่อยากเห็น — มีผลทั้งบนจอและตอนพิมพ์</div>
          {sections.map(s => (
            <label key={s.key}
              className={`flex items-start gap-2 px-3 py-1.5 text-sm ${s.locked ? "opacity-50" : "hover:bg-slate-50 cursor-pointer"}`}>
              <input type="checkbox" className="mt-0.5" checked={!!on[s.key]} disabled={s.locked}
                onChange={() => !s.locked && onToggle(s.key)} />
              <span>
                <span className="text-slate-700">{s.label}</span>
                {s.hint && <span className="block text-[11px] text-slate-400">{s.hint}</span>}
              </span>
            </label>
          ))}
          {onReset && (
            <div className="border-t border-slate-100 mt-1 pt-1 px-3">
              <button type="button" onClick={() => { onReset(); setOpen(false); }}
                className="text-xs text-blue-600 hover:underline py-1">คืนค่าเริ่มต้น</button>
            </div>
          )}
        </div>
      </FloatingDropdown>
    </div>
  );
}
