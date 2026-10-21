"use client";

/**
 * ของกลาง — เลือกดูทีละบริษัทในกลุ่ม (ไอ.เอส.จี. / หลุยส์ / บริษัทที่เพิ่มทีหลัง)
 *
 *   <CompanyFilterChips>  ปุ่มสลับ: ทั้งกลุ่ม · บริษัท… · ยังไม่ระบุ (โผล่เฉพาะตอนมีของค้าง)
 *   <CompanyTag>          ป้ายสีบริษัทเล็ก ๆ บนการ์ด/แถวตาราง
 *   <CompanySelect>       ช่องเลือกบริษัทในฟอร์ม (มีตัวเลือก "ยังไม่ระบุ")
 *   useCompanyFilter()    จำว่าเลือกบริษัทไหนไว้ (ต่อเครื่อง) — หลายหน้าใช้ key เดียวกันได้ เลือกที่หน้าหนึ่ง อีกหน้าตามไปด้วย
 *
 * ทะเบียนบริษัทมาจากตาราง companies (ตั้งค่าที่ /admin/companies) — เพิ่มบริษัทที่ 3 ได้เองไม่ต้องแก้โค้ด
 * กติกาตัวกรอง/สีอยู่ที่ lib/company-filter.ts
 * ใช้ที่: /cashflow · /cashflow/board
 */
import { useCallback, useEffect, useState } from "react";
import {
  COMPANY_ALL, COMPANY_NONE, UNASSIGNED_TONE, companyLabel, companyTone, validCompanyFilter,
  type CompanyFilter, type CompanyRef,
} from "@/lib/company-filter";

/** จำบริษัทที่เลือกไว้ใน localStorage — บริษัทถูกปิดไปแล้ว = กลับไปดูทั้งกลุ่มเอง */
export function useCompanyFilter(storageKey: string, companies: CompanyRef[]) {
  const [filter, setFilterState] = useState<CompanyFilter>(COMPANY_ALL);
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    try { setStored(localStorage.getItem(storageKey)); } catch { /* โหมดส่วนตัวของเบราว์เซอร์ */ }
  }, [storageKey]);

  // รอรายชื่อบริษัทมาก่อนค่อยเชื่อค่าที่จำไว้ (กัน id บริษัทที่ถูกปิดไปแล้ว)
  useEffect(() => {
    if (!companies.length) return;
    setFilterState((cur) => validCompanyFilter(stored ?? cur, companies));
  }, [companies, stored]);

  const setFilter = useCallback((f: CompanyFilter) => {
    setFilterState(f);
    setStored(f);
    try { localStorage.setItem(storageKey, f); } catch { /* โหมดส่วนตัวของเบราว์เซอร์ */ }
  }, [storageKey]);

  return [filter, setFilter] as const;
}

export function CompanyFilterChips({ companies, value, onChange, unassignedCount = 0, label = "บริษัท" }: {
  companies: CompanyRef[];
  value: CompanyFilter;
  onChange: (f: CompanyFilter) => void;
  /** จำนวนรายการที่ยังไม่ระบุบริษัท — มากกว่า 0 ถึงจะโชว์ปุ่ม "ยังไม่ระบุ" */
  unassignedCount?: number;
  label?: string;
}) {
  const chip = (key: string, text: string, dot: string | null, title?: string) => {
    const on = value === key;
    return (
      <button key={key} type="button" onClick={() => onChange(key)} title={title}
              className={`h-8 px-3 text-sm rounded-full border inline-flex items-center gap-1.5 transition-colors ${
                on ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />}
        {text}
      </button>
    );
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-500">{label}</span>
      {chip(COMPANY_ALL, "ทั้งกลุ่ม", null, "รวมทุกบริษัท")}
      {companies.map((c) => chip(c.id, c.name || c.code, companyTone(companies, c.id).dot, c.code))}
      {(unassignedCount > 0 || value === COMPANY_NONE) &&
        chip(COMPANY_NONE, `ยังไม่ระบุ ${unassignedCount.toLocaleString("th-TH")}`, UNASSIGNED_TONE.dot,
             "รายการที่ยังไม่รู้ว่าเป็นของบริษัทไหน — ดูแยกทีละบริษัทจะไม่ถูกนับ")}
    </div>
  );
}

export function CompanyTag({ companies, companyId, mode = "short", className = "" }: {
  companies: CompanyRef[];
  companyId: string | null | undefined;
  mode?: "short" | "full";
  className?: string;
}) {
  const t = companyTone(companies, companyId);
  return (
    <span className={`inline-flex items-center text-[10px] leading-none px-1.5 py-[3px] rounded-full whitespace-nowrap ${className}`}
          style={{ background: t.bg, color: t.text }}
          title={companyLabel(companies, companyId, "full")}>
      {companyLabel(companies, companyId, mode)}
    </span>
  );
}

export function CompanySelect({ companies, value, onChange, disabled, className = "" }: {
  companies: CompanyRef[];
  value: string | null | undefined;
  onChange: (companyId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select value={value ?? ""} disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
            className={`h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50 ${className}`}>
      <option value="">— ยังไม่ระบุบริษัท —</option>
      {companies.map((c) => <option key={c.id} value={c.id}>{c.name || c.code}</option>)}
    </select>
  );
}
