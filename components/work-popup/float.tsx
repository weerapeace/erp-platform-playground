"use client";
/**
 * 🔔 ป๊อปเตือนงานแบบลอย (ส่วนของ WorkPopupHost) — การ์ดลอยมุมขวาล่าง/ขวาบน บนจอคอม แทนหน้าต่างกลางจอ
 * - เนื้อหา = WorkPopupBody เดิม (ติ๊กงานของคุณได้) · ปุ่ม ไว้ทีหลัง / ✓ รับทราบ / ดูทั้งหมด เหมือนเดิม
 * - ปุ่มเล็กลอยอยู่ทั้งวัน (ป๊อปของวันนี้ · /api/popups/active?all=1) · กางเองเมื่อถึงเวลาและยังไม่รับทราบ
 *   รับทราบ/ไว้ทีหลัง/นอกเวลา = ยุบเป็นปุ่ม กดดูได้ตลอด · － ย่อ / กดข้างนอก / Esc = ยุบ · ✕ ซ่อน (ไม่เด้งอีก ทุกเครื่อง) → เปิดใหม่ที่เมนูโปรไฟล์
 * - ค่าตั้งต่อคน: user_ui_prefs key work_popup_float = { enabled, minimized, position } (useUserPref · บอกต่อในหน้าเดียว)
 * จอแคบกว่า FLOAT_MIN_WIDTH ยังเป็นหน้าต่างกลางจอแบบเดิม (ลอยแล้วบังงาน/ทับแถบเมนูล่าง)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import {
  FLOAT_MIN_WIDTH, WORK_POPUP_FLOAT_DEFAULT, WORK_POPUP_FLOAT_KEY, WORK_POPUP_HIDE_HINT, parseWorkPopupFloatPref,
  type WorkPopupFloatPosition, type WorkPopupFloatPref,
} from "./float-pref";

export { WORK_POPUP_HIDE_HINT } from "./float-pref";

export function useWorkPopupFloatPref() {
  return useUserPref<WorkPopupFloatPref>(WORK_POPUP_FLOAT_KEY, WORK_POPUP_FLOAT_DEFAULT, parseWorkPopupFloatPref);
}

/** จอกว้างพอให้ลอยไหม (อัปเดตเมื่อย่อ/ขยายหน้าต่าง) */
export function useFloatScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${FLOAT_MIN_WIDTH}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

const POS: Record<WorkPopupFloatPosition, string> = { br: "bottom-4 right-4", tr: "top-16 right-4" };

/** การ์ดลอย (กรอบอย่างเดียว — เนื้อหา/ปุ่มส่งมาจาก WorkPopupHost) */
export function WorkPopupFloatCard({ pref, minimized, title, subtitle, pill, footer, onMinimize, onExpand, onHide, children }: {
  pref: WorkPopupFloatPref;
  /** ยุบเป็นปุ่มเล็ก (ค่าเริ่ม: ยุบ · กางเองเมื่อมีป๊อปถึงเวลา) */
  minimized: boolean;
  title: string;
  subtitle: string;
  /** ข้อความบนปุ่มตอนย่อ เช่น "งานค้าง 54 · ของคุณ 2" */
  pill: string;
  footer: ReactNode;
  onMinimize: () => void;
  onExpand: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  // กดข้างนอกการ์ด / กด Esc = ยุบเป็นปุ่มเล็ก (ไม่ใช่ซ่อน — ปุ่มยังลอยอยู่ กดกางใหม่ได้)
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (minimized) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) onMinimize(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onMinimize(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [minimized, onMinimize]);

  if (minimized) {
    return (
      <button type="button" onClick={onExpand} title="ป๊อปเตือนงาน — กดเพื่อกาง"
        className={`fixed ${POS[pref.position]} z-[45] flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-white border border-slate-200 shadow-lg text-sm font-medium text-slate-700 hover:border-amber-300 hover:text-amber-800`}>
        <span aria-hidden>🔔</span>{pill}
      </button>
    );
  }
  return (
    <div ref={boxRef} role="dialog" aria-label={title}
      className={`fixed ${POS[pref.position]} z-[45] w-[400px] max-w-[calc(100vw-2rem)] flex flex-col bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden`}
      style={{ maxHeight: pref.position === "tr" ? "calc(100vh - 5rem)" : "calc(100vh - 2rem)" }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-amber-50/60">
        <span aria-hidden className="text-lg">🔔</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{title}</div>
          <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
        </div>
        <button type="button" onClick={onMinimize} aria-label="ย่อ" title="ย่อเหลือปุ่มเล็ก"
          className="w-8 h-8 rounded-md text-slate-400 hover:bg-white hover:text-slate-700">－</button>
        <button type="button" onClick={onHide} aria-label="ซ่อน" title={`ซ่อน (${WORK_POPUP_HIDE_HINT})`}
          className="w-8 h-8 rounded-md text-slate-400 hover:bg-white hover:text-slate-700">✕</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
      <div className="border-t border-slate-100 px-3 py-2">{footer}</div>
      <p className="bg-amber-50 px-3 py-1.5 text-[11px] leading-snug text-amber-800">
        💡 ไม่อยากเห็นป๊อปนี้? กด <b>✕</b> เพื่อซ่อน · {WORK_POPUP_HIDE_HINT}
      </p>
    </div>
  );
}

/** สวิตช์ในเมนูโปรไฟล์ — เปิด/ซ่อนป๊อปเตือนงาน + เลือกมุม (ใช้ใน AccountMenu) */
export function WorkPopupFloatToggle() {
  const [pref, setPref] = useWorkPopupFloatPref();
  return (
    <div className="px-3 py-2 border-t border-slate-100">
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="flex-1 text-xs text-slate-700">🔔 ป๊อปเตือนงาน <span className="text-[10px] text-slate-400">(ตอนเข้า ERP)</span></span>
        <input type="checkbox" className="sr-only peer" checked={pref.enabled}
          onChange={(e) => setPref({ ...pref, enabled: e.target.checked, minimized: false })} />
        <span aria-hidden className="relative w-9 h-5 rounded-full bg-slate-300 peer-checked:bg-blue-600 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
      </label>
      {pref.enabled ? (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[11px] text-slate-400 mr-1">ลอยที่</span>
          {([["br", "↘ ขวาล่าง"], ["tr", "↗ ขวาบน"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPref({ ...pref, position: k })}
              className={`h-6 px-2 rounded-md border text-[11px] ${pref.position === k ? "border-blue-300 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{l}</button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">ปิดอยู่ — ป๊อปไม่เด้ง (ทุกเครื่องของคุณ)</p>
      )}
    </div>
  );
}
