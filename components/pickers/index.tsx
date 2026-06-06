"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ImageThumbnail } from "@/components/image-manager";
import { FloatingDropdown } from "@/components/floating-dropdown";

// ---- Icons ----

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconLoader() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// ---- Mock Data ----

export type ProductOption = {
  id: string; sku: string; name: string; unit: string;
  stock: number; status: "active" | "inactive" | "low_stock"; category: string;
};

// @deprecated — ใช้ SupplierPickerValue (declared ด้านล่าง) แทน
// เก็บไว้เพื่อ backward compat กับ demo pages เก่า
export type SupplierOption = {
  id: string;
  code: string | null;
  name: string;
  /** @deprecated ใช้ contact_phone */
  contact?: string;
  contact_phone?: string | null;
  category?: string | null;
};

export type EmployeeOption = {
  id: string; code: string; name: string; department: string; position: string;
};

const MOCK_PRODUCTS: ProductOption[] = [
  { id: "1", sku: "SKU-001", name: "กระดาษ A4 80gsm", unit: "รีม", stock: 240, status: "active", category: "เครื่องเขียน" },
  { id: "2", sku: "SKU-002", name: "ปากกาลูกลื่น สีน้ำเงิน", unit: "กล่อง", stock: 85, status: "active", category: "เครื่องเขียน" },
  { id: "3", sku: "SKU-003", name: "แฟ้มเอกสาร A4", unit: "แพ็ค", stock: 12, status: "low_stock", category: "เครื่องเขียน" },
  { id: "4", sku: "SKU-004", name: "น้ำยาล้างจาน 1L", unit: "ขวด", stock: 60, status: "active", category: "สินค้าทำความสะอาด" },
  { id: "5", sku: "SKU-005", name: "หมึกปริ้นเตอร์ HP 680", unit: "ชิ้น", stock: 8, status: "low_stock", category: "ไอที" },
  { id: "6", sku: "SKU-009", name: "เมาส์ USB Optical", unit: "ชิ้น", stock: 22, status: "active", category: "ไอที" },
  { id: "7", sku: "SKU-012", name: "คีย์บอร์ด USB ไทย-อังกฤษ", unit: "ชิ้น", stock: 14, status: "active", category: "ไอที" },
  { id: "8", sku: "SKU-015", name: "กาแฟสำเร็จรูป Nescafe 3in1", unit: "กล่อง", stock: 18, status: "active", category: "อาหารและเครื่องดื่ม" },
  { id: "9", sku: "SKU-019", name: "แฟลชไดร์ฟ 32GB USB 3.0", unit: "ชิ้น", stock: 0, status: "inactive", category: "ไอที" },
];

const MOCK_EMPLOYEES: EmployeeOption[] = [
  { id: "1", code: "EMP-001", name: "สมชาย ใจดี", department: "จัดซื้อ", position: "ผู้จัดการจัดซื้อ" },
  { id: "2", code: "EMP-002", name: "สุดา รักงาน", department: "จัดซื้อ", position: "เจ้าหน้าที่จัดซื้อ" },
  { id: "3", code: "EMP-003", name: "วิชัย มั่นคง", department: "คลังสินค้า", position: "ผู้จัดการคลัง" },
  { id: "4", code: "EMP-004", name: "มาลี สุขใจ", department: "บัญชี", position: "ผู้จัดการบัญชี" },
  { id: "5", code: "EMP-005", name: "ธนา เก่งมาก", department: "ไอที", position: "วิศวกรซอฟต์แวร์" },
  { id: "6", code: "EMP-006", name: "นภา ดีเด่น", department: "HR", position: "ผู้จัดการ HR" },
];

// ---- Status badge mini ----

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  low_stock: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active", inactive: "Inactive", low_stock: "Low Stock",
};

// ---- Generic Picker Base ----
// query state lives here so renderList receives it as a plain string — no useState in callbacks

interface PickerDropdownProps<T> {
  value: T | null;
  onChange: (v: T | null) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  renderTriggerLabel: (v: T) => string;
  renderSearchInput: (query: string, setQuery: (q: string) => void) => React.ReactNode;
  renderList: (onSelect: (v: T) => void, query: string) => React.ReactNode;
  error?: boolean;
}

