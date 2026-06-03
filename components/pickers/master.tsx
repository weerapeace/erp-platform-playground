"use client";

/**
 * Master Data Picker Factory
 *
 * สร้าง picker component สำหรับ master data (customer, employee, warehouse, ...)
 * ทุก picker ทำงานเหมือนกัน: search + recently used + create new (ถ้ามี permission)
 *
 * ใช้ Type Generics เพื่อให้ value type ถูกต้องในแต่ละ picker
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth, type Permission } from "@/components/auth";

// ---- Shared types ----

export type MasterValue = {
  id:   string;
  code: string | null;
  name: string;
  [key: string]: unknown;
};

export type SecondaryRender<V> = (item: V) => React.ReactNode;

export type MasterPickerConfig<V extends MasterValue> = {
  apiPath:        string;                  // เช่น 'customers' → /api/master/customers
  storageKey:     string;                  // localStorage key สำหรับ recently used
  label:          string;                  // 'ลูกค้า', 'พนักงาน', ...
  emptyLabel:     string;                  // 'ไม่พบลูกค้า'
  searchPlaceholder: string;
  createPermission: Permission;            // 'customers.create'
  /** field ที่จะส่งไป POST ตอนสร้างใหม่ (default แค่ name) */
  buildCreateBody?: (query: string) => Record<string, unknown>;
  /** ส่วน 2 (ใต้ชื่อ) ในแต่ละ row */
  secondaryRender?: SecondaryRender<V>;
  /** badge หรือ chip ข้างชื่อในแถวรายการ */
  badgeRender?:    SecondaryRender<V>;
};

// ---- Icons ----

const IconSearch  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const IconChev    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>;
const IconX       = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconLoader  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;

// ---- Recently used ----

