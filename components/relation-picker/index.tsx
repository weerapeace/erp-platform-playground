"use client";

/**
 * RelationPicker — ของกลางสำหรับ FK field (Sprint 5)
 *
 * Generic searchable dropdown ที่ใช้ /api/admin/picker
 * รับ config:
 *   target_table          (เช่น 'brands')
 *   target_label_field    (เช่น 'name')
 *   target_search_fields  (default = [label_field])
 *   secondary_label_field (optional)
 *
 * ใช้ใน MasterCRUDPage เมื่อ field.type === 'relation'
 */

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { buildRelationFilter, type RelationConfig } from "@/lib/relation";
import type { PickerOption } from "@/app/api/admin/picker/route";

// lazy เพื่อตัด circular import (RecordFormModal ใช้ RelationPicker ข้างใน)
const RecordFormModal = dynamic(() => import("@/components/record-form-modal").then((m) => m.RecordFormModal), { ssr: false });

// re-export type กลางเพื่อ back-compat (โค้ดเดิม import จาก @/components/relation-picker ได้เหมือนเดิม)
export type { RelationConfig } from "@/lib/relation";

interface RelationPickerProps {
  value:    string | null;
  onChange: (value: string | null, option?: PickerOption) => void;
  config:   RelationConfig;
  placeholder?: string;
  disabled?:    boolean;
  required?:    boolean;
  hasError?:    boolean;
  /**
   * R3: ค่าปัจจุบันของ field อื่นในฟอร์มเดียวกัน — ใช้กับ dependent dropdown
   * เช่น { warehouse_id: "uuid" } เพื่อกรอง location ตาม warehouse ที่เลือก
   */
  siblingValues?: Record<string, unknown>;
}

