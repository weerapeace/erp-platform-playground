"use client";

/**
 * ชิ้นส่วนหน้าจอเล็ก ๆ ที่หน้า "คิดผ้าก่อนซื้อ" ใช้ร่วมกัน (ผ้าเดียว · ทั้งตระกูล · บันทึกผล) — เฉพาะหน้านี้ ไม่ใช่ของกลางทั้งระบบ
 */
import type { ReactNode } from "react";
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
    <input type="number" min={0} step="any" value={value === 0 ? "" : value} placeholder="0"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0))}
      className={`${inputCls} ${big ? "text-base font-semibold" : ""} ${small ? "!h-8 !w-24" : ""}`} />
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
