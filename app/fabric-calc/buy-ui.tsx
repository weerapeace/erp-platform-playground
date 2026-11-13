"use client";

/**
 * ชิ้นส่วนหน้าจอเล็ก ๆ ที่หน้า "คิดผ้าก่อนซื้อ" ใช้ร่วมกัน (ผ้าเดียว · ทั้งตระกูล · บันทึกผล) — เฉพาะหน้านี้ ไม่ใช่ของกลางทั้งระบบ
 */
import { useState, type ReactNode } from "react";
import { unitFromUomName, type BuyRound, type BuyUnit } from "@/lib/fabric-buy";

export const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });
const boxCls = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400";
export const inputCls = `${boxCls} text-right`;   // ช่องตัวเลข
export const textCls = `${boxCls} text-left`;     // ช่องข้อความ / ตัวเลือก

/** ค่าตั้งที่ใช้กับทุกผ้า (โหมดทั้งตระกูลใช้ชุดเดียวกับโหมดผ้าเดียว) */
export type FabricSettings = {
  trim: number; rotate: boolean; shrink: number; repeat: number;
  gap: number; waste: number; unit: BuyUnit; round: BuyRound; rollLen: number;
};

/** หน่วยของวัตถุดิบเทียบกับหน่วยซื้อได้ไหม — ม้วน: ต้องเป็นหลา/เมตร · ผืน: ไม่ใช่หน่วยพื้นที่/น้ำหนัก · ไม่มีหน่วย = ถือว่าได้
 *  (ข้อมูลจริง 2026-11-13: วัตถุดิบตัดชิ้น 96 ตัวนับเป็น cm² · บางตัว kg → เทียบไม่ได้ = ไม่หักสต็อก/ไม่เติมราคา) */
export function unitComparable(uomName: string | null | undefined, form: "roll" | "sheet"): boolean {
  if (!uomName) return true;
  return form === "roll" ? unitFromUomName(uomName) != null : !/cm|m²|m2|ft|kg|ตร\./i.test(uomName);
}

export function Card({ title, tag, right, children }: { title: string; tag?: "need" | "rec"; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {tag === "need" && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">จำเป็น</span>}
        {tag === "rec" && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">แนะนำ</span>}
        {right && <span className="ml-auto min-w-0">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[11px] font-medium text-slate-500" title={hint ? `${label} — ${hint}` : label}>{label}</span>
      {children}
      {hint && <span className="mt-0.5 block truncate text-[10.5px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Num({ value, onChange, big, small }: { value: number; onChange: (v: number) => void; big?: boolean; small?: boolean }) {
  return (
    <input type="number" inputMode="decimal" min={0} step="any" value={value === 0 ? "" : value} placeholder="0"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0))}
      className={`${inputCls} ${big ? "text-base font-semibold" : ""} ${small ? "!h-8 !w-24" : ""}`} />
  );
}

/** ปุ่มเลือก 2-3 ทาง (แทน select — กดง่ายบนจอสัมผัส) */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex w-full rounded-lg border border-slate-200 bg-white p-0.5" role="radiogroup">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`h-8 min-w-0 flex-1 truncate rounded-md px-2 text-[12.5px] ${value === k ? "bg-indigo-600 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
      ))}
    </div>
  );
}

/** แถบขั้นตอน ① ② ③ — กดหัวขั้นไหนก็ได้ (ไม่บังคับเรียง) */
export function StepBar({ step, onStep, items }: { step: number; onStep: (n: 1 | 2 | 3) => void; items: { t: string; sub: string; done: boolean }[] }) {
  return (
    <ol className="grid grid-cols-3 gap-1.5 rounded-2xl border border-indigo-100 bg-white p-1.5 shadow-sm" data-stepbar>
      {items.map((it, i) => {
        const n = (i + 1) as 1 | 2 | 3, cur = step === n;
        return (
          <li key={n} className="min-w-0">
            <button type="button" onClick={() => onStep(n)} aria-current={cur ? "step" : undefined}
              className={`flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${cur ? "bg-indigo-600 text-white" : "hover:bg-indigo-50"}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${cur ? "bg-white text-indigo-700" : it.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{it.done && !cur ? "✓" : n}</span>
              <span className="min-w-0">
                <span className={`block truncate text-[13px] font-semibold ${cur ? "" : "text-slate-700"}`}>{it.t}</span>
                <span className={`block truncate text-[11px] ${cur ? "text-indigo-100" : "text-slate-400"}`}>{it.sub}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** กลุ่มค่าตั้งระดับรอง (พื้นเทา) — ยุบได้ · ยุบอยู่โชว์ชิปสรุปค่าปัจจุบัน */
export function Group({ title, chips, defaultOpen = true, tone = "grey", children }: { title: string; chips: string[]; defaultOpen?: boolean; tone?: "grey" | "plain"; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-xl ${tone === "grey" ? "bg-slate-50" : "border border-dashed border-slate-200 bg-white"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left">
        <span className={`text-[11px] text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <span className={`shrink-0 text-[12.5px] font-semibold ${tone === "grey" ? "text-slate-600" : "text-slate-500"}`}>{title}</span>
        {!open && <span className="flex min-w-0 flex-wrap gap-1">{chips.map((c) => <span key={c} className="truncate rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">{c}</span>)}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  const c = tone === "danger" ? "text-rose-700" : tone === "success" ? "text-emerald-700" : "text-slate-800";
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-[11.5px] text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