export function RelationPicker({
  value, onChange, config, placeholder = "— เลือก —", disabled, required, hasError,
  siblingValues = {},
}: RelationPickerProps) {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<PickerOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // ---- R3: dependent dropdown — คำนวณ filter ที่มีผลจริง (รวม static + dependent) ----
  const effectiveFilter = buildRelationFilter(config, siblingValues);
  const isBlocked = effectiveFilter != null && "blocked" in effectiveFilter;
  const activeFilter = effectiveFilter && !("blocked" in effectiveFilter) ? effectiveFilter : null;
  // key สำหรับ track ว่าพ่อเปลี่ยน → clear ลูก + reload
  const parentKey = config.depends_on ? String(siblingValues[config.depends_on.parent_field] ?? "") : "";

  // ---- load options ----
  // F9: ถ้า config.lookup_type → ใช้ /api/lookups (generic) | ไม่งั้น /api/admin/picker (table จริง)
  const loadOptions = useCallback(async (query: string, includeCurrent: string | null) => {
    if (isBlocked) { setOptions([]); return; }   // พ่อยังไม่เลือก → ไม่ต้องโหลด
    setLoading(true);
    try {
      let opts: PickerOption[] = [];
      if (config.lookup_type) {
        const params = new URLSearchParams({ type: config.lookup_type, limit: "100" });
        if (query)           params.set("search", query);
        if (includeCurrent)  params.set("include_ids", includeCurrent);
        const res = await apiFetch(`/api/lookups?${params}`);
        const json = await res.json();
        opts = ((json.data ?? []) as Array<{ id: string; name: string; code: string | null; is_active: boolean }>)
          .map((r) => ({
            id:        r.id,
            label:     r.name,
            secondary: r.code ?? undefined,
            active:    r.is_active,
          }));
      } else {
        const params = new URLSearchParams({
          table: config.target_table,
          label: config.target_label_field,
          limit: "100",                 // โชว์ได้มากขึ้น (เดิม 20 → เห็นไม่ครบ) ที่เหลือใช้ค้นหา
        });
        if (query) params.set("search", query);
        if (config.target_search_fields?.length) params.set("search_in", config.target_search_fields.join(","));
        if (config.secondary_label_field)        params.set("secondary", config.secondary_label_field);
        // R3: ใช้ activeFilter (dependent มาก่อน static) แทน config.filter ตรงๆ
        if (activeFilter)                         { params.set("filter_col", activeFilter.column); params.set("filter_val", activeFilter.value); }
        if (includeCurrent)                       params.set("include_ids", includeCurrent);
        const res = await apiFetch(`/api/admin/picker?${params}`);
        const json = await res.json();
        opts = (json.data ?? []) as PickerOption[];
      }
      setOptions(opts);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isBlocked, activeFilter?.column, activeFilter?.value]);

  // ---- R3: พ่อเปลี่ยน → เคลียร์ค่าลูกที่อาจไม่เข้าพวกอีกต่อไป ----
  const prevParentRef = useRef(parentKey);
  useEffect(() => {
    if (!config.depends_on) return;
    if (prevParentRef.current !== parentKey) {
      prevParentRef.current = parentKey;
      // พ่อเปลี่ยนจริง (ไม่ใช่ render แรก) + ลูกมีค่าอยู่ → เคลียร์
      if (value) { onChange(null); setCurrent(null); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKey]);

  // ---- resolve current value to label (initial + when value changes) ----
  useEffect(() => {
    if (!value) { setCurrent(null); return; }
    const inOpts = options.find((o) => o.id === value);
    if (inOpts) { setCurrent(inOpts); return; }
    // fetch this single id — F9 path
    const url = config.lookup_type
      ? `/api/lookups?type=${config.lookup_type}&include_ids=${value}&limit=1`
      : `/api/admin/picker?table=${config.target_table}&label=${config.target_label_field}&include_ids=${value}&limit=1${config.secondary_label_field ? `&secondary=${config.secondary_label_field}` : ""}`;
    apiFetch(url)
      .then((r) => r.json())
      .then((j) => {
        const data = (j.data ?? []) as Array<Record<string, unknown>>;
        const row  = data.find((o) => o.id === value);
        if (!row) return;
        if (config.lookup_type) {
          setCurrent({
            id:        String(row.id),
            label:     String(row.name ?? ""),
            secondary: (row.code as string | null) ?? undefined,
            active:    typeof row.is_active === "boolean" ? row.is_active : undefined,
          });
        } else {
          setCurrent(row as unknown as PickerOption);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, config.target_table, config.target_label_field, config.secondary_label_field, config.lookup_type]);

  // ---- load on open ----
  useEffect(() => {
    if (open) loadOptions(search, value);
  }, [open, search, value, loadOptions]);

  // ---- click outside ----
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (opt: PickerOption | null) => {
    onChange(opt?.id ?? null, opt ?? undefined);
    setCurrent(opt);
    setOpen(false);
    setSearch("");
  };

  // ---- F6: Quick create ----
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState<string | null>(null);  // เปิดฟอร์มเต็ม (popup)

  // สร้างใหม่ได้เมื่อ relation ชี้ไป module/lookup จริง — เป็นของกลาง (ไม่ต้องตั้ง allow_create)
  const canCreate = !!config.lookup_type || !!config.target_module_key;

  const quickCreate = async (name: string) => {
    if (!canCreate || !name.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const url     = config.lookup_type ? "/api/lookups" : `/api/master-v2/${config.target_module_key}`;
      const payload = config.lookup_type
        ? { lookup_type: config.lookup_type, name: name.trim() }
        : { [config.target_label_field]: name.trim() };
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.error) { setCreateErr(json.error); return; }
      // select ตัวใหม่ทันที
      const row = json.data as Record<string, unknown>;
      const newOpt: PickerOption = {
        id:    String(row.id),
        label: String(config.lookup_type ? row.name : row[config.target_label_field] ?? name),
      };
      select(newOpt);
    } catch (e) {
      setCreateErr(String((e as Error).message ?? e));
    } finally {
      setCreating(false);
    }
  };

  // R3: ถ้า dependent + พ่อยังไม่เลือก → ปิดการใช้งาน + บอกให้เลือกพ่อก่อน
  const blockedDisabled = disabled || isBlocked;
  const blockedHint = isBlocked && config.depends_on
    ? `เลือก ${config.depends_on.parent_field.replace(/_id$/, "")} ก่อน`
    : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={blockedDisabled}
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full h-9 px-3 text-sm text-left border rounded-md flex items-center justify-between gap-2 transition-colors ${
          hasError ? "border-red-300" : "border-slate-200 hover:border-slate-300"
        } ${blockedDisabled ? "bg-slate-50 cursor-not-allowed" : "bg-white"}`}
      >
        {current ? (
          <span className="truncate">
            <span className="text-slate-800">{current.label}</span>
            {current.secondary && (
              <span className="ml-1.5 text-xs text-slate-400">{current.secondary}</span>
            )}
          </span>
        ) : blockedHint ? (
          <span className="text-slate-400 italic">{blockedHint}</span>
        ) : (
          <span className="text-slate-400">{placeholder}{required && " *"}</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {/* backdrop — มือถือเปิดเป็น popup เต็มจอ */}
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={() => setOpen(false)} />
          <div className="z-50 bg-white flex flex-col overflow-hidden
                          fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl shadow-2xl
                          sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-1 sm:max-h-80 sm:rounded-lg sm:border sm:border-slate-200 sm:shadow-lg">
            {/* หัว (เฉพาะมือถือ) */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sm:hidden">
              <span className="font-semibold text-slate-800">เลือกรายการ</span>
              <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 text-xl leading-none">×</button>
            </div>
            {/* search */}
            <div className="p-2 border-b border-slate-100">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา..."
                className="w-full h-10 sm:h-8 px-3 sm:px-2 text-base sm:text-sm border border-slate-200 rounded-lg sm:rounded outline-none focus:border-orange-400"
              />
            </div>

            {/* options */}
            <div className="overflow-y-auto flex-1 sm:max-h-64">
            {loading ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">กำลังโหลด...</div>
            ) : (
              <>
                {/* clear option */}
                {value && (
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 border-b border-slate-100"
                  >
                    ✕ ล้างค่า
                  </button>
                )}
                {options.length === 0 && !canCreate && (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">ไม่พบ</div>
                )}
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => select(opt)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-orange-50 ${
                      value === opt.id ? "bg-orange-50 font-medium" : ""
                    } ${opt.active === false ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-800 truncate">{opt.label}</span>
                      {opt.active === false && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">ปิดอยู่</span>
                      )}
                    </div>
                    {opt.secondary && (
                      <div className="text-xs text-slate-500 truncate">{opt.secondary}</div>
                    )}
                  </button>
                ))}

                {/* F6: Quick create button */}
                {canCreate && search.trim() && !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase()) && (
                  <div className="border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        // module จริง → เปิดฟอร์มเต็ม (popup) | lookup → สร้างเร็ว (แค่ชื่อ)
                        if (config.target_module_key) { setOpen(false); setShowCreate(search.trim()); }
                        else void quickCreate(search);
                      }}
                      disabled={creating}
                      className="w-full px-3 py-2.5 text-left text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-2"
                    >
                      <span className="text-base">＋</span>
                      <span>
                        {creating ? "กำลังสร้าง..." : <>สร้างใหม่: <strong>&ldquo;{search.trim()}&rdquo;</strong></>}
                      </span>
                    </button>
                    {createErr && (
                      <div className="px-3 py-1.5 text-[11px] text-red-600 bg-red-50 border-t border-red-100">⚠ {createErr}</div>
                    )}
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        </>
      )}

      {/* ฟอร์มสร้างใหม่เต็ม (popup) — เมื่อ relation ชี้ไป module จริง */}
      {showCreate !== null && config.target_module_key && (
        <RecordFormModal
          moduleKey={config.target_module_key}
          title={`สร้าง ${config.target_label_field ?? "รายการ"}`}
          presetLabelField={config.target_label_field}
          presetValue={showCreate}
          onClose={() => setShowCreate(null)}
          onSaved={(id, label) => { setShowCreate(null); select({ id, label }); }}
        />
      )}
    </div>
  );
}
