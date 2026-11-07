"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { ImageThumbnail } from "@/components/image-manager";
import { FloatingDropdown, PICKER_PANEL, PICKER_PANEL_WIDE, PICKER_NAME_CLASS } from "@/components/floating-dropdown";
import { RECENT_KEYS, useRecentPicks } from "@/lib/recent-picks";   // "เคยใช้ล่าสุด" (ของกลาง)

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

// ProductPicker ตัวเก่า (อ่านสินค้าชุดทดลอง /api/playground-products) ลบแล้ว 2026-11-07 — ใช้ SkuPicker ด้านล่าง

// ============================================================
// SkuPicker — ใช้ module skus ผ่าน master-v2 กลาง
// ============================================================

export type SkuPickerValue = {
  id: string;
  code: string;
  barcode?: string | null;
  name: string;
  uom_name?: string | null;
  color?: string | null;
  category?: string | null;
  list_price?: number | null;
  fake_price?: number | null;
  image_url?: string | null;
  image_key?: string | null;
  sale_ok?: boolean | null;
  // Parent ของ SKU (จาก /api/pickers/skus) — ใช้เติม Parent SKU ให้อัตโนมัติ
  parent_sku_id?: string | null;
  parent_code?: string | null;
  parent_name?: string | null;
};

export interface SkuPickerProps {
  value: SkuPickerValue | null;
  onChange: (v: SkuPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  salesOnly?: boolean;
}

function skuImageUrl(key: unknown): string | null {
  return key ? `/api/r2-image?key=${encodeURIComponent(String(key))}` : null;
}

function mapSkuRow(row: Record<string, unknown>): SkuPickerValue {
  const code = String(row.code ?? "");
  const imageKey = row.image_key ?? row.cover_image_r2_key;
  return {
    id: String(row.id),
    code,
    name: String(row.name ?? row.name_th ?? row.sku_name ?? code),
    uom_name: row.uom_name != null ? String(row.uom_name) : row.uom_label != null ? String(row.uom_label) : null,
    color: row.color != null ? String(row.color) : row.color_th != null ? String(row.color_th) : null,
    list_price: row.list_price == null ? null : Number(row.list_price),
    fake_price: row.fake_price == null ? null : Number(row.fake_price),
    image_key: imageKey == null ? null : String(imageKey),
    image_url: skuImageUrl(imageKey),
    sale_ok: typeof row.sale_ok === "boolean" ? row.sale_ok : null,
    parent_sku_id: row.parent_sku_id == null ? null : String(row.parent_sku_id),
    parent_code: row.parent_code == null ? null : String(row.parent_code),
    parent_name: row.parent_name == null ? null : String(row.parent_name),
  };
}

export function SkuPicker({
  value,
  onChange,
  placeholder = "เลือก SKU...",
  disabled,
  error,
  salesOnly = false,
}: SkuPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkuPickerValue[]>([]);
  const { recent, remember } = useRecentPicks<SkuPickerValue>(RECENT_KEYS.skus, open);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const SKU_PAGE = 24;
  const fetchPage = useCallback(async (q: string, offset: number): Promise<{ rows: SkuPickerValue[]; total: number }> => {
    const params = new URLSearchParams({ search: q, limit: String(SKU_PAGE), offset: String(offset) });
    if (!salesOnly) params.set("sales_only", "false");
    const res = await apiFetch(`/api/pickers/skus?${params}`);
    const json = await res.json();
    return { rows: ((json.data ?? []) as Record<string, unknown>[]).map(mapSkuRow), total: Number(json.total ?? 0) };
  }, [salesOnly]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const { rows, total } = await fetchPage(query, 0); if (active) { setResults(rows); setTotal(total); } }
      catch { if (active) { setResults([]); setTotal(0); } }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, fetchPage]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try { const { rows, total } = await fetchPage(query, results.length); setResults(prev => [...prev, ...rows]); setTotal(total); }
    catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }, [fetchPage, query, results.length]);

  const select = useCallback((sku: SkuPickerValue) => {
    onChange(sku);
    remember(sku);
    setOpen(false);
    setQuery("");
  }, [onChange, remember]);

  // ยังไม่พิมพ์ค้นหา → โชว์ "เคยใช้ล่าสุด" ไว้บนสุด (ไม่ซ้ำกับรายการด้านล่าง)
  const recentShown = query.trim() ? [] : recent;
  const recentIds = new Set(recentShown.map((r) => r.id));

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`w-full h-9 px-3 flex items-center gap-2 text-sm border rounded-lg bg-white text-left transition-colors ${
          error ? "border-red-300" : "border-slate-200"
        } ${disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : "hover:border-blue-300"}`}>
        {value && <ImageThumbnail url={value.image_url} size={24} alt={value.name} />}
        <span className="flex-1 truncate">
          {value ? <><span className="font-mono text-xs text-slate-400 mr-1">{value.code}</span>{value.name}</>
                 : <span className="text-slate-400">{placeholder}</span>}
        </span>
        {value && !disabled && (
          <span onClick={e => { e.stopPropagation(); onChange(null); }} className="text-slate-300 hover:text-red-500"><IconX /></span>
        )}
        <span className="text-slate-400"><IconChevronDown /></span>
      </button>

      <FloatingDropdown anchorRef={boxRef} open={open && !disabled} onClose={() => setOpen(false)} {...PICKER_PANEL_WIDE}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหา SKU / ชื่อสินค้า..."
              className="w-full h-8 pl-7 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {recentShown.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400">⏱ เคยใช้ล่าสุด</div>
                {recentShown.map(sku => (
                  <button key={"recent-" + sku.id} type="button" onClick={() => select(sku)}
                    className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-blue-50 transition-colors text-left ${value?.id === sku.id ? "bg-blue-50" : ""}`}>
                    <ImageThumbnail url={sku.image_url} size={26} alt={sku.name} />
                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-1 rounded text-slate-600 truncate max-w-[120px]" title={sku.code}>{sku.code || "-"}</span>
                    <span className={PICKER_NAME_CLASS} title={sku.name}>{sku.name}</span>
                  </button>
                ))}
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400 border-t border-slate-100">ทั้งหมด</div>
              </>
            )}
            {loading ? (
              <div className="px-3 py-3 flex items-center justify-center gap-2 text-xs text-slate-400"><IconLoader />กำลังค้นหา...</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-400">ไม่พบ SKU</div>
            ) : (
              results.filter(sku => !recentIds.has(sku.id)).map(sku => (
                <button key={sku.id} type="button" onClick={() => select(sku)}
                  className={`w-full px-3 py-2 grid grid-cols-[34px_minmax(88px,120px)_minmax(0,1fr)_72px] items-start gap-2 hover:bg-blue-50 transition-colors text-left ${value?.id === sku.id ? "bg-blue-50" : ""}`}>
                  <ImageThumbnail url={sku.image_url} size={30} alt={sku.name} />
                  <span className="font-mono text-xs bg-slate-100 px-1.5 py-1 rounded text-slate-600 truncate" title={sku.code}>
                    {sku.code || "-"}
                  </span>
                  <div className="min-w-0">
                    <div className={PICKER_NAME_CLASS} title={sku.name}>{sku.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {sku.uom_name ? <>หน่วย: {sku.uom_name}</> : <span>ยังไม่ตั้งหน่วย</span>}
                      {sku.sale_ok === false && <span className="ml-2 text-amber-600">ไม่เปิดขาย</span>}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-700 tabular-nums">
                    {sku.list_price != null ? `฿${Number(sku.list_price).toLocaleString("th-TH")}` : "-"}
                    <div className="text-[10px] text-slate-400">ราคาขาย</div>
                  </div>
                </button>
              ))
            )}
            {!loading && results.length > 0 && results.length < total && (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="w-full px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 border-t border-slate-100 sticky bottom-0 bg-white disabled:opacity-60">
                {loadingMore ? "กำลังโหลด..." : `ดูเพิ่มเติม (เหลืออีก ${total - results.length})`}
              </button>
            )}
          </div>
          {!loading && total > 0 && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50/60">
              แสดง {results.length} จาก {total} รายการ
            </div>
          )}
        </div>
      </FloatingDropdown>
    </div>
  );
}

// ============================================================
// ParentSkuPicker — เลือก Parent SKU (parent_skus_v2) ผ่าน /api/pickers/parent-skus
// ============================================================

export type ParentSkuPickerValue = { id: string; code: string; name: string; image_key?: string | null; image_url?: string | null };

function mapParentRow(row: Record<string, unknown>): ParentSkuPickerValue {
  const imageKey = row.image_key == null ? null : String(row.image_key);
  return { id: String(row.id), code: String(row.code ?? ""), name: String(row.name ?? row.code ?? ""), image_key: imageKey, image_url: skuImageUrl(imageKey) };
}

/** หา Parent SKU ที่รหัสตรงตัว (ไม่สนตัวพิมพ์) — ไม่เจอ/เรียกไม่ได้ = null · ใช้เดาสินค้าจากชื่อ (เช่น อัลบั้ม "ROAR06") */
export async function findParentSkuByCode(code: string): Promise<ParentSkuPickerValue | null> {
  const want = code.trim().toUpperCase();
  if (!want) return null;
  try {
    const res = await apiFetch(`/api/pickers/parent-skus?${new URLSearchParams({ search: want, limit: "10" })}`);
    if (!res.ok) return null;
    const json = await res.json();
    const rows = ((json.data ?? []) as Record<string, unknown>[]).map(mapParentRow);
    return rows.find((r) => r.code.toUpperCase() === want) ?? null;
  } catch {
    return null;
  }
}

export function ParentSkuPicker({ value, onChange, placeholder = "เลือก Parent SKU...", disabled, error, disableCreate }: {
  value: ParentSkuPickerValue | null;
  onChange: (v: ParentSkuPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  /** ปิดการสร้าง Parent SKU ใหม่จาก dropdown */
  disableCreate?: boolean;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParentSkuPickerValue[]>([]);
  const { recent, remember } = useRecentPicks<ParentSkuPickerValue>(RECENT_KEYS.parentSkus, open);
  const PARENT_PAGE = 24;                         // โหลดทีละหน้า + ปุ่มโหลดเพิ่ม
  const [total, setTotal] = useState(0);          // ทั้งหมดที่ตรงคำค้น (ไว้บอก + โหลดเพิ่ม)
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canCreate = !disableCreate && can("products.create");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/pickers/parent-skus?${new URLSearchParams({ search: query, limit: String(PARENT_PAGE) })}`);
        const json = await res.json();
        const rows = (json.data ?? []) as Record<string, unknown>[];
        if (active) { setResults(rows.map(mapParentRow)); setTotal(Number(json.total ?? rows.length)); }
      } catch { if (active) { setResults([]); setTotal(0); } }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [open, query]);

  const select = useCallback((p: ParentSkuPickerValue) => { onChange(p); remember(p); setOpen(false); setQuery(""); }, [onChange, remember]);
  const recentShown = query.trim() ? [] : recent;
  const recentIds = new Set(recentShown.map((r) => r.id));

  // โหลดเพิ่ม (ต่อท้าย) — กันเคสค้นแล้วเจอเกินหน้าแรก เช่นพิมพ์ "WK" เจอ 40 แต่เห็นแค่หน้าละ 24
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/pickers/parent-skus?${new URLSearchParams({ search: query, limit: String(PARENT_PAGE), offset: String(results.length) })}`);
      const json = await res.json();
      const rows = ((json.data ?? []) as Record<string, unknown>[]).map(mapParentRow);
      setResults((p) => [...p, ...rows]);
    } catch { /* ignore */ } finally { setLoadingMore(false); }
  };

  // สร้าง Parent SKU ใหม่จากรหัสที่พิมพ์ (code = query) แล้วเลือกทันที
  const createNew = async () => {
    const code = query.trim();
    if (!code) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/pickers/parent-skus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      select(mapParentRow(json.data as Record<string, unknown>));
    } catch (e) { alert((e as Error).message); }
    finally { setCreating(false); }
  };
  const exactMatch = results.some((r) => r.code.toLowerCase() === query.trim().toLowerCase());
  const showCreate = canCreate && !!query.trim() && !exactMatch && !loading;

  return (
    <div className="relative" ref={boxRef}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={`w-full h-9 px-3 flex items-center gap-2 text-sm border rounded-lg bg-white text-left transition-colors ${error ? "border-red-300" : "border-slate-200"} ${disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : "hover:border-blue-300"}`}>
        {value && <ImageThumbnail url={value.image_url} size={24} alt={value.name} />}
        <span className="flex-1 truncate">
          {value ? <><span className="font-mono text-xs text-slate-400 mr-1">{value.code}</span>{value.name}</> : <span className="text-slate-400">{placeholder}</span>}
        </span>
        {value && !disabled && <span onClick={(e) => { e.stopPropagation(); onChange(null); }} className="text-slate-300 hover:text-red-500"><IconX /></span>}
        <span className="text-slate-400"><IconChevronDown /></span>
      </button>

      <FloatingDropdown anchorRef={boxRef} open={open && !disabled} onClose={() => setOpen(false)} {...PICKER_PANEL}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
            <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหา Parent SKU / ชื่อ..."
              className="w-full h-8 pl-7 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {recentShown.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400">⏱ เคยใช้ล่าสุด</div>
                {recentShown.map((p) => (
                  <button key={"recent-" + p.id} type="button" onClick={() => select(p)}
                    className={`w-full px-3 py-2 flex items-start gap-2 hover:bg-blue-50 transition-colors text-left ${value?.id === p.id ? "bg-blue-50" : ""}`}>
                    <ImageThumbnail url={p.image_url} size={26} alt={p.name} />
                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-1 rounded text-slate-600 shrink-0 truncate max-w-[120px]" title={p.code}>{p.code || "-"}</span>
                    <span className={PICKER_NAME_CLASS} title={p.name}>{p.name}</span>
                  </button>
                ))}
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400 border-t border-slate-100">ทั้งหมด</div>
              </>
            )}
            {loading ? (
              <div className="px-3 py-3 flex items-center justify-center gap-2 text-xs text-slate-400"><IconLoader />กำลังค้นหา...</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-400">{showCreate ? `ไม่พบ "${query.trim()}"` : "ไม่พบ Parent SKU"}</div>
            ) : (
              results.filter((p) => !recentIds.has(p.id)).map((p) => (
                <button key={p.id} type="button" onClick={() => select(p)}
                  className={`w-full px-3 py-2 flex items-start gap-2 hover:bg-blue-50 transition-colors text-left ${value?.id === p.id ? "bg-blue-50" : ""}`}>
                  <ImageThumbnail url={p.image_url} size={30} alt={p.name} />
                  <span className="font-mono text-xs bg-slate-100 px-1.5 py-1 rounded text-slate-600 shrink-0 truncate max-w-[120px]" title={p.code}>{p.code || "-"}</span>
                  <span className={PICKER_NAME_CLASS} title={p.name}>{p.name}</span>
                </button>
              ))
            )}
            {/* เจอมากกว่าที่โชว์ → โหลดเพิ่มได้ (ไม่งั้นตัวที่อยู่ท้าย ๆ จะหาไม่เจอ) */}
            {!loading && results.length > 0 && results.length < total && (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="w-full px-3 py-2 text-xs text-blue-700 bg-blue-50/60 hover:bg-blue-50 disabled:opacity-50 border-t border-slate-100">
                {loadingMore ? "กำลังโหลด…" : `โหลดเพิ่ม (แสดง ${results.length}/${total})`}
              </button>
            )}
          </div>
          {showCreate && (
            <button type="button" onClick={createNew} disabled={creating}
              className="w-full px-3 py-2.5 flex items-center gap-2 border-t border-slate-100 text-left text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-50">
              <span className="text-base leading-none">{creating ? "⏳" : "＋"}</span>
              <span>สร้าง Parent SKU ใหม่ <span className="font-mono font-medium">&quot;{query.trim()}&quot;</span></span>
            </button>
          )}
        </div>
      </FloatingDropdown>
    </div>
  );
}

// SupplierPicker ชุดนี้ (อ่านร้านทดลอง 5 ร้าน /api/playground-suppliers) ลบแล้ว 2026-11-07 — ใช้ SupplierPicker ใน components/supplier-picker

// ---- ตัวเลือกข้อมูลหลัก — ใช้ Master Picker Factory (Supabase) ----
// re-export จาก ./master ที่ใช้ factory pattern
// (EmployeePicker / DepartmentPicker / UnitPicker / TaxPicker ตัวเก่าที่อ่านตารางทดลอง ลบแล้ว 2026-11-07
//  → พนักงาน: RealEmployeePicker · คนที่ล็อกอินได้: UserPicker · หน่วย: UomPicker)
export {
  CustomerPicker, UserPicker, WarehousePicker, useRecentUsers,
} from "./master";
export { RecordPeekLink } from "./record-peek-link";
export type {
  CustomerPickerValue, EmployeePickerValue, UserPickerValue, WarehousePickerValue, MasterValue,
} from "./master";