function PickerDropdown<T>({
  value, onChange, placeholder = "เลือก...", disabled, loading,
  renderTriggerLabel, renderSearchInput, renderList, error,
}: PickerDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (v: T) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full h-9 px-3 flex items-center justify-between text-sm border rounded-lg transition-colors text-left
          ${error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400 cursor-pointer"}
          ${open ? "border-blue-500 ring-2 ring-blue-500/20" : ""}
        `}
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {loading ? (
            <span className="flex items-center gap-1.5 text-slate-400"><IconLoader />กำลังโหลด...</span>
          ) : value ? renderTriggerLabel(value) : placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {value && !disabled && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
            >
              <IconX />
            </span>
          )}
          <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
            <IconChevronDown />
          </span>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <IconSearch />
              </span>
              {renderSearchInput(query, setQuery)}
            </div>
          </div>

          {/* List — query passed as plain value, no useState inside */}
          <div className="max-h-60 overflow-y-auto py-1">
            {renderList(handleSelect, query)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ProductPicker — ต่อ Supabase จริง (server search + recently used + create)
// CLAUDE.md §21
// ============================================================

export type ProductPickerValue = {
  id:            string;
  sku:           string | null;
  name:          string;
  uom_name?:     string | null;
  list_price?:   number | null;
  stock_on_hand?: number | null;
  primary_image_url?: string | null;
};

export interface ProductPickerProps {
  value: ProductPickerValue | null;
  onChange: (v: ProductPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  /** ปิดการสร้างสินค้าใหม่จาก dropdown */
  disableCreate?: boolean;
}

const RECENT_KEY = "erp-recent-products";

function loadRecent(): ProductPickerValue[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function pushRecent(p: ProductPickerValue) {
  try {
    const list = loadRecent().filter(x => x.id !== p.id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([p, ...list].slice(0, 6)));
  } catch { /* ignore */ }
}

export function ProductPicker({ value, onChange, placeholder = "เลือกสินค้า...", disabled, error, disableCreate }: ProductPickerProps) {
  const { can } = useAuth();
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const [results, setResults] = useState<ProductPickerValue[]>([]);
  const [recent, setRecent]   = useState<ProductPickerValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const canCreate = !disableCreate && can("products.create");

  // outside-click จัดการโดย FloatingDropdown (รวม dropdown ใน portal ด้วย)

  // โหลด recently used เมื่อเปิด
  useEffect(() => { if (open) setRecent(loadRecent()); }, [open]);

  // ค้นหาจาก Supabase (debounce)
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/playground-products?search=${encodeURIComponent(query)}&limit=10`);
        const json = await res.json();
        if (active) setResults((json.data ?? []) as ProductPickerValue[]);
      } catch { if (active) setResults([]); }
      finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [query, open]);

  const select = useCallback((p: ProductPickerValue) => {
    onChange(p); pushRecent(p); setOpen(false); setQuery("");
  }, [onChange]);

  const createNew = async () => {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/playground-products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: query.trim() }),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      const p = json.data as ProductPickerValue;
      select(p);
    } finally { setCreating(false); }
  };

  // ไม่มีผลลัพธ์ตรงชื่อ query เป๊ะ → เสนอสร้างใหม่
  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase());
  const showCreate = canCreate && query.trim() && !exactMatch && !loading;
  const list = query.trim() ? results : (recent.length ? recent : results);

  return (
    <div className="relative" ref={boxRef}>
      {/* Trigger */}
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`w-full h-9 px-3 flex items-center gap-2 text-sm border rounded-lg bg-white text-left transition-colors ${
          error ? "border-red-300" : "border-slate-200"
        } ${disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : "hover:border-blue-300"}`}>
        {value && <ImageThumbnail url={value.primary_image_url} size={24} alt={value.name} />}
        <span className="flex-1 truncate">
          {value ? <>{value.sku && <span className="font-mono text-xs text-slate-400 mr-1">{value.sku}</span>}{value.name}</>
                 : <span className="text-slate-400">{placeholder}</span>}
        </span>
        {value && !disabled && (
          <span onClick={e => { e.stopPropagation(); onChange(null); }} className="text-slate-300 hover:text-red-500"><IconX /></span>
        )}
        <span className="text-slate-400"><IconChevronDown /></span>
      </button>

      {/* Dropdown (ลอยผ่าน portal — ไม่โดน popup/ตาราง ตัด) */}
      <FloatingDropdown anchorRef={boxRef} open={open && !disabled} onClose={() => setOpen(false)} minWidth={560} maxWidth={680}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหา SKU / ชื่อสินค้า..."
              className="w-full h-8 pl-7 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {!query.trim() && recent.length > 0 && (
              <div className="px-3 py-1 text-xs text-slate-400">⏱ เคยใช้ล่าสุด</div>
            )}
            {loading ? (
              <div className="px-3 py-4 flex items-center justify-center text-slate-400"><IconLoader /></div>
            ) : list.length === 0 && !showCreate ? (
              <div className="px-3 py-4 text-center text-sm text-slate-400">ไม่พบสินค้า</div>
            ) : (
              list.map(p => (
                <button key={p.id} type="button" onClick={() => select(p)}
                  className={`w-full px-3 py-2 grid grid-cols-[40px_minmax(92px,120px)_minmax(0,1fr)_76px_86px] items-center gap-2 hover:bg-blue-50 transition-colors text-left ${value?.id === p.id ? "bg-blue-50" : ""}`}>
                  <ImageThumbnail url={p.primary_image_url} size={36} alt={p.name} />
                  <span className="font-mono text-xs bg-slate-100 px-1.5 py-1 rounded text-slate-600 truncate" title={p.sku ?? ""}>
                    {p.sku || "-"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-800 truncate" title={p.name}>{p.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {p.uom_name ? <>หน่วย: {p.uom_name}</> : <span>ยังไม่ตั้งหน่วย</span>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 tabular-nums">
                    {p.stock_on_hand != null ? Number(p.stock_on_hand).toLocaleString("th-TH") : "-"}
                    <div className="text-[10px] text-slate-400">คงเหลือ</div>
                  </div>
                  <div className="text-right text-xs text-slate-700 tabular-nums">
                    {p.list_price != null ? `฿${Number(p.list_price).toLocaleString("th-TH")}` : "-"}
                    <div className="text-[10px] text-slate-400">ราคาขาย</div>
                  </div>
                </button>
              ))
            )}

            {/* สร้างใหม่ */}
            {showCreate && (
              <button type="button" onClick={createNew} disabled={creating}
                className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-slate-100 disabled:opacity-50">
                {creating ? <IconLoader /> : <span className="text-lg leading-none">＋</span>}
                สร้างสินค้าใหม่ &quot;{query.trim()}&quot;
              </button>
            )}
          </div>
        </div>
      </FloatingDropdown>
    </div>
  );
}

