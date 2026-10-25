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
import { FloatingDropdown, PICKER_PANEL, PICKER_NAME_CLASS } from "@/components/floating-dropdown";
import { loadRecent, pushRecent, loadFav, toggleFav, keepOnlyPicks } from "@/lib/recent-picks";   // "เคยใช้ล่าสุด" + ปักหมุด (ของกลาง)
import { useT } from "@/components/i18n";   // 2 ภาษา: *_en ใน config (ไม่ใส่ = ใช้ไทย)

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
  listEndpoint?:  string;                  // optional lightweight API, e.g. /api/pickers/customers
  storageKey:     string;                  // localStorage key สำหรับ recently used
  label:          string;                  // 'ลูกค้า', 'พนักงาน', ...
  emptyLabel:     string;                  // 'ไม่พบลูกค้า'
  searchPlaceholder: string;
  /** ภาษาอังกฤษ (โหมด EN) — เช่น label_en 'customer' (ตัวเล็ก ใช้ต่อประโยค "Select customer...") */
  label_en?:      string;
  emptyLabel_en?: string;
  searchPlaceholder_en?: string;
  createPermission: Permission;            // 'customers.create'
  allowCreate?:   boolean;
  /** field ที่จะส่งไป POST ตอนสร้างใหม่ (default แค่ name) */
  buildCreateBody?: (query: string) => Record<string, unknown>;
  /** ส่วน 2 (ใต้ชื่อ) ในแต่ละ row */
  secondaryRender?: SecondaryRender<V>;
  /** badge หรือ chip ข้างชื่อในแถวรายการ */
  badgeRender?:    SecondaryRender<V>;
  /**
   * ตรวจ "เคยใช้ล่าสุด / ปักหมุด" (จำไว้ในเครื่อง) กับเซิร์ฟเวอร์ทุกครั้งที่เปิด → ตัดตัวที่ปิดใช้งาน/ลบไปแล้วออก (เช่น คนลาออก)
   * endpoint ต้องรองรับ `?ids=a,b,c` แล้วคืนเฉพาะตัวที่ยังใช้ได้
   */
  verifyRecent?:   boolean;
};

// ---- Icons ----

const IconSearch  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const IconChev    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>;
const IconX       = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconLoader  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;

// ============================================================
// Factory
// ============================================================

