"use client";

// ============================================================
// SkuWizard — Wizard เพิ่ม SKU (กันส่งผิด/มั่ว/พลาด) สำหรับหน้า /master/skus
// Step 1: เลือก "เพิ่มเป็นชุด" หรือ "เพิ่มเดี่ยว"
//  - เดี่ยว: เลือกประเภท(แท็ก) → ระบบเสนอรหัสถัดไป (code-suggest) + ฟอร์มมี guide
//  - ชุด: ตาราง inline + เติมลงล่าง (flash fill) · "คอลัมน์เลือกได้" จากทะเบียน field กลาง (ไม่ hardcode)
// ของกลาง: ERPModal · useToast · apiFetch → POST /api/skus/wizard-create
// ============================================================

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ERPModal } from "@/components/modal";
import { SupplierWizard } from "@/components/supplier-wizard";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { SkuPrefixManager } from "@/components/sku-prefix-manager";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { TagColumns, type TagColGroup } from "@/components/tag-columns";
import type { NewItemTagSuggestion } from "@/lib/tag-suggest-rules";

// ป้ายชื่อคอลัมน์ที่ override จากทะเบียน (ให้ตรงภาษาคน) — ใช้ทั้งเดี่ยว/ชุด
const LABEL_OVERRIDE: Record<string, string> = {
  get standard_price() { return tr("ราคาซื้อ", "Purchase price"); }, get rmb_cost() { return tr("ราคาซื้อ (หยวน) RMB", "Purchase price (RMB)"); }, get fabric_width_cm() { return tr("หน้ากว้าง", "Fabric width"); },
};

// แยกรหัสเป็น prefix + เลขท้าย (เช่น "LEA-SAF-028" → {prefix:"LEA-SAF-", num:28, pad:3})
type CodeBase = { prefix: string; num: number; pad: number };
const splitCode = (code: string): CodeBase => {
  const m = code.match(/^(.*?)(\d+)$/);
  return m ? { prefix: m[1], num: parseInt(m[2], 10), pad: m[2].length } : { prefix: code, num: 0, pad: 0 };
};
const codeAt = (b: CodeBase, n: number) => (b.pad > 0 ? b.prefix + String(n).padStart(b.pad, "0") : "");

