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
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { buildRelationFilter, type RelationConfig } from "@/lib/relation";
import type { PickerOption } from "@/app/api/admin/picker/route";

// cache ผลตัวเลือก dropdown ใน session (per URL) อายุสั้น ~60วิ
// → เปิด dropdown เดิมซ้ำ/พิมพ์ค้นคำเดิม = แสดงทันที ไม่ต้องยิง worker (~2วิ) ใหม่
const PICKER_CACHE = new Map<string, { at: number; opts: PickerOption[] }>();
const PICKER_TTL = 60000;

/** ตัวเลือกพิเศษปักบนสุดของ dropdown (เช่น "ค่าส่ง" / "VAT") — ไม่ใช่ record จาก DB */
export type PinnedOption = PickerOption & {
  /** สี tailwind classes เช่น "text-purple-700" สำหรับทำให้เด่น */
  accentClass?: string;
};

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
  /** ตัวเลือกพิเศษปักบนสุด (เด่น/คนละสี) เช่น ค่าส่ง / VAT — id เป็น token พิเศษ ไม่ใช่ uuid */
  pinnedOptions?: PinnedOption[];
}

export function RelationPicker({
  value, onChange, config, placeholder = "— เลือก —", disabled, required, hasError,
  siblingValues = {}, pinnedOptions = [],
}: RelationPickerProps) {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<PickerOption | null>(null);
  const [mounted, setMounted] = useState(false);   // กัน SSR ตอนใช้ Portal
  const [isMobile, setIsMobile] = useState(false);  // <640px → dropdown เต็มจอ (Portal)
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 639px)");
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  const pinned = pinnedOptions.find((p) => p.id === value) ?? null;

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
    // สร้าง URL ของคำขอ (ใช้เป็น cache key ด้วย)
    let url: string;
    if (config.lookup_type) {
      const params = new URLSearchParams({ type: config.lookup_type, limit: "100" });
      if (query) params.set("search", query);
      if (includeCurrent) params.set("include_ids", includeCurrent);
      url = `/api/lookups?${params}`;
    } else {
      const params = new URLSearchParams({ table: config.target_table, label: config.target_label_field, limit: "100" });
      if (query) params.set("search", query);
      if (config.target_search_fields?.length) params.set("search_in", config.target_search_fields.join(","));
      if (config.secondary_label_field) params.set("secondary", config.secondary_label_field);
      if (activeFilter) { params.set("filter_col", activeFilter.column); params.set("filter_val", activeFilter.value); }
      if (includeCurrent) params.set("include_ids", includeCurrent);
      url = `/api/admin/picker?${params}`;
    }
    // cache hit → แสดงทันที (ไม่ยิง worker)
    const hit = PICKER_CACHE.get(url);
    if (hit && Date.now() - hit.at < PICKER_TTL) { setOptions(hit.opts); return; }
    setLoading(true);
    try {
      const res = await apiFetch(url);
      const json = await res.json();
      const opts: PickerOption[] = config.lookup_type
        ? ((json.data ?? []) as Array<{ id: string; name: string; code: string | null; is_active: boolean }>).map((r) => ({ id: r.id, label: r.name, secondary: r.code ?? undefined, active: r.is_active }))
        : ((json.data ?? []) as PickerOption[]);
      PICKER_CACHE.set(url, { at: Date.now(), opts });
      if (PICKER_CACHE.size > 300) { const now = Date.now(); for (const [k, v] of PICKER_CACHE) if (now - v.at > PICKER_TTL) PICKER_CACHE.delete(k); }
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
    const pin = pinnedOptions.find((p) => p.id === value);
    if (pin) { setCurrent(pin); return; }   // token พิเศษ (ค่าส่ง/VAT) — ไม่ต้อง fetch DB
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

  // ---- click outside (เฉพาะ desktop dropdown — มือถือเต็มจอใช้ backdrop ปิด) ----
  useEffect(() => {
    if (!open || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, isMobile]);

  // ---- #A: ล็อก scroll พื้นหลังตอนเปิด popup (มือถือ) — กัน scroll ทะลุไปพื้นหลัง ----
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => { document.body.style.overflow = prevOverflow; document.body.style.touchAction = prevTouch; };
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
  const [showCreate, setShowCreate] = useState<string | null>(null);  // เปิดฟอร์มเต็ม (popup) สร้างใหม่
  const [showEdit, setShowEdit] = useState<string | null>(null);      // เปิดฟอร์มแก้ไขเรคคอร์ดที่เลือก (id)

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

  // เนื้อหา dropdown (search + รายการ) ใช้ร่วมทั้งมือถือ(เต็มจอ) และ desktop
  const panelBody = (
    <>
      {/* search */}
      <div className="p-2 border-b border-slate-100 flex-shrink-0">
        <input ref={inputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา..."
          className="w-full h-11 sm:h-8 px-3 sm:px-2 text-base sm:text-sm border border-slate-200 rounded-lg sm:rounded outline-none focus:border-orange-400" />
      </div>
      {/* options */}
      <div className="overflow-y-auto flex-1 sm:max-h-64 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* ตัวเลือกพิเศษปักบนสุด (เด่น/คนละสี) เช่น ค่าส่ง / VAT */}
        {pinnedOptions.map((opt) => (
          <button key={opt.id} type="button" onClick={() => select(opt)}
            className={`w-full px-3 py-2.5 text-left text-sm font-semibold border-b border-slate-100 hover:bg-slate-50 ${opt.accentClass ?? "text-slate-800"} ${value === opt.id ? "bg-slate-50" : ""}`}>
            {opt.label}
          </button>
        ))}
        {loading ? (
          <div className="px-3 py-4 text-xs text-slate-400 text-center">กำลังโหลด...</div>
        ) : (
          <>
            {value && (
              <button type="button" onClick={() => select(null)} className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 border-b border-slate-100">✕ ล้างค่า</button>
            )}
            {options.length === 0 && !canCreate && (<div className="px-3 py-4 text-xs text-slate-400 text-center">ไม่พบ</div>)}
            {options.map((opt) => (
              <div key={opt.id} className={`flex items-stretch ${value === opt.id ? "bg-orange-50" : ""}`}>
                <button type="button" onClick={() => select(opt)}
                  className={`flex-1 min-w-0 px-3 py-2 text-left text-sm hover:bg-orange-50 ${value === opt.id ? "font-medium" : ""} ${opt.active === false ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-800 truncate">{opt.label}</span>
                    {opt.active === false && (<span className="text-[10px] text-slate-400 flex-shrink-0">ปิดอยู่</span>)}
                  </div>
                  {opt.secondary && (<div className="text-xs text-slate-500 truncate">{opt.secondary}</div>)}
                </button>
                {config.target_module_key && (
                  <button type="button" title="แก้ไข" onClick={(e) => { e.stopPropagation(); setOpen(false); setShowEdit(opt.id); }}
                    className="flex-shrink-0 px-3 flex items-center text-slate-400 hover:text-blue-600 hover:bg-blue-50">✎</button>
                )}
              </div>
            ))}
            {canCreate && search.trim() && !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase()) && (
              <div className="border-t border-slate-100">
                <button type="button" onClick={() => { if (config.target_module_key) { setOpen(false); setShowCreate(search.trim()); } else void quickCreate(search); }}
                  disabled={creating} className="w-full px-3 py-2.5 text-left text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-2">
                  <span className="text-base">＋</span>
                  <span>{creating ? "กำลังสร้าง..." : <>สร้างใหม่: <strong>&ldquo;{search.trim()}&rdquo;</strong></>}</span>
                </button>
                {createErr && (<div className="px-3 py-1.5 text-[11px] text-red-600 bg-red-50 border-t border-red-100">⚠ {createErr}</div>)}
              </div>
            )}
          </>
        )}
      </div>
      {/* เพิ่มใหม่ (ฟอร์มเต็มของ module จริง เช่น partner) */}
      {config.target_module_key && (
        <div className="flex-shrink-0 border-t border-slate-100 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => { setOpen(false); setShowCreate(search.trim() || ""); }}
            className="w-full h-11 sm:h-9 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-emerald-700">
            <span className="text-base">＋</span> เพิ่มใหม่
          </button>
        </div>
      )}
    </>
  );

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
            <span className={pinned ? `font-semibold ${pinned.accentClass ?? "text-slate-800"}` : "text-slate-800"}>{current.label}</span>
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

      {open && (mounted && isMobile
        ? createPortal(
            // มือถือ: เต็มจอ ลอยทับ header/footer (Portal ออกนอกกรอบ) + ปุ่ม × ขวาบน
            <div className="fixed inset-0 z-[9999] bg-black/50 flex flex-col" onClick={() => setOpen(false)}>
              <div className="bg-white flex flex-col h-full w-full" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
                  <span className="font-semibold text-slate-800">เลือกรายการ</span>
                  <button type="button" onClick={() => setOpen(false)} className="w-9 h-9 rounded-full text-slate-500 hover:bg-slate-100 text-2xl leading-none">×</button>
                </div>
                {panelBody}
              </div>
            </div>,
            document.body
          )
        : (
            // desktop: dropdown ลอยใต้ช่อง
            <div className="absolute left-0 right-0 top-full mt-1 max-h-80 z-50 bg-white rounded-lg border border-slate-200 shadow-lg flex flex-col overflow-hidden">
              {panelBody}
            </div>
          )
      )}

      {/* ฟอร์มสร้างใหม่เต็ม (popup) — เมื่อ relation ชี้ไป module จริง */}
      {showCreate !== null && config.target_module_key && (
        <RecordFormModal
          moduleKey={config.target_module_key}
          title="เพิ่มรายการใหม่"
          presetLabelField={config.target_label_field}
          presetValue={showCreate}
          onClose={() => setShowCreate(null)}
          onSaved={(id, label) => { setShowCreate(null); select({ id, label }); }}
        />
      )}

      {/* ฟอร์มแก้ไขเรคคอร์ดที่เลือก (✎) — ฟอร์มชุดเดียวกับ partner */}
      {showEdit !== null && config.target_module_key && (
        <RecordFormModal
          moduleKey={config.target_module_key}
          title="แก้ไขข้อมูล"
          editId={showEdit}
          onClose={() => setShowEdit(null)}
          onSaved={(id, label) => {
            setShowEdit(null);
            // ถ้าแก้ตัวที่เลือกอยู่ → อัปเดต label ที่โชว์
            if (value === id) setCurrent({ id, label });
            // โหลดรายการใหม่ให้ป้ายอัปเดต
            if (open) loadOptions(search, value);
          }}
        />
      )}
    </div>
  );
}