export function createMasterPicker<V extends MasterValue>(cfg: MasterPickerConfig<V>) {
  return function MasterPicker({
    value, onChange, placeholder: placeholderProp, disabled, error, disableCreate, onAddNew,
  }: {
    value: V | null;
    onChange: (v: V | null) => void;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    disableCreate?: boolean;
    /**
     * เปิด "ฟอร์มกรอกข้อมูลเต็ม" (ของกลาง) แทนการสร้างแบบใส่แค่ชื่อ
     * ใส่มาแล้วจะมีปุ่มท้าย dropdown เสมอ (ไม่ต้องพิมพ์ค้นหาก่อน)
     * ส่งคำค้นที่พิมพ์ค้างไว้ไปให้เติมในฟอร์มได้
     */
    onAddNew?: (query: string) => void;
  }) {
    const { can } = useAuth();
    const t = useT();
    const labelEn = cfg.label_en ?? cfg.label;
    const placeholder = placeholderProp ?? t(`เลือก${cfg.label}...`, `Select ${labelEn}...`);
    const [open, setOpen]       = useState(false);
    const [query, setQuery]     = useState("");
    const [results, setResults] = useState<V[]>([]);
    const [recent, setRecent]   = useState<V[]>([]);
    const [favs, setFavs]       = useState<V[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    const canCreate = cfg.allowCreate !== false && !disableCreate && can(cfg.createPermission);

    // outside-click จัดการโดย FloatingDropdown (รวม dropdown ที่อยู่ใน portal ด้วย)

    useEffect(() => {
      if (!open) return;
      const r = loadRecent<V>(cfg.storageKey), f = loadFav<V>(cfg.storageKey);
      const ids = [...new Set([...r, ...f].map((v) => v?.id).filter(Boolean))];
      if (!cfg.verifyRecent || !ids.length) { setRecent(r); setFavs(f); return; }
      // ตรวจกับเซิร์ฟเวอร์ก่อนโชว์ — ตัวที่ปิดใช้งานแล้วไม่โผล่ (ตรวจไม่ได้ = โชว์ตามที่จำไว้)
      let alive = true;
      const endpoint = cfg.listEndpoint ?? `/api/master/${cfg.apiPath}`;
      apiFetch(`${endpoint}?ids=${encodeURIComponent(ids.join(","))}`)
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok || json.error || !Array.isArray(json.data)) throw new Error("verify failed");
          if (!alive) return;
          const kept = keepOnlyPicks<V>(cfg.storageKey, json.data as V[]);
          setRecent(kept.recent); setFavs(kept.favs);
        })
        .catch(() => { if (alive) { setRecent(r); setFavs(f); } });
      return () => { alive = false; };
    }, [open]);

    const onToggleFav = useCallback((e: React.MouseEvent, v: V) => {
      e.stopPropagation();
      setFavs(toggleFav(cfg.storageKey, v));
    }, []);

    useEffect(() => {
      if (!open) return;
      let active = true;
      setLoading(true);
      const timer = setTimeout(async () => {
        try {
          const endpoint = cfg.listEndpoint ?? `/api/master/${cfg.apiPath}`;
          const res = await apiFetch(`${endpoint}?search=${encodeURIComponent(query)}&limit=10`);
          const json = await res.json();
          if (active) setResults((json.data ?? []) as V[]);
        } catch { if (active) setResults([]); }
        finally { if (active) setLoading(false); }
      }, 300);
      return () => { active = false; clearTimeout(timer); };
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
    const favIds = new Set(favs.map(f => f.id));
    // ไม่มีคำค้น: โชว์ favorites ก่อน แล้วตามด้วย recent (ที่ไม่ซ้ำ favorite)
    const baseList = recent.length ? recent : results;
    const list = query.trim()
      ? results
      : [...favs, ...baseList.filter(v => !favIds.has(v.id))];
    const recentItems = recent.filter(v => !favIds.has(v.id));
    const recentIds = new Set(recent.map(r => r.id));
    const defaultItems = query.trim()
      ? []
      : results.filter(v => !favIds.has(v.id) && !recentIds.has(v.id));

    // row เดียว — ใช้ซ้ำ (มีปุ่มดาวปักหมุด)
    const renderRow = (v: V) => (
      <div key={v.id}
        className={`w-full px-3 py-2 flex items-center gap-1.5 hover:bg-blue-50 transition-colors ${value?.id === v.id ? "bg-blue-50" : ""}`}>
        <button type="button" onClick={() => select(v)} className="flex-1 flex flex-col text-left min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            {v.code && <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{v.code}</span>}
            {cfg.badgeRender?.(v)}
            <span className={PICKER_NAME_CLASS}>{v.name}</span>
          </div>
          {cfg.secondaryRender && <div className="text-xs text-slate-400 mt-0.5">{cfg.secondaryRender(v)}</div>}
        </button>
        <button type="button" onClick={(e) => onToggleFav(e, v)}
          title={favIds.has(v.id) ? t("เอาออกจากรายการโปรด", "Remove from favorites") : t("ปักหมุดเป็นรายการโปรด", "Pin as favorite")}
          className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-amber-50 ${
            favIds.has(v.id) ? "text-amber-400" : "text-slate-300 hover:text-amber-400"
          }`}>
          {favIds.has(v.id) ? "★" : "☆"}
        </button>
      </div>
    );

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

        <FloatingDropdown anchorRef={boxRef} open={open && !disabled} onClose={() => setOpen(false)} {...PICKER_PANEL}>
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-100 relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder={t(cfg.searchPlaceholder, cfg.searchPlaceholder_en ?? "Search...")}
                className="w-full h-8 pl-7 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-4 flex items-center justify-center text-slate-400"><IconLoader /></div>
              ) : list.length === 0 && !showCreate ? (
                <div className="px-3 py-4 text-center text-sm text-slate-400">{t(cfg.emptyLabel, cfg.emptyLabel_en ?? "No results")}</div>
              ) : query.trim() ? (
                list.map(renderRow)
              ) : (
                <>
                  {favs.length > 0 && <div className="px-3 py-1 text-xs text-amber-500">★ {t("รายการโปรด", "Favorites")}</div>}
                  {favs.map(renderRow)}
                  {recentItems.length > 0 && (
                    <div className="px-3 py-1 text-xs text-slate-400">⏱ {t("เคยใช้ล่าสุด", "Recently used")}</div>
                  )}
                  {recentItems.map(renderRow)}
                  {defaultItems.length > 0 && (
                    <div className="px-3 py-1 text-xs text-slate-400">{t("รายการทั้งหมด", "All")}</div>
                  )}
                  {defaultItems.map(renderRow)}
                </>
              )}

              {showCreate && (
                <button type="button" onClick={createNew} disabled={creating}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-slate-100 disabled:opacity-50">
                  {creating ? <IconLoader /> : <span className="text-lg leading-none">＋</span>}
                  {t(`สร้าง${cfg.label}ใหม่`, `Create new ${labelEn}`)} &quot;{query.trim()}&quot;
                </button>
              )}

              {/* ฟอร์มกรอกข้อมูลเต็ม — โชว์เสมอ ไม่ต้องพิมพ์ค้นหาก่อน */}
              {onAddNew && (
                <button type="button"
                  onClick={() => { setOpen(false); onAddNew(query.trim()); }}
                  className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-blue-700 bg-blue-50/60 hover:bg-blue-100 border-t border-slate-200">
                  <span className="text-lg leading-none">＋</span>
                  {t(`เพิ่ม${cfg.label}ใหม่`, `Add new ${labelEn}`)} <span className="text-xs text-blue-500">{t("(กรอกข้อมูลครบ)", "(full form)")}</span>
                </button>
              )}
            </div>
          </div>
        </FloatingDropdown>
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
  listEndpoint: "/api/pickers/customers",
  storageKey: "erp-recent-customers",
  label:      "ลูกค้า",
  emptyLabel: "ไม่พบลูกค้า",
  searchPlaceholder: "ค้นหา รหัส / ชื่อ / เบอร์...",
  label_en: "customer", emptyLabel_en: "No customers found", searchPlaceholder_en: "Search code / name / phone...",
  createPermission: "customers.create",
  allowCreate: false,
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
  label_en: "employee", emptyLabel_en: "No employees found", searchPlaceholder_en: "Search code / name / email / department...",
  createPermission: "employees.create",
  secondaryRender: v => (
    <>
      {v.position && <span>{v.position}</span>}
      {v.department && <span> · {v.department}</span>}
      {v.email && <span> · {v.email}</span>}
    </>
  ),
});

// UserPicker — เลือก "user จริง" (user_profiles คนที่ login ได้) — ของกลางสำหรับมอบหมายงาน
export type UserPickerValue = MasterValue & { email?: string | null; role?: string | null };
const USER_RECENT_KEY = "erp-recent-users";
export const UserPicker = createMasterPicker<UserPickerValue>({
  apiPath:    "creative-users",
  listEndpoint: "/api/creative-users",
  storageKey: USER_RECENT_KEY,
  label:      "ผู้ใช้",
  emptyLabel: "ไม่พบผู้ใช้ (คนที่ login ได้)",
  searchPlaceholder: "ค้นหา ชื่อ / อีเมล...",
  label_en: "user", emptyLabel_en: "No users found (people who can log in)", searchPlaceholder_en: "Search name / email...",
  createPermission: "employees.view",
  allowCreate: false,
  verifyRecent: true,   // คนที่ปิดบัญชี/ลาออกแล้ว ไม่โผล่ใน "เคยใช้ล่าสุด/ปักหมุด"
  secondaryRender: v => v.email ? <span>{v.email}{v.role ? <span> · {v.role}</span> : null}</span> : null,
});

/**
 * คนที่เพิ่งเลือกล่าสุด (ประวัติเดียวกับ UserPicker) — ทำปุ่มลัด "กดเลือกได้เลย ไม่ต้องพิมพ์"
 * ตรวจกับเซิร์ฟเวอร์ก่อน (ตัดคนที่ลาออก/ปิดบัญชี) · ตรวจไม่ได้ = โชว์ตามที่จำไว้
 * remember(u) = เลื่อนคนนั้นขึ้นบนสุด (เรียกตอนกดปุ่มลัด · เลือกผ่าน UserPicker จำให้เองอยู่แล้ว)
 */
export function useRecentUsers(limit = 3) {
  const [recent, setRecent] = useState<UserPickerValue[]>([]);
  useEffect(() => {
    const saved = loadRecent<UserPickerValue>(USER_RECENT_KEY).filter((v) => v?.id && v.name);
    if (!saved.length) return;
    setRecent(saved.slice(0, limit));
    let alive = true;
    apiFetch(`/api/creative-users?ids=${encodeURIComponent(saved.map((v) => v.id).join(","))}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error || !Array.isArray(json.data)) throw new Error("verify failed");
        if (alive) setRecent(keepOnlyPicks<UserPickerValue>(USER_RECENT_KEY, json.data as UserPickerValue[]).recent.slice(0, limit));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [limit]);
  const remember = useCallback((u: UserPickerValue) => { pushRecent(USER_RECENT_KEY, u); }, []);
  return { recent, remember };
}