// แม่แบบชื่อ: [สี] = ช่องสี · [รหัส] = เลขหลัง # (หรือเลขท้ายรหัส)
const PLACEHOLDER_RE = /\[สี\]|\[รหัส\]/;
const applyNameTemplate = (tpl: string, color: string, code: string): string => {
  const codeNum = code.includes("#") ? (code.split("#").pop() ?? "") : (code.match(/(\d+)$/)?.[1] ?? "");
  let out = tpl;
  if (color.trim()) out = out.replace(/\[สี\]/g, color.trim());
  if (codeNum) out = out.replace(/\[รหัส\]/g, codeNum);
  return out;
};
// ตัด placeholder ออกให้เหลือชื่อสะอาดไว้โชว์ (เช่น "ผ้าไนล่อนสี[สี] #[รหัส]" → "ผ้าไนล่อน")
const cleanNameLabel = (tpl: string): string =>
  (tpl || "")
    .replace(/\s*สี\s*\[สี\]/g, "")   // "สี[สี]" (มีคำว่า สี นำ) → ตัดทั้งก้อน
    .replace(/\s*#\s*\[รหัส\]/g, "")  // " #[รหัส]" → ตัดทั้งก้อน
    .replace(/\[สี\]/g, "").replace(/\[รหัส\]/g, "")
    .replace(/\s+/g, " ").trim();
type TagCtx = { fabric_widths: number[]; sellers: { id: string; name: string | null; count: number }[] };

type PickerOpt = { id: string; label: string; secondary?: string };
type PrefixDefault = { name?: string; uom_id?: string | null; uom_label?: string };
type TagOpt = { id: string; name: string; code_prefix: string; group_name: string | null; group_id?: string | null; default_name?: string; default_uom_id?: string | null; default_uom_label?: string; prefix_defaults?: Record<string, PrefixDefault> };
type Suggest = { prefix: string; this_latest: string | null; this_suggested: string | null; group_latest: string | null; group_name: string | null; error?: string };
type TagCode = { prefix: string; latest_code: string; suggested: string; count: number;
  latest_name?: string; latest_seller_id?: string | null; latest_seller_name?: string;
  latest_standard_price?: number | null; latest_rmb_cost?: number | null; latest_fabric_width?: number | null };

// คอลัมน์จากทะเบียน field (ไม่ hardcode)
type ColDef = { key: string; label: string; type: "text" | "number" | "boolean" | "relation"; rel?: { table: string; label: string; secondary?: string } };
// คอลัมน์ default ที่โชว์ตอนเริ่ม (ตามที่ใช้บ่อย)
const DEFAULT_COLS = ["code", "name_th", "uom_id", "seller_partner_id", "standard_price", "rmb_cost", "fabric_width_cm", "color"];
const COLS_LS = "sku-wizard-batch-cols";
// field ที่ข้าม (ระบบ/ไม่เหมาะกรอกในตาราง)
const SKIP_COLS = new Set(["id", "is_active", "sale_ok", "purchase_ok", "created_at", "updated_at", "attribute_values", "cover_image_r2_key", "odoo_form_details", "odoo_form_synced_at"]);

// ---- ตัวเลือกแบบค้นหา (async) จาก picker กลาง ----
function AsyncPick({ table, label, secondary, value, valueLabel, onChange, placeholder, pinned, onAddNew, addNewLabel, quickCreate }: {
  table: string; label: string; secondary?: string;
  value: string | null; valueLabel?: string; onChange: (id: string | null, lbl: string) => void; placeholder: string;
  pinned?: { id: string; label: string }[];   // รายการ "ใช้บ่อย" ปักหมุดบนสุด (⭐)
  /** มี = โชว์ปุ่ม "+ เพิ่มใหม่" ท้ายรายการ (ส่งคำที่พิมพ์ค้างไว้ไปให้ ไม่ต้องพิมพ์ซ้ำ) */
  onAddNew?: (typedName: string) => void;
  addNewLabel?: string;
  /** สร้างรายการใหม่ "ในกล่องนี้เลย" จากคำที่พิมพ์ (สำหรับ master เล็ก ๆ เช่น หน่วยนับ) — คืน id+ชื่อ แล้วเลือกให้ทันที */
  quickCreate?: { entity: string; field: string; label?: string };
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<PickerOpt[]>([]);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  // ยิงสร้างผ่าน API master กลาง (/api/master-v2/<entity> — ตรวจสิทธิ์ products.create + ฟิลด์บังคับ + audit ให้เอง)
  const doQuickCreate = async () => {
    const name = q.trim(); if (!quickCreate || !name || creating) return;
    setCreating(true); setCreateErr(null);
    try {
      const res = await apiFetch(`/api/master-v2/${quickCreate.entity}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [quickCreate.field]: name }) });
      const j = await res.json();
      if (!res.ok || j.error) { setCreateErr(String(j.error ?? t("สร้างไม่สำเร็จ", "Couldn't create"))); return; }
      const row = (j.data ?? {}) as Record<string, unknown>;
      onChange(String(row.id), String(row[quickCreate.field] ?? name));
      setOpen(false); setQ("");
    } catch (e) { setCreateErr(String((e as Error).message ?? e)); }
    finally { setCreating(false); }
  };
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ table, label, limit: "20" });
      if (secondary) p.set("secondary", secondary);
      if (q) p.set("search", q);
      apiFetch(`/api/admin/picker?${p}`).then((r) => r.json()).then((j) => { if (alive) setOpts((j.data ?? []) as PickerOpt[]); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [open, q, table, label, secondary]);
  // ปิดเมื่อกดนอกกล่อง (click-outside ที่เชื่อถือได้กว่าฉากหลัง) + กด Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full h-8 px-2 text-left text-sm border border-transparent hover:border-slate-200 rounded bg-white truncate">
        {value ? (valueLabel || "—") : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหา...", "Search...")}
              className="w-full h-8 px-2 text-sm border-b border-slate-100 focus:outline-none" />
            <div className="max-h-56 overflow-y-auto py-1">
              {value && <button type="button" onClick={() => { onChange(null, ""); setOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs text-rose-500 hover:bg-rose-50">✕ {t("ล้าง", "Clear")}</button>}
              {/* ⭐ ใช้บ่อยในประเภทนี้ — ปักหมุดบนสุด */}
              {(() => {
                const s = q.trim().toLowerCase();
                const pf = (pinned ?? []).filter((p) => !s || p.label.toLowerCase().includes(s));
                if (pf.length === 0) return null;
                return (
                  <>
                    <div className="px-3 pt-1 pb-0.5 text-[10px] text-amber-600">⭐ {t("ใช้บ่อยในประเภทนี้", "Often used in this type")}</div>
                    {pf.map((p) => (
                      <button key={"pin-" + p.id} type="button" onClick={() => { onChange(p.id, p.label); setOpen(false); setQ(""); }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-amber-50 truncate flex items-center gap-1">
                        <span className="text-amber-500 shrink-0">⭐</span><span className="truncate">{p.label}</span>
                      </button>
                    ))}
                    <div className="border-t border-slate-100 my-1" />
                  </>
                );
              })()}
              {opts.filter((o) => !(pinned ?? []).some((p) => p.id === o.id)).map((o) => (
                <button key={o.id} type="button" onClick={() => { onChange(o.id, o.label); setOpen(false); setQ(""); }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 truncate">
                  {o.label}{o.secondary ? <span className="text-slate-400"> · {o.secondary}</span> : null}
                </button>
              ))}
              {opts.length === 0 && (pinned ?? []).length === 0 && <div className="px-3 py-2 text-xs text-slate-400">{t("— ไม่พบ —", "— Not found —")}</div>}
              {/* สร้างใหม่ในกล่องนี้เลย — โชว์เมื่อพิมพ์คำที่ยังไม่มีในรายการ (ชื่อตรงกันเป๊ะ = ไม่ต้องสร้างซ้ำ) */}
              {quickCreate && q.trim() && !opts.some((o) => o.label.trim().toLowerCase() === q.trim().toLowerCase()) && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <button type="button" disabled={creating} onClick={() => { void doQuickCreate(); }}
                    className="w-full px-3 py-1.5 text-left text-sm text-emerald-700 hover:bg-emerald-50 truncate disabled:opacity-60">
                    {creating ? t("กำลังสร้าง...", "Creating...") : <>➕ {quickCreate.label ?? t("สร้างใหม่", "Create new")}: <strong>“{q.trim()}”</strong></>}
                  </button>
                  {createErr && <div className="px-3 py-1.5 text-[11px] text-red-600 bg-red-50 border-t border-red-100">⚠ {createErr}</div>}
                </>
              )}
              {/* เพิ่มรายการใหม่ได้จากตรงนี้เลย — เปิดวิซาร์ดของกลาง (ไม่ต้องออกไปหน้าอื่นแล้วกลับมากรอกใหม่) */}
              {onAddNew && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <button type="button" onClick={() => { const t = q.trim(); setOpen(false); setQ(""); onAddNew(t); }}
                    className="w-full px-3 py-1.5 text-left text-sm text-blue-600 hover:bg-blue-50 truncate">
                    ➕ {addNewLabel ?? t("เพิ่มใหม่", "Add new")}{q.trim() ? ` “${q.trim()}”` : ""}
                  </button>
                </>
              )}
            </div>
        </div>
      )}
    </div>
  );
}

// แถวข้อมูล: values (คอลัมน์→ค่า) + labels (สำหรับ relation โชว์ชื่อ)
type Row = { values: Record<string, unknown>; labels: Record<string, string> };
const blankRow = (): Row => ({ values: {}, labels: {} });

/** ผลลัพธ์หลังสร้างเสร็จ — ส่งกลับให้ผู้เรียกใช้ต่อได้ (เช่น กล่องพัก Taobao ใช้ผูก id ที่เพิ่งสร้าง) */
export type SkuWizardResult = { created: number; ids: string[]; skus: { id: string; code: string }[] };

/** ข้อมูลจากการ์ด Taobao — มี = ป๊อปเข้าโหมด Taobao (สี/ผู้ขาย Taobao/ราคาหยวน×เรต) · ไม่มี = ฟอร์มปกติ ไม่มีส่วน Taobao */
export type SkuWizardTaobao = { colors?: string[]; tagIds?: string[] };

export function SkuWizard({ open, onClose, onCreated, prefill, taobao }: {
  open: boolean;
  onClose: () => void;
  onCreated: (result?: SkuWizardResult) => void;
  /** ค่าเริ่มต้นของฟอร์ม "เพิ่มทีละตัว" (เช่น name_th / rmb_cost / purchase_link) — มีค่า = ข้ามหน้าเลือกโหมด ไปโหมดเดี่ยวเลย */
  prefill?: Record<string, unknown>;
  taobao?: SkuWizardTaobao;
}) {
  const t = useT();
  const toast = useToast();
  // key เสถียรของ prefill (ผู้เรียกส่ง object ใหม่ทุก render) — กัน effect ด้านล่างรันซ้ำไม่รู้จบ
  const prefillKey = useMemo(() => (prefill ? JSON.stringify(prefill) : ""), [prefill]);
  const isTaobao = !!taobao;
  const taobaoKey = useMemo(() => (taobao ? JSON.stringify(taobao) : ""), [taobao]);
  const [step, setStep] = useState<"choose" | "single" | "batch">("choose");
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [tagGroups, setTagGroups] = useState<TagColGroup[]>([]);   // กลุ่มแท็ก → ตัวเลือกแบบหมวดซ้าย·แท็กขวา (TagColumns)
  const [catalog, setCatalog] = useState<ColDef[]>([]);
  const [prefixMgr, setPrefixMgr] = useState(false);   // ป๊อปจัดการรหัสนำหน้า
  const [saving, setSaving] = useState(false);
  const [rmbRate, setRmbRate] = useState(5.2);         // เรตหยวน→บาท (ui_config rmb_to_thb_rate, default 5.2)
  // "เพิ่มผู้ขายใหม่" จากในฟอร์มนี้เลย — ใช้วิซาร์ดคู่ค้าของกลาง แล้วเติมค่าที่เพิ่งสร้างกลับให้ช่องที่กดมา
  const [newSupplier, setNewSupplier] = useState<{ name: string; apply: (id: string, label: string) => void } | null>(null);

  // โหลดเรตหยวน→บาท ตอนเปิด
  useEffect(() => {
    if (!open) return;
    apiFetch("/api/ui-config?key=rmb_to_thb_rate").then((r) => r.json())
      .then((j) => { const rr = Number((j.value ?? {}).rate); if (Number.isFinite(rr) && rr > 0) setRmbRate(rr); }).catch(() => {});
  }, [open]);

  // ตัวเลือกประเภท (แท็ก) สำหรับ SearchableSelect
  const tagOptions = useMemo<SelectOption[]>(() => tags.map((t) => ({
    value: t.id, label: t.name,
    sub: `${t.group_name ? t.group_name + " · " : ""}${t.code_prefix ? t.code_prefix : tr("ยังไม่ตั้งรหัส", "No code prefix yet")}`,
  })), [tags]);

  // context ของประเภท (หน้ากว้าง/ผู้ขายที่ใช้บ่อย) — ใช้ทั้งเดี่ยว/ชุด
  const [ctx, setCtx] = useState<TagCtx>({ fabric_widths: [], sellers: [] });
  const loadContext = useCallback((tagId: string) => {
    apiFetch(`/api/skus/tag-context?family_tag_id=${tagId}`).then((r) => r.json())
      .then((j) => setCtx({ fabric_widths: j.fabric_widths ?? [], sellers: j.sellers ?? [] }))
      .catch(() => setCtx({ fabric_widths: [], sellers: [] }));
  }, []);
  const sellerPins = useMemo(() => ctx.sellers.map((s) => ({ id: s.id, label: s.name ?? tr("(ไม่มีชื่อ)", "(no name)") })), [ctx.sellers]);

  // โหลดประเภท(แท็ก) ทั้งหมด (รวมที่ยังไม่ตั้ง prefix) — ใช้ tag-prefix
  const loadTags = useCallback(() => {
    apiFetch("/api/skus/tag-prefix").then((r) => r.json()).then((j) => setTags((j.data ?? []) as TagOpt[])).catch(() => {});
    apiFetch("/api/master-v2/product_family_groups?limit=500").then((r) => r.json()).then((j) => setTagGroups(((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
      id: String(g.id), name: String(g.name ?? ""), parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
      single_select: g.single_select === true, sort_order: g.sort_order != null ? Number(g.sort_order) : null,
    })))).catch(() => {});
  }, []);

  // โหลดประเภท + คอลัมน์จากทะเบียน field
  useEffect(() => {
    if (!open) return;
    setStep(prefillKey ? "single" : "choose");   // มีค่าตั้งต้นมา (เช่นจากกล่องพัก Taobao) → เข้าโหมดเดี่ยวเลย
    loadTags();
    apiFetch("/api/admin/field-registry-v2?module=skus-v2").then((r) => r.json()).then((j) => {
      const cols: ColDef[] = ((j.fields ?? []) as Record<string, unknown>[]).flatMap((f): ColDef[] => {
        const key = f.column_name as string | null;
        if (!key || !f.is_editable || SKIP_COLS.has(key)) return [];
        const t = f.ui_field_type as string;
        const labelTh = (f.field_label as string) || key;
        const label = tr(labelTh, (f.field_label_en as string) || labelTh);   // ไม่มีชื่ออังกฤษ = ใช้ไทย
        if (t === "relation") {
          const rc = (f.relation_config ?? {}) as Record<string, string>;
          if (!rc.target_table) return [];
          return [{ key, label, type: "relation", rel: { table: rc.target_table, label: rc.target_label_field || "name", secondary: rc.secondary_label_field } }];
        }
        if (t === "number") return [{ key, label, type: "number" }];
        if (t === "boolean") return [{ key, label, type: "boolean" }];
        if (t === "text") return [{ key, label, type: "text" }];
        return [];   // ข้าม json/image/date/related/many2many/one2many
      });
      setCatalog(cols);
    }).catch(() => {});
  }, [open, loadTags, prefillKey]);

  // คอลัมน์ที่เลือกโชว์ (จำใน localStorage, เริ่มต้น = DEFAULT_COLS)
  const [colKeys, setColKeys] = useState<string[]>(DEFAULT_COLS);
  useEffect(() => {
    try { const s = localStorage.getItem(COLS_LS); if (s) setColKeys(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  const saveColKeys = (keys: string[]) => { const k = keys.includes("code") ? keys : ["code", ...keys]; setColKeys(k); try { localStorage.setItem(COLS_LS, JSON.stringify(k)); } catch { /* ignore */ } };
  // คอลัมน์ที่จะ render จริง (ตามลำดับ catalog, code มาก่อนเสมอ)
  const shownCols = useMemo(() => {
    const map = new Map(catalog.map((c) => [c.key, c]));
    const code = map.get("code") ?? { key: "code", label: tr("รหัส SKU", "SKU code"), type: "text" as const };
    const rest = colKeys.filter((k) => k !== "code" && map.has(k)).map((k) => map.get(k)!);
    return [code, ...rest];
  }, [catalog, colKeys]);

  // ---------- โหมดเดี่ยว ----------
  const [sTag, setSTag] = useState<string | null>(null);
  const [sug, setSug] = useState<Suggest | null>(null);
  const [tagCodes, setTagCodes] = useState<TagCode[]>([]);   // ทุกตระกูลรหัสที่ใช้กับแท็กนี้ (tooltip)
  const [single, setSingle] = useState<Row>(blankRow());
  // ราคาซื้อมาจาก "หยวน × เรต" (ยังไม่ได้แก้มือ) → ป้าย "ราคาคร่าว ๆ" + บันทึก standard_price_is_estimate · แก้ราคาเอง = ราคาจริง
  const [priceEst, setPriceEst] = useState(false);
  const autoUomRef = useRef<string | null>(null);    // หน่วยที่ระบบใส่ให้ตามประเภท (เปลี่ยนประเภท = เปลี่ยนตาม · เลือกเองแล้วไม่ทับ)
  const autoCodeRef = useRef<string | null>(null);   // รหัสที่ระบบเสนอให้ (เปลี่ยนประเภท = เสนอใหม่ · พิมพ์เองแล้วไม่ทับ)
  const [tagErr, setTagErr] = useState(false);
  // เติมค่าตั้งต้นจากผู้เรียก (เช่นกล่องพัก Taobao ส่งชื่อไทย/ราคาหยวน/ลิงก์มาให้) — ตอนเปิดป๊อป
  useEffect(() => {
    if (!open || !prefillKey) return;
    const values = JSON.parse(prefillKey) as Record<string, unknown>;
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    setSingle({ values: clean, labels: {} });
    // มาจาก Taobao + มีราคาหยวน + ยังไม่มีราคาบาท → คำนวณให้ (effect ด้านล่าง) และติดป้ายราคาคร่าว ๆ
    setPriceEst(isTaobao && clean.rmb_cost != null && clean.standard_price == null);
  }, [open, prefillKey, isTaobao]);
  // ราคาคร่าว ๆ = หยวน × เรต — คำนวณใหม่เมื่อหยวน/เรตเปลี่ยน (เฉพาะตอนยังไม่ได้แก้ราคาเอง)
  const rmbNow = String(single.values.rmb_cost ?? "");
  useEffect(() => {
    if (!priceEst) return;
    const n = Number(rmbNow);
    if (rmbNow.trim() === "" || !Number.isFinite(n) || rmbRate <= 0) return;
    const price = String(Math.round(n * rmbRate * 100) / 100);
    setSingle((s) => (s.values.standard_price === price ? s : { ...s, values: { ...s.values, standard_price: price } }));
  }, [priceEst, rmbNow, rmbRate]);
  const setSV = (k: string, v: unknown, lbl?: string) => setSingle((s) => ({ values: { ...s.values, [k]: v }, labels: lbl !== undefined ? { ...s.labels, [k]: lbl } : s.labels }));
  // กรอกราคาซื้อหยวน (rmb_cost) → ราคาซื้อ (standard_price) = หยวน × เรต อัตโนมัติ (ติดป้ายราคาคร่าว ๆ · แก้ทับเองได้)
  const onRmbChange = (v: string) => { setSV("rmb_cost", v); if (v.trim() !== "") setPriceEst(true); };
  // บันทึกเรต (global) — ราคาคร่าว ๆ คำนวณใหม่เองผ่าน effect
  const saveRate = async () => {
    try { await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "rmb_to_thb_rate", value: { rate: rmbRate } }) }); } catch { /* ไม่ขัดจังหวะผู้ใช้ */ }
  };
  // ใส่หน่วยตามประเภท — ทับได้เฉพาะตอนช่องว่าง หรือหน่วยเดิมระบบใส่ให้เอง (ไม่ทับที่ผู้ใช้เลือกเอง)
  const applyAutoUom = (values: Record<string, unknown>, labels: Record<string, string>, uomId: string | null | undefined, uomLabel: string) => {
    const mine = !values.uom_id || values.uom_id === autoUomRef.current;
    if (!mine) return;
    if (uomId) { values.uom_id = uomId; labels.uom_id = uomLabel; autoUomRef.current = uomId; }
    else if (autoUomRef.current) { delete values.uom_id; delete labels.uom_id; autoUomRef.current = null; }
  };
  // เติมชื่อ/หน่วย default ของประเภทให้อัตโนมัติ (ชื่อ: เฉพาะช่องที่ยังว่าง — ไม่ทับที่พิมพ์ไว้)
  const prefillFromTag = (tagId: string) => {
    const t = tags.find((x) => x.id === tagId); if (!t) return;
    setSingle((s) => {
      const values = { ...s.values }; const labels = { ...s.labels };
      if (t.default_name && !String(values.name_th ?? "").trim()) values.name_th = t.default_name;
      applyAutoUom(values, labels, t.default_uom_id, t.default_uom_label || "");
      return { values, labels };
    });
  };
  // เดี่ยว: คลิกเลือกตระกูลรหัส → ตั้งรหัส + เติมชื่อ/หน่วย(default) + ผู้ขาย/ราคา/หน้ากว้าง (จาก SKU ตัวล่าสุดในตระกูล)
  const selectCodeFamily = (c: TagCode) => {
    const t = sTag ? tags.find((x) => x.id === sTag) : null;
    const pd = t?.prefix_defaults?.[c.prefix];
    const name = pd?.name || t?.default_name || "";
    const uomId = pd?.uom_id || t?.default_uom_id || null;
    const uomLabel = pd?.uom_id ? (pd?.uom_label || "") : (t?.default_uom_label || "");
    setSingle((s) => {
      const values = { ...s.values }; const labels = { ...s.labels };
      values.code = c.suggested; autoCodeRef.current = c.suggested;
      if (name && !String(values.name_th ?? "").trim()) values.name_th = name;
      if (uomId) applyAutoUom(values, labels, uomId, uomLabel);
      // C: ดึงค่าจาก SKU ตัวก่อนหน้า (ล่าสุดในตระกูล) — เฉพาะช่องที่ยังว่าง
      if (c.latest_seller_id && !values.seller_partner_id) { values.seller_partner_id = c.latest_seller_id; labels.seller_partner_id = c.latest_seller_name || ""; }
      if (c.latest_standard_price != null && !String(values.standard_price ?? "").trim()) values.standard_price = String(c.latest_standard_price);
      if (c.latest_rmb_cost != null && !String(values.rmb_cost ?? "").trim()) values.rmb_cost = String(c.latest_rmb_cost);
      if (c.latest_fabric_width != null && !String(values.fabric_width_cm ?? "").trim()) values.fabric_width_cm = String(c.latest_fabric_width);
      return { values, labels };
    });
  };
  const loadSuggest = useCallback((tagId: string) => {
    apiFetch(`/api/skus/code-suggest?family_tag_id=${tagId}`).then((r) => r.json()).then((j) => {
      setSug(j as Suggest);
      // เสนอรหัสใหม่ — ทับได้เฉพาะช่องว่าง หรือรหัสเดิมที่ระบบเสนอเอง (พิมพ์เองแล้วไม่ทับ)
      if (j.this_suggested) setSingle((s) => (s.values.code && s.values.code !== autoCodeRef.current ? s : (autoCodeRef.current = j.this_suggested, { ...s, values: { ...s.values, code: j.this_suggested } })));
    }).catch(() => {});
    // ดึงทุกตระกูลรหัสจริงที่ผูกแท็กนี้ (สำหรับ tooltip)
    setTagCodes([]);
    apiFetch(`/api/skus/tag-codes?family_tag_id=${tagId}`).then((r) => r.json()).then((j) => setTagCodes((j.prefixes ?? []) as TagCode[])).catch(() => {});
  }, []);

  // เลือกประเภท (เดี่ยว) — ใช้ร่วม: ตัวเลือกหมวดซ้าย·แท็กขวา + ชิปแนะนำ
  const pickSingleTag = (nv: string | null) => {
    setSTag(nv); setTagErr(false); setTagPanel(false);
    if (nv) { loadSuggest(nv); prefillFromTag(nv); loadContext(nv); } else { setSug(null); setTagCodes([]); setCtx({ fabric_widths: [], sellers: [] }); }
  };
  const [tagPanel, setTagPanel] = useState(false);   // เปิดตัวเลือกประเภท (หมวดซ้าย·แท็กขวา)
  const [tagQ, setTagQ] = useState("");
  const tagColTags = useMemo(() => tags.map((x) => ({ id: x.id, label: x.name, group_id: x.group_id ?? null })), [tags]);
  const tagPath = (id: string | null) => {
    const x = id ? tags.find((y) => y.id === id) : undefined; if (!x) return "";
    const g = x.group_id ? tagGroups.find((y) => y.id === x.group_id) : undefined;
    const pg = g?.parent_group_id ? tagGroups.find((y) => y.id === g.parent_group_id) : undefined;
    return [pg?.name, g?.name, x.name].filter(Boolean).join(" › ");
  };

  // 💡 ชิปแนะนำประเภท: แท็กที่ติดไว้บนการ์ด Taobao (แน่นอน) + ตัวเดาแท็กจากชื่อ/รหัส (กฎกลาง lib/tag-suggest-rules)
  const [nameSug, setNameSug] = useState<NewItemTagSuggestion[]>([]);
  const sugName = String(single.values.name_th ?? ""), sugCode = String(single.values.code ?? "");
  useEffect(() => {
    if (!open || step !== "single" || (!sugName.trim() && !sugCode.trim())) { setNameSug([]); return; }
    let alive = true;
    const tm = setTimeout(() => {
      apiFetch(`/api/product-tags/suggest/new?${new URLSearchParams({ name: sugName, code: sugCode })}`).then((r) => r.json())
        .then((j) => { if (alive) setNameSug((j.data ?? []) as NewItemTagSuggestion[]); }).catch(() => {});
    }, 600);
    return () => { alive = false; clearTimeout(tm); };
  }, [open, step, sugName, sugCode]);
  const tagChips = useMemo(() => {
    const out: { id: string; name: string; why: string }[] = [];
    const seen = new Set<string>();
    for (const id of taobao?.tagIds ?? []) { const x = tags.find((y) => y.id === id); if (x && !seen.has(id)) { seen.add(id); out.push({ id, name: x.name, why: tr("ติดไว้บนการ์ด Taobao", "Tagged on the Taobao card") }); } }
    for (const s of nameSug) if (!seen.has(s.tagId) && tags.some((y) => y.id === s.tagId)) { seen.add(s.tagId); out.push({ id: s.tagId, name: s.name, why: s.reason }); }
    return out.filter((x) => x.id !== sTag).slice(0, 8);
  }, [taobao?.tagIds, nameSug, tags, sTag]);

  // 🛒 โหมด Taobao: ผู้ขาย = Taobao ให้เอง (ค้นจากทะเบียนคู่ค้า · เปลี่ยนเองได้)
  useEffect(() => {
    if (!open || !isTaobao) return;
    apiFetch(`/api/admin/picker?table=partners_v2&label=name_th&search=Taobao&limit=10`).then((r) => r.json()).then((j) => {
      const hit = ((j.data ?? []) as PickerOpt[]).find((p) => p.label.trim().toLowerCase() === "taobao");
      if (hit) setSingle((s) => (s.values.seller_partner_id ? s : { values: { ...s.values, seller_partner_id: hit.id }, labels: { ...s.labels, seller_partner_id: hit.label } }));
    }).catch(() => {});
  }, [open, isTaobao, prefillKey]);

  // 🎨 สีจาก Taobao — ติ๊กได้หลายสี: 1 สี = กรอกช่องสี · หลายสี = สร้างหลาย SKU (1 สี = 1 SKU รหัสรันต่อกัน)
  const [extraColors, setExtraColors] = useState<string[]>([]);
  const [colorPicks, setColorPicks] = useState<string[]>([]);
  const [colorDraft, setColorDraft] = useState("");
  const taobaoColors = useMemo(() => {
    const list = [...(taobao?.colors ?? []), ...extraColors].map((c) => c.trim()).filter(Boolean);
    return [...new Set(list)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taobaoKey, extraColors]);
  const setPicks = (next: string[]) => { setColorPicks(next); setSV("color", next.length === 1 ? next[0] : next.length === 0 ? "" : next.join(", ")); };
  const togglePick = (c: string) => setPicks(colorPicks.includes(c) ? colorPicks.filter((x) => x !== c) : [...colorPicks, c]);
  const addDraftColor = () => { const c = colorDraft.trim(); if (!c) return; setExtraColors((l) => (l.includes(c) ? l : [...l, c])); if (!colorPicks.includes(c)) setPicks([...colorPicks, c]); setColorDraft(""); };
  // แถวที่จะสร้างจริง (โหมดเดี่ยว) — หลายสี = แตกเป็นหลายแถว รหัสรันต่อจากรหัสที่กรอก
  const multiColor = isTaobao && colorPicks.length > 1;
  const singleRows = (): Row[] | string => {
    const est = isTaobao && priceEst;
    const base: Row = { values: { ...single.values, standard_price_is_estimate: est }, labels: single.labels };
    if (!multiColor) return [base];
    const cb = splitCode(String(single.values.code ?? "").trim());
    if (cb.pad === 0) return tr("หลายสีต้องใช้รหัสที่ลงท้ายด้วยตัวเลข (เช่น JEW-001) เพื่อรันรหัสต่อให้แต่ละสี", "Multiple colors need a code ending in a number (e.g. JEW-001) so each color gets the next code");
    const nm = String(single.values.name_th ?? "");
    return colorPicks.map((c, i) => ({
      values: { ...base.values, code: codeAt(cb, cb.num + i), color: c, name_th: PLACEHOLDER_RE.test(nm) || !nm.trim() ? nm : `${nm} ${c}` },
      labels: base.labels,
    }));
  };

  // ---------- โหมดชุด ----------
  const [lines, setLines] = useState<Row[]>([blankRow(), blankRow(), blankRow()]);
  const [bTag, setBTag] = useState<string | null>(null);
  const [batchBase, setBatchBase] = useState<CodeBase | null>(null);   // ฐานรหัสรัน (prefix+เลข) ของประเภทที่เลือก
  const [batchCodes, setBatchCodes] = useState<TagCode[]>([]);         // ตระกูลรหัสของประเภท (ให้เลือกในชุด)
  const [bCodePrefix, setBCodePrefix] = useState<string | null>(null); // ตระกูลรหัสที่เลือกในชุด
  const [colMenu, setColMenu] = useState(false);

  // เลือกประเภททั้งชุด → โหลด "ตระกูลรหัส" ให้เลือก (มีตัวเดียว=ใช้เลย, หลายตัว=เลือกได้ ตั้งค่าเริ่ม=ล่าสุด)
  const applyBatchTag = (tagId: string | null) => {
    setBTag(tagId); setBCodePrefix(null); setBatchBase(null); setBatchCodes([]);
    if (!tagId) return;
    loadContext(tagId);
    apiFetch(`/api/skus/tag-codes?family_tag_id=${tagId}`).then((r) => r.json()).then((j) => {
      const codes = (j.prefixes ?? []) as TagCode[];
      setBatchCodes(codes);
      if (codes.length) applyBatchCode(codes[0].prefix, codes, tagId);
    }).catch(() => {});
  };
  // เลือกตระกูลรหัส (ชุด) → เติมรหัสรันทุกแถว (เลขถัดไป+i) + ชื่อ/หน่วยจาก default ของตระกูล
  const applyBatchCode = (prefix: string, codes?: TagCode[], tagId?: string | null) => {
    const list = codes ?? batchCodes;
    const fam = list.find((c) => c.prefix === prefix); if (!fam) return;
    setBCodePrefix(prefix);
    const base = splitCode(fam.suggested); setBatchBase(base);
    const tag = (tagId ?? bTag) ? tags.find((t) => t.id === (tagId ?? bTag)) : null;
    const pd = tag?.prefix_defaults?.[prefix];
    const name = pd?.name || tag?.default_name || "";
    const uomId = pd?.uom_id || tag?.default_uom_id || null;
    const uomLabel = pd?.uom_id ? (pd?.uom_label || "") : (tag?.default_uom_label || "");
    setLines((l) => l.map((r, i) => {
      const values = { ...r.values }; const labels = { ...r.labels };
      values.code = codeAt(base, base.num + i);
      if (name && !String(values.name_th ?? "").trim()) values.name_th = name;
      if (uomId && !values.uom_id) { values.uom_id = uomId; labels.uom_id = uomLabel; }
      // ดึงค่าจาก SKU ตัวล่าสุดในตระกูล (เฉพาะช่องว่าง)
      if (fam.latest_seller_id && !values.seller_partner_id) { values.seller_partner_id = fam.latest_seller_id; labels.seller_partner_id = fam.latest_seller_name || ""; }
      if (fam.latest_standard_price != null && !String(values.standard_price ?? "").trim()) values.standard_price = String(fam.latest_standard_price);
      if (fam.latest_rmb_cost != null && !String(values.rmb_cost ?? "").trim()) values.rmb_cost = String(fam.latest_rmb_cost);
      if (fam.latest_fabric_width != null && !String(values.fabric_width_cm ?? "").trim()) values.fabric_width_cm = String(fam.latest_fabric_width);
      return { values, labels };
    }));
  };
  // เพิ่มแถว → รหัสรันต่อ (max เลขในชุด+1) + ชื่อ/หน่วย default (กฎเดียวกับเดี่ยว)
  const addBatchRow = () => setLines((l) => {
    const tag = bTag ? tags.find((t) => t.id === bTag) : null;
    const pd = bCodePrefix ? tag?.prefix_defaults?.[bCodePrefix] : undefined;
    const name = pd?.name || tag?.default_name || "";
    const uomId = pd?.uom_id || tag?.default_uom_id || null;
    const uomLabel = pd?.uom_id ? (pd?.uom_label || "") : (tag?.default_uom_label || "");
    const values: Record<string, unknown> = {}; const labels: Record<string, string> = {};
    if (batchBase) {
      let maxN = batchBase.num - 1;
      for (const r of l) {
        const c = String(r.values.code ?? "");
        if (c.startsWith(batchBase.prefix)) { const m = c.slice(batchBase.prefix.length).match(/^(\d+)/); if (m) maxN = Math.max(maxN, parseInt(m[1], 10)); }
      }
      values.code = codeAt(batchBase, maxN + 1);
    }
    if (name) values.name_th = name;
    if (uomId) { values.uom_id = uomId; labels.uom_id = uomLabel; }
    // ดึงค่าจาก SKU ตัวล่าสุดในตระกูล (กฎเดียวกับเดี่ยว)
    const fam = bCodePrefix ? batchCodes.find((c) => c.prefix === bCodePrefix) : undefined;
    if (fam?.latest_seller_id) { values.seller_partner_id = fam.latest_seller_id; labels.seller_partner_id = fam.latest_seller_name || ""; }
    if (fam?.latest_standard_price != null) values.standard_price = String(fam.latest_standard_price);
    if (fam?.latest_rmb_cost != null) values.rmb_cost = String(fam.latest_rmb_cost);
    if (fam?.latest_fabric_width != null) values.fabric_width_cm = String(fam.latest_fabric_width);
    return [...l, { values, labels }];
  });
  const setCell = (i: number, k: string, v: unknown, lbl?: string) => setLines((l) => l.map((x, idx) => idx === i ? ({ values: { ...x.values, [k]: v }, labels: lbl !== undefined ? { ...x.labels, [k]: lbl } : x.labels }) : x));
  const fillDown = (k: string) => setLines((l) => {
    if (l.length === 0) return l;
    const v = l[0].values[k]; const lbl = l[0].labels[k];
    return l.map((x, i) => i === 0 ? x : ({ values: { ...x.values, [k]: v }, labels: { ...x.labels, [k]: lbl } }));
  });

  const reset = () => { setSingle(blankRow()); setSug(null); setTagCodes([]); setSTag(null); setLines([blankRow(), blankRow(), blankRow()]); setBTag(null); setCtx({ fabric_widths: [], sellers: [] }); setBatchBase(null); setBatchCodes([]); setBCodePrefix(null); setPriceEst(false); setTagErr(false); setTagPanel(false); setTagQ(""); setColorPicks([]); setExtraColors([]); setColorDraft(""); autoUomRef.current = null; autoCodeRef.current = null; };
  const close = () => { if (saving) return; reset(); onClose(); };

  const submit = async (rows: Row[], tagId: string | null) => {
    const valid = rows.filter((r) => String(r.values.code ?? "").trim());
    if (valid.length === 0) { toast.error(t("กรอกรหัส SKU อย่างน้อย 1 ตัว", "Enter at least 1 SKU code")); return; }
    // B: แทนแม่แบบชื่อ [สี]/[รหัส] → ค่าจริง แล้วตรวจว่าไม่มี placeholder ค้าง
    const built = valid.map((r) => {
      const nm = applyNameTemplate(String(r.values.name_th ?? ""), String(r.values.color ?? ""), String(r.values.code ?? ""));
      const values = { ...r.values }; values.name_th = nm;
      return { ...r, values };
    });
    const bad = built.find((r) => PLACEHOLDER_RE.test(String(r.values.name_th ?? "")));
    if (bad) { toast.error(t(`ชื่อ SKU "${bad.values.code}" ยังมี [สี] หรือ [รหัส] ที่ยังไม่เติม — กรอกสี/รหัสให้ครบก่อน`, `SKU "${bad.values.code}" name still has an unfilled [สี] or [รหัส] — fill in the color/code first`)); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/skus/wizard-create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: built.map((r) => ({ values: r.values, family_tag_ids: [tagId].filter(Boolean) })) }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t(`สร้าง ${j.created} SKU แล้ว`, `Created ${j.created} SKUs`));
      reset();
      onCreated({ created: Number(j.created ?? 0), ids: (j.ids ?? []) as string[], skus: (j.skus ?? []) as { id: string; code: string }[] });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("สร้าง SKU ไม่สำเร็จ", "Couldn't create SKUs")); }
    finally { setSaving(false); }
  };

  // เดี่ยว: ต้องเลือกประเภท (Tag) ก่อน (เจ้าของสั่ง 2026-11-20) · หลายสีจาก Taobao = แตกเป็นหลายแถว
  const submitSingle = () => {
    if (!sTag) { setTagErr(true); setTagPanel(true); toast.error(t("เลือกประเภท (Tag) ก่อน ถึงจะสร้าง SKU ได้", "Pick a type (Tag) before creating the SKU")); return; }
    const rows = singleRows();
    if (typeof rows === "string") { toast.error(rows); return; }
    void submit(rows, sTag);
  };

  // ---- render cell ตามชนิดคอลัมน์ ----
  const cell = (col: ColDef, val: unknown, lbl: string | undefined, onVal: (v: unknown, lbl?: string) => void) => {
    if (col.type === "relation" && col.rel)
      return <AsyncPick table={col.rel.table} label={col.rel.label} secondary={col.rel.secondary} value={(val as string) || null} valueLabel={lbl} onChange={(id, l) => onVal(id, l)} placeholder={col.label}
        addNewLabel={col.rel.table === "partners_v2" ? t("เพิ่มผู้ขายใหม่", "Add new supplier") : undefined}
        onAddNew={col.rel.table === "partners_v2" ? (typed: string) => setNewSupplier({ name: typed, apply: (id: string, l: string) => onVal(id, l) }) : undefined} />;
    if (col.type === "boolean")
      return <input type="checkbox" checked={!!val} onChange={(e) => onVal(e.target.checked)} className="h-4 w-4 accent-blue-600" />;
    if (col.type === "number")
      return <input type="number" step="any" value={(val as string) ?? ""} onChange={(e) => onVal(e.target.value)} className="w-full h-8 px-1.5 text-sm text-right border border-transparent hover:border-slate-200 focus:border-blue-400 rounded" />;
    return <input value={(val as string) ?? ""} onChange={(e) => onVal(e.target.value)} className="w-full h-8 px-1.5 text-sm border border-transparent hover:border-slate-200 focus:border-blue-400 rounded" />;
  };

  return (
    <ERPModal open={open} onClose={close} size={step === "batch" ? "xl" : "lg"}
      title={step === "choose" ? t("เพิ่ม SKU", "Add SKU") : step === "single" ? t("เพิ่ม SKU (ทีละตัว)", "Add SKU (one at a time)") : t("เพิ่ม SKU (เป็นชุด)", "Add SKUs (batch)")}
      description={step === "choose" ? t("เลือกวิธีเพิ่ม — ระบบมีตัวช่วยกันส่งผิด/มั่ว/พลาด", "Choose how to add — built-in helpers prevent mistakes") : undefined}
      footer={step === "choose" ? undefined : (
        <div className="flex justify-between w-full">
          <button onClick={() => setStep("choose")} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">← {t("ย้อนกลับ", "Back")}</button>
          <div className="flex gap-2">
            {step === "batch" && <button onClick={addBatchRow} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">＋ {t("เพิ่มแถว", "Add row")}</button>}
            <button onClick={close} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button onClick={() => step === "single" ? submitSingle() : submit(lines, bTag)} disabled={saving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? t("กำลังสร้าง...", "Creating...") : t("สร้าง SKU", "Create SKU")}</button>
          </div>
        </div>
      )}>

      {/* Step 1 */}
      {step === "choose" && (
        <div className="grid grid-cols-2 gap-3 py-2">
          <button onClick={() => setStep("single")} className="p-5 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/40 text-left">
            <div className="text-2xl">➕</div>
            <div className="mt-2 font-semibold text-slate-800">{t("เพิ่มเดี่ยว", "Add one")}</div>
            <div className="text-xs text-slate-500 mt-1">{t("ทีละตัว มีตัวช่วยรหัสอัตโนมัติตามประเภท เหมาะตอนเพิ่มสินค้าใหม่ทีละชิ้น", "One at a time, with automatic codes by type — good for adding a single new product")}</div>
          </button>
          <button onClick={() => setStep("batch")} className="p-5 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/40 text-left">
            <div className="text-2xl">📋</div>
            <div className="mt-2 font-semibold text-slate-800">{t("เพิ่มเป็นชุด", "Add a batch")}</div>
            <div className="text-xs text-slate-500 mt-1">{t("หลายตัวพร้อมกันแบบตาราง + เลือกคอลัมน์ได้ + เติมลงล่าง", "Many at once in a table + pick columns + fill down")}</div>
          </button>
        </div>
      )}

      {/* โหมดเดี่ยว */}
      {step === "single" && (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-500">{t("ประเภท (Tag)", "Type (Tag)")} <span className="text-rose-500">*</span> {t("— ใช้เสนอรหัสให้", "— used to suggest a code")}</span>
            <div className="mt-0.5 flex flex-wrap sm:flex-nowrap gap-1.5">
              {/* ตัวเลือกประเภท: กด = เปิดหมวดซ้าย·แท็กขวา (ของกลาง TagColumns) */}
              <button type="button" onClick={() => { setTagPanel((v) => !v); setTagQ(""); }}
                className={`flex-1 min-w-0 basis-full sm:basis-auto h-9 px-2.5 flex items-center gap-2 text-sm text-left border rounded-lg bg-white hover:bg-slate-50 ${tagErr ? "border-rose-400 ring-1 ring-rose-200" : "border-slate-200"}`}>
                <span className={`flex-1 truncate ${sTag ? "text-slate-800" : "text-slate-400"}`}>{sTag ? tagPath(sTag) : t("กดเพื่อเลือกประเภท", "Tap to pick a type")}</span>
                {sTag && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); pickSingleTag(null); }} className="text-slate-300 hover:text-rose-500" title={t("ล้างประเภท", "Clear type")}>✕</span>}
                <span className="text-slate-400 text-xs">{tagPanel ? "▴" : "▾"}</span>
              </button>
              {/* ℹ️ tooltip: ทุกตระกูลรหัสที่ SKU ในแท็กนี้ใช้จริง (hover ดู ไม่ใช่ปุ่มเลือก) */}
              {tagCodes.length > 0 && (
                <div className="relative group flex items-center">
                  <span className="h-9 px-2 inline-flex items-center gap-1 text-sm border border-blue-200 bg-blue-50 text-blue-600 rounded-lg cursor-pointer hover:bg-blue-100 whitespace-nowrap">🔢 {t("ตระกูลรหัส", "Code families")} ({tagCodes.length}) ▾</span>
                  <div className="invisible group-hover:visible absolute right-0 top-full z-30 mt-1 w-80 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1.5 text-xs">
                    <div className="text-slate-400 px-1 pb-1">{t("กดเลือกตระกูลรหัสที่จะใช้ (หรือพิมพ์เอง)", "Pick the code family to use (or type your own)")}</div>
                    {(() => { const tagObj = sTag ? tags.find((x) => x.id === sTag) : undefined; return tagCodes.map((c) => {
                      // ชื่อ default (สะอาด): รายตระกูล → ของประเภท → ว่าง
                      const dn = cleanNameLabel(tagObj?.prefix_defaults?.[c.prefix]?.name || tagObj?.default_name || "");
                      return (
                        <button key={c.prefix} type="button" onClick={() => selectCodeFamily(c)}
                          className="w-full flex flex-col gap-0.5 px-1.5 py-1 rounded hover:bg-blue-50 text-left">
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-mono text-slate-500 text-[11px] shrink-0">{c.prefix}</span>
                            {dn && <span className="text-slate-800 font-medium truncate">{dn}</span>}
                            <span className="text-emerald-600 font-medium whitespace-nowrap ml-auto shrink-0">→ {c.suggested}</span>
                            <span className="text-slate-300 shrink-0">{c.count}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{t("ล่าสุด", "Latest")} {c.latest_code}{!dn && c.latest_name ? ` · ${c.latest_name}` : ""}</div>
                        </button>
                      );
                    }); })()}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => setPrefixMgr(true)} title={t("ตั้ง/แก้รหัสนำหน้าของแต่ละประเภท", "Set/edit the code prefix for each type")}
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ {t("จัดการรหัสนำหน้า", "Manage code prefixes")}</button>
            </div>
            {tagErr && !sTag && <div className="text-xs text-rose-600 mt-1">{t("ต้องเลือกประเภทก่อน ถึงจะสร้าง SKU ได้", "Pick a type before creating the SKU")}</div>}
            {tagChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[11px] text-slate-400">{t("แนะนำ (กดเพื่อเลือก):", "Suggested (tap to pick):")}</span>
                {tagChips.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickSingleTag(c.id)} title={c.why}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100">＋ {c.name}</button>
                ))}
              </div>
            )}
            {tagPanel && (
              <div className="mt-2 space-y-2">
                <input value={tagQ} onChange={(e) => setTagQ(e.target.value)} autoFocus placeholder={t("ค้นหาแท็กทุกหมวด…", "Search tags in all groups…")}
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg" />
                <TagColumns groups={tagGroups} tags={tagColTags} query={tagQ} selectedIds={sTag ? [sTag] : []} storageKey="sku-wizard"
                  renderTag={(o) => {
                    const on = sTag === o.id; const opt = tags.find((x) => x.id === o.id);
                    return (
                      <button type="button" onClick={() => pickSingleTag(o.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded border ${on ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-100 hover:border-blue-300 hover:bg-blue-50/40"}`}>
                        <span className={`inline-flex w-4 h-4 rounded-full border ${on ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                        <span className="flex-1 truncate">{o.label}</span>
                        <span className="text-[10px] font-mono text-slate-400">{opt?.code_prefix || ""}</span>
                      </button>
                    );
                  }} />
              </div>
            )}
          </div>

          {sug && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs space-y-1">
              {sug.error ? <div className="text-amber-600">⚠ {sug.error}</div> : <>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{t("ถัดไปของประเภทนี้:", "Next for this type:")}</span>
                  {sug.this_suggested && <button onClick={() => setSV("code", sug.this_suggested!)} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200">{sug.this_suggested} {t("ใช้เลย", "Use")}</button>}
                  {sug.this_latest && <span className="text-slate-400">({t("ล่าสุด", "latest")} {sug.this_latest})</span>}
                </div>
                {sug.group_latest && <div className="text-slate-400">{t("ล่าสุดทั้งหมวด", "Latest in group")}{sug.group_name ? ` "${sug.group_name}"` : ""}: {sug.group_latest}</div>}
              </>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block"><span className="text-xs text-slate-500">{t("รหัส SKU", "SKU code")} *{multiColor ? t(" (ตัวแรก — สีถัดไปรันต่อ)", " (first — next colors continue)") : ""}</span>
              <input value={(single.values.code as string) ?? ""} onChange={(e) => setSV("code", e.target.value)} placeholder={t("เช่น LEA-SAF-028", "e.g. LEA-SAF-028")} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs text-slate-500">{t("ชื่อ (ไทย)", "Name (Thai)")} <span className="text-[10px] text-slate-400">{t("— ใส่ [สี] [รหัส] เป็นตัวแปรได้", "— [สี] (color) and [รหัส] (code) work as variables")}</span></span>
              <input value={(single.values.name_th as string) ?? ""} onChange={(e) => setSV("name_th", e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" />
              {(() => {
                const nm = String(single.values.name_th ?? "");
                if (!PLACEHOLDER_RE.test(nm)) return null;
                const preview = applyNameTemplate(nm, String(single.values.color ?? ""), String(single.values.code ?? ""));
                const left = PLACEHOLDER_RE.test(preview);
                return <span className={`block text-[10px] mt-0.5 ${left ? "text-amber-600" : "text-emerald-600"}`}>→ {preview}{left ? t(" · ยังไม่ครบ (กรอกสี/รหัส)", " · incomplete (fill in color/code)") : ""}</span>;
              })()}</label>
            {isTaobao ? (
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">{t("สี", "Color")} <span className="text-[10px] text-blue-600">{t("ดึงจาก Taobao — ติ๊กได้หลายสี (1 สี = 1 SKU)", "From Taobao — pick several (1 color = 1 SKU)")}</span></span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {taobaoColors.map((c) => {
                    const on = colorPicks.includes(c);
                    return <button key={c} type="button" onClick={() => togglePick(c)}
                      className={`px-2.5 py-1 text-xs rounded-full border ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}>{on ? "✓ " : ""}{c}</button>;
                  })}
                  {taobaoColors.length === 0 && <span className="text-[11px] text-slate-400">{t("การ์ดนี้ไม่มีตัวเลือกสี — พิมพ์เองได้", "This card has no color options — type your own")}</span>}
                  <span className="inline-flex items-center gap-1">
                    <input value={colorDraft} onChange={(e) => setColorDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraftColor(); } }}
                      placeholder={t("+ พิมพ์สีเอง", "+ Type a color")} className="w-28 h-7 px-2 text-xs border border-slate-200 rounded-full" />
                    {colorDraft.trim() && <button type="button" onClick={addDraftColor} className="h-7 px-2 text-xs rounded-full bg-blue-600 text-white">{t("เพิ่ม", "Add")}</button>}
                  </span>
                </div>
                {multiColor && (() => {
                  const rows = singleRows();
                  return typeof rows === "string"
                    ? <div className="mt-1 text-[11px] text-amber-600">⚠ {rows}</div>
                    : <div className="mt-1.5 rounded-lg border border-blue-100 bg-blue-50/50 p-2 text-[11px] text-slate-600 space-y-0.5">
                        <div className="font-medium text-blue-700">{t(`จะสร้าง ${rows.length} SKU:`, `Will create ${rows.length} SKUs:`)}</div>
                        {rows.map((r) => <div key={String(r.values.code)} className="truncate"><span className="font-mono">{String(r.values.code)}</span> · {applyNameTemplate(String(r.values.name_th ?? ""), String(r.values.color ?? ""), String(r.values.code ?? ""))}</div>)}
                      </div>;
                })()}
              </div>
            ) : (
              <label className="block"><span className="text-xs text-slate-500">{t("สี", "Color")}</span>
                <input value={(single.values.color as string) ?? ""} onChange={(e) => setSV("color", e.target.value)} placeholder={t("ดำ/แดง...", "Black/Red...")} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            )}
            <label className="block"><span className="text-xs text-slate-500">{t("หน้ากว้าง (ซม. — กรณีผ้า)", "Width (cm — for fabric)")}</span>
              <input type="number" step="any" value={(single.values.fabric_width_cm as string) ?? ""} onChange={(e) => setSV("fabric_width_cm", e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg" />
              {ctx.fabric_widths.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  <span className="text-[10px] text-slate-400">{t("ใช้บ่อย:", "Often used:")}</span>
                  {ctx.fabric_widths.map((w) => (
                    <button key={w} type="button" onClick={() => setSV("fabric_width_cm", String(w))}
                      className="px-1.5 py-0.5 text-[11px] rounded border border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50">{w}</button>
                  ))}
                </div>
              )}</label>
            <label className="block"><span className="text-xs text-slate-500">{t("หน่วย (Uom)", "Unit (UoM)")}</span>
              <div className="mt-0.5 border border-slate-200 rounded-lg"><AsyncPick table="uoms" label="display_name" value={(single.values.uom_id as string) ?? null} valueLabel={single.labels.uom_id} onChange={(id, lbl) => { autoUomRef.current = null; setSV("uom_id", id, lbl); }} placeholder={t("เลือกหน่วย", "Select unit")} quickCreate={{ entity: "uoms", field: "name", label: t("เพิ่มหน่วยใหม่", "Add new unit") }} /></div>
              {(() => {
                // หน่วยตามประเภท: ตั้งที่ ⚙️ จัดการรหัสนำหน้า (หน่วย default ต่อประเภท / ต่อตระกูลรหัส)
                const tg = sTag ? tags.find((x) => x.id === sTag) : undefined;
                if (!tg) return null;
                if (single.values.uom_id && single.values.uom_id === autoUomRef.current)
                  return <span className="block text-[10px] text-emerald-600 mt-0.5">{t("ใส่ให้ตามประเภทนี้ · ", "Filled from this type · ")}<button type="button" onClick={() => setPrefixMgr(true)} className="underline">{t("ตั้งค่า", "Settings")}</button></span>;
                if (!tg.default_uom_id)
                  return <span className="block text-[10px] text-slate-400 mt-0.5">{t("ประเภทนี้ยังไม่ได้ตั้งหน่วย — ", "No unit set for this type — ")}<button type="button" onClick={() => setPrefixMgr(true)} className="underline text-blue-600">{t("ตั้งหน่วยตามประเภท", "Set unit by type")}</button></span>;
                return null;
              })()}</label>
            <label className="block"><span className="text-xs text-slate-500">{t("ผู้ขาย", "Supplier")}</span>
              <div className="mt-0.5 border border-slate-200 rounded-lg"><AsyncPick table="partners_v2" label="name_th" secondary="code" pinned={sellerPins} value={(single.values.seller_partner_id as string) ?? null} valueLabel={single.labels.seller_partner_id} onChange={(id, lbl) => setSV("seller_partner_id", id, lbl)} placeholder={t("เลือกผู้ขาย", "Select supplier")}
                addNewLabel={t("เพิ่มผู้ขายใหม่", "Add new supplier")}
                onAddNew={(typed: string) => setNewSupplier({ name: typed, apply: (id: string, lbl: string) => setSV("seller_partner_id", id, lbl) })} /></div></label>
            <label className="block"><span className="text-xs text-slate-500">{t("ราคาซื้อ (บาท)", "Purchase price (THB)")}</span>
              {isTaobao && priceEst && String(single.values.standard_price ?? "").trim() !== "" && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700" title={t("คำนวณจากหยวน × เรต — แก้ตัวเลขเองเมื่อรู้ราคาจริง", "Calculated from RMB × rate — edit it when you know the real price")}>{t("ราคาคร่าว ๆ", "Estimate")}</span>
              )}
              <input type="number" step="any" value={(single.values.standard_price as string) ?? ""} onChange={(e) => { setPriceEst(false); setSV("standard_price", e.target.value); }} className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg" />
              {isTaobao && (priceEst
                ? <span className="block text-[10px] text-slate-400 mt-0.5">{t(`= ราคาหยวน × ${rmbRate} · แก้ตัวเลขเอง = เป็นราคาจริง`, `= RMB price × ${rmbRate} · edit it yourself = real price`)}</span>
                : String(single.values.rmb_cost ?? "").trim() !== "" && <button type="button" onClick={() => setPriceEst(true)} className="block text-[10px] text-blue-600 underline mt-0.5">{t(`คำนวณใหม่จากหยวน × ${rmbRate}`, `Recalculate from RMB × ${rmbRate}`)}</button>)}</label>
            {isTaobao && <label className="block"><span className="text-xs text-slate-500">{t("ราคาซื้อ (หยวน) RMB", "Purchase price (RMB)")}</span>
              <input type="number" step="any" value={(single.values.rmb_cost as string) ?? ""} onChange={(e) => onRmbChange(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>}
            {isTaobao && <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <span>{t("เรตหยวน→บาท:", "RMB→THB rate:")}</span>
              <input type="number" step="any" value={rmbRate} onChange={(e) => setRmbRate(Number(e.target.value) || 0)} onBlur={saveRate}
                title={t("ตั้งเรตแปลงหยวนเป็นบาท (ใช้ร่วมทั้งระบบ) · บันทึกเมื่อออกจากช่อง", "Set the RMB to THB rate (shared system-wide) · saved when you leave the field")} className="w-16 h-7 px-1.5 text-right border border-slate-200 rounded" />
              <span>{t("× ราคาซื้อหยวน = ราคาซื้อ (บาท)", "× RMB price = purchase price (THB)")}</span>
            </div>}
          </div>
          <p className="text-[11px] text-slate-400">{t("Barcode จะตั้งให้เท่ากับรหัส SKU อัตโนมัติ", "Barcode is set to the SKU code automatically")}</p>
        </div>
      )}

      {/* โหมดชุด */}
      {step === "batch" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="block"><span className="text-xs text-slate-500">{t("ประเภท (Tag) ทั้งชุด", "Type (Tag) for the whole batch")}</span>
              <div className="mt-0.5 w-48"><SearchableSelect value={bTag ?? ""} options={tagOptions} placeholder={t("— ไม่ระบุ (ค้นหาได้) —", "— None (searchable) —")} onChange={(v) => applyBatchTag(v || null)} /></div></label>
            {batchCodes.length > 1 && (
              <label className="block"><span className="text-xs text-slate-500">{t("ตระกูลรหัส", "Code family")} *</span>
                <div className="mt-0.5 w-48"><SearchableSelect value={bCodePrefix ?? ""} placeholder={t("— เลือกตระกูล —", "— Select family —")}
                  options={batchCodes.map((c) => { const bt = bTag ? tags.find((x) => x.id === bTag) : undefined;
                    const dn = cleanNameLabel(bt?.prefix_defaults?.[c.prefix]?.name || bt?.default_name || "");
                    return { value: c.prefix, label: dn ? `${dn} · ${c.prefix}` : c.prefix, sub: `${t("ถัดไป", "Next")} ${c.suggested}` }; })}
                  onChange={(v) => v && applyBatchCode(v)} /></div></label>
            )}
            <button type="button" onClick={() => setPrefixMgr(true)} title={t("ตั้ง/แก้รหัสนำหน้าของแต่ละประเภท", "Set/edit the code prefix for each type")}
              className="h-8 px-3 text-sm border border-slate-200 rounded text-slate-600 hover:bg-white whitespace-nowrap">⚙️ {t("จัดการรหัสนำหน้า", "Manage code prefixes")}</button>
            {/* ตัวเลือกคอลัมน์ (จากทะเบียน field) */}
            <div className="relative">
              <button onClick={() => setColMenu((o) => !o)} className="h-8 px-3 text-sm border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50">🧩 {t("เลือกคอลัมน์", "Columns")} ({shownCols.length})</button>
              {colMenu && <>
                <div className="fixed inset-0 z-10" onClick={() => setColMenu(false)} />
                <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1">
                  <div className="flex justify-between px-2 py-1 text-[11px] text-slate-400">
                    <button onClick={() => saveColKeys(DEFAULT_COLS)} className="hover:text-blue-600">{t("รีเซ็ต default", "Reset to default")}</button>
                    <span>{catalog.length} {t("ฟิลด์", "fields")}</span>
                  </div>
                  {catalog.map((c) => {
                    const on = c.key === "code" || colKeys.includes(c.key);
                    return (
                      <label key={c.key} className={`flex items-center gap-2 px-2 py-1 text-sm rounded ${c.key === "code" ? "opacity-50" : "hover:bg-slate-50 cursor-pointer"}`}>
                        <input type="checkbox" checked={on} disabled={c.key === "code"}
                          onChange={(e) => saveColKeys(e.target.checked ? [...colKeys, c.key] : colKeys.filter((k) => k !== c.key))}
                          className="h-4 w-4 accent-blue-600" />
                        <span className="truncate">{LABEL_OVERRIDE[c.key] ?? c.label}</span>
                        <span className="ml-auto text-[10px] text-slate-300">{c.type}</span>
                      </label>
                    );
                  })}
                </div>
              </>}
            </div>
            <div className="text-xs text-slate-400 ml-auto">{t("เติมลงล่าง = ก๊อปค่าจากแถวแรกไปทุกแถว (กด ↓ ที่หัวคอลัมน์)", "Fill down = copy the first row's value to every row (press ↓ in the column header)")}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="border border-slate-200 px-1 py-1 w-8">#</th>
                  {shownCols.map((c) => (
                    <th key={c.key} className="border border-slate-200 px-2 py-1 text-left min-w-[120px] whitespace-nowrap">
                      {LABEL_OVERRIDE[c.key] ?? c.label}{c.key === "code" ? " *" : ""}{" "}
                      {c.key !== "code" && <button type="button" onClick={() => fillDown(c.key)} title={t("เติมลงล่าง", "Fill down")} className="text-blue-500 hover:text-blue-700">↓</button>}
                    </th>
                  ))}
                  <th className="border border-slate-200 px-1 py-1 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((r, i) => (
                  <tr key={i}>
                    <td className="border border-slate-200 px-1 py-0.5 text-center text-slate-400">{i + 1}</td>
                    {shownCols.map((c) => (
                      <td key={c.key} className="border border-slate-200 px-1 py-0.5">
                        {cell(c, r.values[c.key], r.labels[c.key], (v, lbl) => setCell(i, c.key, v, lbl))}
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-0.5 text-center"><button onClick={() => setLines((l) => l.length <= 1 ? l : l.filter((_, idx) => idx !== i))} className="text-rose-400 hover:text-rose-600">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">{t("Barcode = รหัส SKU อัตโนมัติ · ประเภททั้งชุดจะผูกเป็นแท็กให้ทุกแถว · คอลัมน์ที่เลือกจะถูกจำไว้", "Barcode = SKU code automatically · the batch type is tagged on every row · your column choice is remembered")}</p>
        </div>
      )}

      {/* ป๊อปจัดการรหัสนำหน้า (ของกลาง) — ปิดแล้วโหลดประเภทใหม่ */}
      {prefixMgr && <SkuPrefixManager onClose={() => { setPrefixMgr(false); loadTags(); }} />}
      {/* เพิ่มผู้ขายใหม่โดยไม่ต้องออกจากฟอร์ม — ของกลาง SupplierWizard (partners_v2) */}
      {newSupplier && (
        <SupplierWizard role="supplier" initialName={newSupplier.name}
          onClose={() => setNewSupplier(null)}
          onCreated={(pn) => { newSupplier.apply(pn.id, pn.name); setNewSupplier(null); toast.success(t(`เพิ่มผู้ขาย “${pn.name}” แล้ว`, `Supplier “${pn.name}” added`)); }} />
      )}
    </ERPModal>
  );
}