function loadRecent<V>(key: string): V[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function pushRecent<V extends { id: string }>(key: string, v: V) {
  try {
    const list = loadRecent<V>(key).filter(x => x.id !== v.id);
    localStorage.setItem(key, JSON.stringify([v, ...list].slice(0, 6)));
  } catch { /* ignore */ }
}

// ---- Favorite / pinned (กลาง — ทุก picker ได้ฟรี) ----

const favKey = (storageKey: string) => `${storageKey}-fav`;
function loadFav<V>(key: string): V[] {
  try { return JSON.parse(localStorage.getItem(favKey(key)) ?? "[]"); } catch { return []; }
}
function isFav(key: string, id: string): boolean {
  return loadFav<{ id: string }>(key).some(x => x.id === id);
}
/** toggle ปักหมุด/เอาออก — คืน list ใหม่ */
function toggleFav<V extends { id: string }>(key: string, v: V): V[] {
  try {
    const list = loadFav<V>(key);
    const next = list.some(x => x.id === v.id)
      ? list.filter(x => x.id !== v.id)            // เอาออก
      : [v, ...list].slice(0, 12);                  // ปักหมุด (สูงสุด 12)
    localStorage.setItem(favKey(key), JSON.stringify(next));
    return next;
  } catch { return loadFav<V>(key); }
}

// ============================================================
// Factory
// ============================================================

export function createMasterPicker<V extends MasterValue>(cfg: MasterPickerConfig<V>) {
  return function MasterPicker({
    value, onChange, placeholder = `เลือก${cfg.label}...`, disabled, error, disableCreate,
  }: {
    value: V | null;
    onChange: (v: V | null) => void;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    disableCreate?: boolean;
  }) {
    const { can } = useAuth();
    const [open, setOpen]       = useState(false);
    const [query, setQuery]     = useState("");
    const [results, setResults] = useState<V[]>([]);
    const [recent, setRecent]   = useState<V[]>([]);
    const [favs, setFavs]       = useState<V[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    const canCreate = !disableCreate && can(cfg.createPermission);

    useEffect(() => {
      const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, []);

    useEffect(() => {
      if (open) { setRecent(loadRecent<V>(cfg.storageKey)); setFavs(loadFav<V>(cfg.storageKey)); }
    }, [open]);

    const onToggleFav = useCallback((e: React.MouseEvent, v: V) => {
      e.stopPropagation();
      setFavs(toggleFav(cfg.storageKey, v));
    }, []);

    useEffect(() => {
      if (!open) return;
      let active = true;
      setLoading(true);
      const t = setTimeout(async () => {
        try {
          const res = await apiFetch(`/api/master/${cfg.apiPath}?search=${encodeURIComponent(query)}&limit=10`);
          const json = await res.json();
          if (active) setResults((json.data ?? []) as V[]);
        } catch { if (active) setResults([]); }
        finally { if (active) setLoading(false); }
      }, 300);
      return () => { active = false; clearTimeout(t); };
    }, [query, open]);

    const select = useCallback((v: V) => {
      onChange(v); pushRecent(cfg.storageKey, v); setOpen(false); setQuery("");
    }, [onChange]);

    const createNew = async () => {
      if (!query.trim()) return;
      setCreating(true);
      try {
        const body = cfg.buildCreateBody ? cfg.buildCreateBody(query.trim()) : { name: query.trim() };
        const res = await apiFetch(`/api/master/${cfg.apiPath}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.error) { alert(json.error); return; }
        select(json.data as V);
      } finally { setCreating(false); }
    };

    const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase());
    const showCreate = canCreate && query.trim() && !exactMatch && !loading;
    const list = query.trim() ? results : (recent.length ? recent : results);

    return (
      <div className="relative" ref={boxRef}>
        <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
          className={`w-full h-9 px-3 flex items-center gap-2 text-sm border rounded-lg bg-white text-left transition-colors ${
            error ? "border-red-300" : "border-slate-200"
          } ${disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : "hover:border-blue-300"}`}>
          <span className="flex-1 truncate">
            {value ? <>{value.code && <span className="font-mono text-xs text-slate-400 mr-1">{value.code}</span>}{value.name}</>
                   : <span className="text-slate-400">{placeholder}</span>}
          </span>
          {value && !disabled && (
            <span onClick={e => { e.stopPropagation(); onChange(null); }} className="text-slate-300 hover:text-red-500"><IconX /></span>
          )}
          <span className="text-slate-400"><IconChev /></span>
        </button>

        {open && !disabled && (
          <div className="absolute z-30 left-0 right-0 top-10 bg-white border border-slate-200 rounded-lg shadow-lg">
            <div className="p-2 border-b border-slate-100 relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder={cfg.searchPlaceholder}
                className="w-full h-8 pl-7 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="max-h-64 overflow-y-auto">
              {!query.trim() && recent.length > 0 && (
                <div className="px-3 py-1 text-xs text-slate-400">⏱ เคยใช้ล่าสุด</div>
              )}
              {loading ? (
                <div className="px-3 py-4 flex items-center justify-center text-slate-400"><IconLoader /></div>
              ) : list.length === 0 && !showCreate ? (
                <div className="px-3 py-4 text-center text-sm text-slate-400">{cfg.emptyLabel}</div>
              ) : (
                list.map(v => (
                  <button key={v.id} type="button" onClick={() => select(v)}
                    className={`w-full px-3 py-2 flex flex-col hover:bg-blue-50 transition-colors text-left ${value?.id === v.id ? "bg-blue-50" : ""}`}>
                    <div className="flex items-center gap-2">
                      {v.code && <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{v.code}</span>}
                      {cfg.badgeRender?.(v)}
                      <span className="text-sm text-slate-800 truncate">{v.name}</span>
                    </div>
                    {cfg.secondaryRender && (
                      <div className="text-xs text-slate-400 mt-0.5">{cfg.secondaryRender(v)}</div>
                    )}
                  </button>
                ))
              )}

              {showCreate && (
                <button type="button" onClick={createNew} disabled={creating}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-slate-100 disabled:opacity-50">
                  {creating ? <IconLoader /> : <span className="text-lg leading-none">＋</span>}
                  สร้าง{cfg.label}ใหม่ &quot;{query.trim()}&quot;
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
}

// ============================================================
// Concrete pickers — instantiate ตาม config
// ============================================================

export type CustomerPickerValue = MasterValue & {
  contact_phone?: string | null; payment_terms?: string | null; category?: string | null;
};
export const CustomerPicker = createMasterPicker<CustomerPickerValue>({
  apiPath:    "customers",
  storageKey: "erp-recent-customers",
  label:      "ลูกค้า",
  emptyLabel: "ไม่พบลูกค้า",
  searchPlaceholder: "ค้นหา รหัส / ชื่อ / เบอร์...",
  createPermission: "customers.create",
  secondaryRender: v => (
    <>
      {v.payment_terms && <span>💳 {v.payment_terms}</span>}
      {v.contact_phone && <span> · 📞 {v.contact_phone}</span>}
    </>
  ),
  badgeRender: v => v.category ? <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">{v.category}</span> : null,
});

export type EmployeePickerValue = MasterValue & {
  email?: string | null; department?: string | null; position?: string | null;
};
export const EmployeePicker = createMasterPicker<EmployeePickerValue>({
  apiPath:    "employees",
  storageKey: "erp-recent-employees",
  label:      "พนักงาน",
  emptyLabel: "ไม่พบพนักงาน",
  searchPlaceholder: "ค้นหา รหัส / ชื่อ / อีเมล / แผนก...",
  createPermission: "employees.create",
  secondaryRender: v => (
    <>
      {v.position && <span>{v.position}</span>}
      {v.department && <span> · {v.department}</span>}
      {v.email && <span> · {v.email}</span>}
    </>
  ),
});

export type WarehousePickerValue = MasterValue & {
  branch?: string | null; manager_name?: string | null;
};
export const WarehousePicker = createMasterPicker<WarehousePickerValue>({
  apiPath:    "warehouses",
  storageKey: "erp-recent-warehouses",
  label:      "คลังสินค้า",
  emptyLabel: "ไม่พบคลังสินค้า",
  searchPlaceholder: "ค้นหา รหัส / ชื่อ / สาขา...",
  createPermission: "warehouses.create",
  secondaryRender: v => (
    <>
      {v.branch && <span>📍 {v.branch}</span>}
      {v.manager_name && <span> · 👤 {v.manager_name}</span>}
    </>
  ),
});

export type DepartmentPickerValue = MasterValue & {
  manager_name?: string | null;
};
export const DepartmentPicker = createMasterPicker<DepartmentPickerValue>({
  apiPath:    "departments",
  storageKey: "erp-recent-departments",
  label:      "แผนก",
  emptyLabel: "ไม่พบแผนก",
  searchPlaceholder: "ค้นหา รหัส / ชื่อแผนก...",
  createPermission: "departments.create",
  secondaryRender: v => v.manager_name ? <span>👤 {v.manager_name}</span> : null,
});

export type UnitPickerValue = MasterValue & {
  symbol?: string | null; category?: string | null;
};
const UNIT_CAT_LABEL: Record<string, string> = {
  count: "นับชิ้น", weight: "น้ำหนัก", volume: "ปริมาตร", length: "ความยาว", area: "พื้นที่",
};
export const UnitPicker = createMasterPicker<UnitPickerValue>({
  apiPath:    "units",
  storageKey: "erp-recent-units",
  label:      "หน่วยนับ",
  emptyLabel: "ไม่พบหน่วยนับ",
  searchPlaceholder: "ค้นหา ชื่อ / สัญลักษณ์...",
  createPermission: "units.create",
  badgeRender: v => v.symbol ? <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{v.symbol}</span> : null,
  secondaryRender: v => v.category ? <span className="text-slate-400">{UNIT_CAT_LABEL[v.category] ?? v.category}</span> : null,
});

export type TaxPickerValue = MasterValue & {
  tax_type?: string | null; rate?: number | null; included?: boolean | null;
};
const TAX_COLOR: Record<string, string> = {
  VAT:    "bg-blue-50 text-blue-700",
  WHT:    "bg-purple-50 text-purple-700",
  EXCISE: "bg-amber-50 text-amber-700",
  OTHER:  "bg-slate-100 text-slate-600",
};
export const TaxPicker = createMasterPicker<TaxPickerValue>({
  apiPath:    "taxes",
  storageKey: "erp-recent-taxes",
  label:      "ภาษี",
  emptyLabel: "ไม่พบภาษี",
  searchPlaceholder: "ค้นหา ชื่อ / ประเภทภาษี...",
  createPermission: "taxes.create",
  badgeRender: v => v.tax_type ? <span className={`text-[10px] px-1.5 py-0.5 rounded ${TAX_COLOR[v.tax_type] ?? "bg-slate-100"}`}>{v.tax_type}</span> : null,
  secondaryRender: v => (
    <>
      {v.rate != null && <span>อัตรา {Number(v.rate).toFixed(v.rate % 1 === 0 ? 0 : 2)}%</span>}
      {v.included && <span> · 🟢 รวมภาษี</span>}
    </>
  ),
});