export type WarehousePickerValue = MasterValue & {
  branch?: string | null; manager_name?: string | null;
};
export const WarehousePicker = createMasterPicker<WarehousePickerValue>({
  apiPath:    "warehouses",
  storageKey: "erp-recent-warehouses",
  label:      "คลังสินค้า",
  emptyLabel: "ไม่พบคลังสินค้า",
  searchPlaceholder: "ค้นหา รหัส / ชื่อ / สาขา...",
  label_en: "warehouse", emptyLabel_en: "No warehouses found", searchPlaceholder_en: "Search code / name / branch...",
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
  label_en: "department", emptyLabel_en: "No departments found", searchPlaceholder_en: "Search code / department name...",
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
  label_en: "unit", emptyLabel_en: "No units found", searchPlaceholder_en: "Search name / symbol...",
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
  label_en: "tax", emptyLabel_en: "No taxes found", searchPlaceholder_en: "Search name / tax type...",
  createPermission: "taxes.create",
  badgeRender: v => v.tax_type ? <span className={`text-[10px] px-1.5 py-0.5 rounded ${TAX_COLOR[v.tax_type] ?? "bg-slate-100"}`}>{v.tax_type}</span> : null,
  secondaryRender: v => (
    <>
      {v.rate != null && <span>อัตรา {Number(v.rate).toFixed(v.rate % 1 === 0 ? 0 : 2)}%</span>}
      {v.included && <span> · 🟢 รวมภาษี</span>}
    </>
  ),
});
