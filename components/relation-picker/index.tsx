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
import { apiFetch } from "@/lib/api";
import type { PickerOption } from "@/app/api/admin/picker/route";

export type RelationConfig = {
  target_module_key?:     string;
  target_table:           string;
  target_label_field:     string;
  target_search_fields?:  string[];
  secondary_label_field?: string;
};

interface RelationPickerProps {
  value:    string | null;
  onChange: (value: string | null, option?: PickerOption) => void;
  config:   RelationConfig;
  placeholder?: string;
  disabled?:    boolean;
  required?:    boolean;
  hasError?:    boolean;
}

export function RelationPicker({
  value, onChange, config, placeholder = "— เลือก —", disabled, required, hasError,
}: RelationPickerProps) {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<PickerOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // ---- load options ----
  const loadOptions = useCallback(async (query: string, includeCurrent: string | null) => {
    setLoading(true);
    const params = new URLSearchParams({
      table:     config.target_table,
      label:     config.target_label_field,
      limit:     "20",
    });
    if (query) params.set("search", query);
    if (config.target_search_fields?.length) {
      params.set("search_in", config.target_search_fields.join(","));
    }
    if (config.secondary_label_field) {
      params.set("secondary", config.secondary_label_field);
    }
    if (includeCurrent) params.set("include_ids", includeCurrent);

    try {
      const res = await apiFetch(`/api/admin/picker?${params}`);
      const json = await res.json();
      setOptions((json.data ?? []) as PickerOption[]);
    } finally {
      setLoading(false);
    }
  }, [config]);

  // ---- resolve current value to label (initial + when value changes) ----
  useEffect(() => {
    if (!value) { setCurrent(null); return; }
    // find in already-loaded options
    const inOpts = options.find((o) => o.id === value);
    if (inOpts) { setCurrent(inOpts); return; }
    // fetch this single id
    apiFetch(`/api/admin/picker?table=${config.target_table}&label=${config.target_label_field}&include_ids=${value}&limit=1${config.secondary_label_field ? `&secondary=${config.secondary_label_field}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        const found = (j.data as PickerOption[] | undefined)?.find((o) => o.id === value);
        if (found) setCurrent(found);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, config.target_table, config.target_label_field, config.secondary_label_field]);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full h-9 px-3 text-sm text-left border rounded-md flex items-center justify-between gap-2 transition-colors ${
          hasError ? "border-red-300" : "border-slate-200 hover:border-slate-300"
        } ${disabled ? "bg-slate-50 cursor-not-allowed" : "bg-white"}`}
      >
        {current ? (
          <span className="truncate">
            <span className="text-slate-800">{current.label}</span>
            {current.secondary && (
              <span className="ml-1.5 text-xs text-slate-400">{current.secondary}</span>
            )}
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}{required && " *"}</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* search */}
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา..."
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded outline-none focus:border-orange-400"
            />
          </div>

          {/* options */}
          <div className="overflow-y-auto flex-1 max-h-64">
            {loading ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">กำลังโหลด...</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">ไม่พบ</div>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