// ============================================================
// SupplierPicker — ต่อ Supabase จริง (search + recent + create)
// CLAUDE.md §21 + §34
// ============================================================

export type SupplierPickerValue = {
  id:            string;
  code:          string | null;
  name:          string;
  contact_phone?: string | null;
  category?:      string | null;
};

export interface SupplierPickerProps {
  value: SupplierPickerValue | null;
  onChange: (v: SupplierPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  /** ปิดการสร้างผู้จำหน่ายใหม่จาก dropdown */
  disableCreate?: boolean;
}

const SUPPLIER_RECENT_KEY = "erp-recent-suppliers";

function loadSupplierRecent(): SupplierPickerValue[] {
  try { return JSON.parse(localStorage.getItem(SUPPLIER_RECENT_KEY) ?? "[]"); } catch { return []; }
}
function pushSupplierRecent(s: SupplierPickerValue) {
  try {
    const list = loadSupplierRecent().filter(x => x.id !== s.id);
    localStorage.setItem(SUPPLIER_RECENT_KEY, JSON.stringify([s, ...list].slice(0, 6)));
  } catch { /* ignore */ }
}

export function SupplierPicker({ value, onChange, placeholder = "เลือกผู้จำหน่าย...", disabled, error, disableCreate }: SupplierPickerProps) {
  const { can } = useAuth();
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const [results, setResults] = useState<SupplierPickerValue[]>([]);
  const [recent, setRecent]   = useState<SupplierPickerValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const canCreate = !disableCreate && can("suppliers.create");

  // outside-click จัดการโดย FloatingDropdown (รวม dropdown ใน portal ด้วย)

  useEffect(() => { if (open) setRecent(loadSupplierRecent()); }, [open]);

  // search (debounce 300ms)
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/playground-suppliers?search=${encodeURIComponent(query)}&limit=10`);
        const json = await res.json();
        if (active) setResults((json.data ?? []) as SupplierPickerValue[]);
      } catch { if (active) setResults([]); }
      finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [query, open]);

  const select = useCallback((s: SupplierPickerValue) => {
    onChange(s); pushSupplierRecent(s); setOpen(false); setQuery("");
  }, [onChange]);

  const createNew = async () => {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/playground-suppliers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: query.trim() }),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      const s = json.data as SupplierPickerValue;
      select(s);
    } finally { setCreating(false); }
  };

  const exactMatch = results.some(r => r.name.toLowerCase() === query.trim().toLowerCase());
  const showCreate = canCreate && query.trim() && !exactMatch && !loading;
  const list = query.trim() ? results : (recent.length ? recent : results);

  return (
    <div className="relative" ref={boxRef}>
      {/* Trigger */}
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
        <span className="text-slate-400"><IconChevronDown /></span>
      </button>

      {/* Dropdown (ลอยผ่าน portal — ไม่โดน popup/ตาราง ตัด) */}
      <FloatingDropdown anchorRef={boxRef} open={open && !disabled} onClose={() => setOpen(false)}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหา รหัส / ชื่อ / เบอร์..."
              className="w-full h-8 pl-7 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {!query.trim() && recent.length > 0 && (
              <div className="px-3 py-1 text-xs text-slate-400">⏱ เคยใช้ล่าสุด</div>
            )}
            {loading ? (
              <div className="px-3 py-4 flex items-center justify-center text-slate-400"><IconLoader /></div>
            ) : list.length === 0 && !showCreate ? (
              <div className="px-3 py-4 text-center text-sm text-slate-400">ไม่พบผู้จำหน่าย</div>
            ) : (
              list.map(s => (
                <button key={s.id} type="button" onClick={() => select(s)}
                  className={`w-full px-3 py-2 flex flex-col hover:bg-blue-50 transition-colors text-left ${value?.id === s.id ? "bg-blue-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    {s.code && <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{s.code}</span>}
                    {s.category && <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">{s.category}</span>}
                    <span className="text-sm text-slate-800 truncate">{s.name}</span>
                  </div>
                  {s.contact_phone && (
                    <div className="text-xs text-slate-400 mt-0.5">📞 {s.contact_phone}</div>
                  )}
                </button>
              ))
            )}

            {/* สร้างใหม่ */}
            {showCreate && (
              <button type="button" onClick={createNew} disabled={creating}
                className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-slate-100 disabled:opacity-50">
                {creating ? <IconLoader /> : <span className="text-lg leading-none">＋</span>}
                สร้างผู้จำหน่ายใหม่ &quot;{query.trim()}&quot;
              </button>
            )}
          </div>
        </div>
      </FloatingDropdown>
    </div>
  );
}

// ---- EmployeePicker / others — ใช้ Master Picker Factory (Supabase) ----
// re-export จาก ./master ที่ใช้ factory pattern
export {
  CustomerPicker, EmployeePicker, WarehousePicker,
  DepartmentPicker, UnitPicker, TaxPicker,
} from "./master";
export type {
  CustomerPickerValue, EmployeePickerValue, WarehousePickerValue,
  DepartmentPickerValue, UnitPickerValue, TaxPickerValue, MasterValue,
} from "./master";
