"use client";

/**
 * 🪟 ของกลาง: ชี้ที่การ์ดแล้วเห็น "รูปใหญ่ + รายละเอียด" (แทนชี้ที่รูปอย่างเดียว)
 *   - HoverCardWrap  — ห่อการ์ด · ชี้ค้าง ~0.35 วิ → กล่องลอยข้างการ์ด (ขวา · ไม่พอ = ซ้าย) · ออก/กดเมาส์ (เริ่มลาก)/เลื่อนจอ = ปิด
 *                      ทัช (มือถือ/แท็บเล็ต) ไม่เด้ง (useCanHover) · มีรูป = 600px (รูปซ้าย) · ไม่มีรูป = 320px
 *   - HoverFieldsPicker — ตั้งค่า เปิด/ปิด + ชิปเลือกสิ่งที่โชว์ + ↺ ค่าเริ่มต้น (ผู้เรียกเก็บค่าเอง เช่น user_ui_prefs ต่อคน)
 *   - HoverRow       — แถว "หัวข้อ : ค่า" ในกล่อง
 * ใช้ที่: บอร์ดงาน (app/tasks/task-hover-card) · Design Dashboard (components/design-dashboard/sheet-hover)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/i18n";
import { useCanHover } from "@/lib/use-can-hover";

export type HoverFieldDef<K extends string = string> = { key: K; th: string; en: string };

const DELAY_MS = 350;
const W_IMG = 600;
const W_TEXT = 320;

export function HoverCardWrap({ enabled, off, image, images, details, hint, className, children }: {
  /** เปิดใช้ (ตามตั้งค่า) */
  enabled: boolean;
  /** ปิดชั่วคราว (เช่น การ์ดที่กำลังลาก) */
  off?: boolean;
  /** รูปใหญ่ (url เต็ม) — ไม่มี = กล่องข้อความล้วน */
  image?: string | null;
  /** หลายรูปเล็ก (ใช้เมื่อไม่มีรูปใหญ่ · สูงสุด 4) */
  images?: string[];
  /** เนื้อหาฝั่งรายละเอียด (เรียกตอนเปิดเท่านั้น) */
  details: () => ReactNode;
  /** บรรทัดเล็กท้ายกล่อง เช่น บอกว่าตั้งค่าได้ที่ไหน */
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const canHover = useCanHover();
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; w: number } | null>(null);
  const active = enabled && canHover && !off;
  const pics = image ? [] : (images ?? []).filter(Boolean).slice(0, 4);
  const hasImg = !!image || pics.length > 0;

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const close = () => { clear(); setBox(null); };
  const open = () => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const pad = 10, vw = window.innerWidth, vh = window.innerHeight;
    let w = Math.min(hasImg ? W_IMG : W_TEXT, vw - pad * 2);
    const h = Math.min(hasImg ? 420 : 320, vh - pad * 2);
    // ขวาของการ์ด → ไม่พอ = ซ้าย → ไม่พอทั้งคู่ = หดลงข้างที่กว้างกว่า (ไม่บังการ์ด) → แคบมากจริง ๆ ค่อยวางกลางจอ
    const spaceR = vw - r.right - pad * 2, spaceL = r.left - pad * 2;
    let left: number;
    if (spaceR >= w) left = r.right + pad;
    else if (spaceL >= w) left = r.left - w - pad;
    else if (Math.max(spaceR, spaceL) >= 300) { w = Math.max(spaceR, spaceL); left = spaceR >= spaceL ? r.right + pad : r.left - w - pad; }
    else left = Math.max(pad, (vw - w) / 2);
    let top = r.top + r.height / 2 - h / 2;
    if (top < pad) top = pad;
    if (top + h > vh - pad) top = Math.max(pad, vh - h - pad);
    setBox({ left, top, w });
  };
  useEffect(() => () => clear(), []);
  useEffect(() => { if (!active) close(); }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!box) return;
    const hide = () => close();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { passive: true });
    window.addEventListener("dragstart", hide, true);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("wheel", hide); window.removeEventListener("dragstart", hide, true); };
  }, [box]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className={className}
      onMouseEnter={active ? () => { clear(); timer.current = setTimeout(open, DELAY_MS); } : undefined}
      onMouseLeave={active ? close : undefined}
      onMouseDown={active ? close : undefined}>
      {children}
      {active && box && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, width: box.w, zIndex: 9999 }} data-hover-card
          className="pointer-events-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className={`flex ${hasImg ? "flex-row" : "flex-col"}`}>
            {hasImg && (
              <div className="flex w-[52%] shrink-0 items-center justify-center bg-slate-50 p-2">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" decoding="async" className="max-h-[400px] w-full rounded-lg object-contain" />
                ) : (
                  <div className="grid w-full grid-cols-2 gap-1.5">
                    {pics.map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" decoding="async" className="aspect-square w-full rounded-md border border-slate-200 bg-white object-contain" />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1.5 p-3">
              {details()}
              {hint && <p className="pt-1 text-[10.5px] text-slate-300">{hint}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** แถว "หัวข้อ : ค่า" ในกล่อง */
export function HoverRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-slate-700">{children}</span>
    </div>
  );
}

/** ตั้งค่า: เปิด/ปิด + ชิปเลือกสิ่งที่โชว์ (เรียงตามลำดับ fields เสมอ) + ↺ ค่าเริ่มต้น */
export function HoverFieldsPicker<K extends string>({ on, onToggle, fields, value, defaults, onChange, className }: {
  on: boolean; onToggle: (v: boolean) => void;
  fields: HoverFieldDef<K>[];
  /** ที่เลือกอยู่ (null/undefined = ค่าเริ่มต้น) */
  value: K[] | null | undefined;
  defaults: K[];
  /** null = กลับค่าเริ่มต้น */
  onChange: (v: K[] | null) => void;
  className?: string;
}) {
  const t = useT();
  const cur = value ?? defaults;
  const flip = (k: K) => onChange(cur.includes(k) ? cur.filter((x) => x !== k) : fields.map((f) => f.key).filter((x) => x === k || cur.includes(x)));
  return (
    <div className={`space-y-1.5 rounded-lg border border-violet-100 bg-violet-50/40 p-2 ${className ?? ""}`} data-hover-card-settings>
      <div className="text-xs font-semibold text-violet-700">🪟 {t("Hover การ์ด (ชี้เมาส์ที่การ์ด)", "Card hover")}</div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
        {t("โชว์รูปใหญ่ + รายละเอียด เมื่อชี้ที่การ์ด", "Show large image + details on hover")}
      </label>
      {on && (
        <div className="pl-5">
          <div className="flex flex-wrap gap-1">
            {fields.map((f) => {
              const sel = cur.includes(f.key);
              return (
                <button key={f.key} type="button" onClick={() => flip(f.key)} aria-pressed={sel} data-hover-field={f.key}
                  className={`h-7 rounded-full border px-2.5 text-xs ${sel ? "border-violet-300 bg-violet-50 font-medium text-violet-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  {sel ? "✓ " : ""}{t(f.th, f.en)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{t("ชี้เมาส์ค้างที่การ์ดครู่หนึ่ง · มือถือ/แท็บเล็ตไม่เด้ง · ปิดอยู่ = ชี้ที่รูปเห็นรูปใหญ่แบบเดิม", "Rest the mouse on a card · not on touch screens · off = old image-only preview")}</p>
          {value && <button type="button" onClick={() => onChange(null)} className="mt-0.5 text-[11px] text-slate-400 hover:text-violet-600">↺ {t("ค่าเริ่มต้น", "Default")}</button>}
        </div>
      )}
    </div>
  );
}
