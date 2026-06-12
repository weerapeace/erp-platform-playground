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
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { SkuPrefixManager } from "@/components/sku-prefix-manager";

type PickerOpt = { id: string; label: string; secondary?: string };
type TagOpt = { id: string; name: string; code_prefix: string; group_name: string | null };
type Suggest = { prefix: string; this_latest: string | null; this_suggested: string | null; group_latest: string | null; group_name: string | null; error?: string };
type TagCode = { prefix: string; latest_code: string; suggested: string; count: number };

// คอลัมน์จากทะเบียน field (ไม่ hardcode)
type ColDef = { key: string; label: string; type: "text" | "number" | "boolean" | "relation"; rel?: { table: string; label: string; secondary?: string } };
// คอลัมน์ default ที่โชว์ตอนเริ่ม (ตามที่ใช้บ่อย)
const DEFAULT_COLS = ["code", "name_th", "uom_id", "seller_partner_id", "standard_price", "rmb_cost", "fabric_width_cm", "color"];
const COLS_LS = "sku-wizard-batch-cols";
// field ที่ข้าม (ระบบ/ไม่เหมาะกรอกในตาราง)
const SKIP_COLS = new Set(["id", "is_active", "sale_ok", "purchase_ok", "created_at", "updated_at", "attribute_values", "cover_image_r2_key", "odoo_form_details", "odoo_form_synced_at"]);

// ---- ตัวเลือกแบบค้นหา (async) จาก picker กลาง ----
function AsyncPick({ table, label, secondary, value, valueLabel, onChange, placeholder }: {
  table: string; label: string; secondary?: string;
  value: string | null; valueLabel?: string; onChange: (id: string | null, lbl: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<PickerOpt[]>([]);
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
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา..."
              className="w-full h-8 px-2 text-sm border-b border-slate-100 focus:outline-none" />
            <div className="max-h-56 overflow-y-auto py-1">
              {value && <button type="button" onClick={() => { onChange(null, ""); setOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs text-rose-500 hover:bg-rose-50">✕ ล้าง</button>}
              {opts.map((o) => (
                <button key={o.id} type="button" onClick={() => { onChange(o.id, o.label); setOpen(false); setQ(""); }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-blue-50 truncate">
                  {o.label}{o.secondary ? <span className="text-slate-400"> · {o.secondary}</span> : null}
                </button>
              ))}
              {opts.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">— ไม่พบ —</div>}
            </div>
        </div>
      )}
    </div>
  );
}

// แถวข้อมูล: values (คอลัมน์→ค่า) + labels (สำหรับ relation โชว์ชื่อ)
type Row = { values: Record<string, unknown>; labels: Record<string, string> };
const blankRow = (): Row => ({ values: {}, labels: {} });

export function SkuWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<"choose" | "single" | "batch">("choose");
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [catalog, setCatalog] = useState<ColDef[]>([]);
  const [prefixMgr, setPrefixMgr] = useState(false);   // ป๊อปจัดการรหัสนำหน้า
  const [saving, setSaving] = useState(false);

  // โหลดประเภท(แท็ก) ทั้งหมด (รวมที่ยังไม่ตั้ง prefix) — ใช้ tag-prefix
  const loadTags = useCallback(() => {
    apiFetch("/api/skus/tag-prefix").then((r) => r.json()).then((j) => setTags((j.data ?? []) as TagOpt[])).catch(() => {});
  }, []);

  // โหลดประเภท + คอลัมน์จากทะเบียน field
  useEffect(() => {
    if (!open) return;
    setStep("choose");
    loadTags();
    apiFetch("/api/admin/field-registry-v2?module=skus-v2").then((r) => r.json()).then((j) => {
      const cols: ColDef[] = ((j.fields ?? []) as Record<string, unknown>[]).flatMap((f): ColDef[] => {
        const key = f.column_name as string | null;
        if (!key || !f.is_editable || SKIP_COLS.has(key)) return [];
        const t = f.ui_field_type as string;
        const label = (f.field_label as string) || key;
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
  }, [open, loadTags]);

  // คอลัมน์ที่เลือกโชว์ (จำใน localStorage, เริ่มต้น = DEFAULT_COLS)
  const [colKeys, setColKeys] = useState<string[]>(DEFAULT_COLS);
  useEffect(() => {
    try { const s = localStorage.getItem(COLS_LS); if (s) setColKeys(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  const saveColKeys = (keys: string[]) => { const k = keys.includes("code") ? keys : ["code", ...keys]; setColKeys(k); try { localStorage.setItem(COLS_LS, JSON.stringify(k)); } catch { /* ignore */ } };
  // คอลัมน์ที่จะ render จริง (ตามลำดับ catalog, code มาก่อนเสมอ)
  const shownCols = useMemo(() => {
    const map = new Map(catalog.map((c) => [c.key, c]));
    const code = map.get("code") ?? { key: "code", label: "รหัส SKU", type: "text" as const };
    const rest = colKeys.filter((k) => k !== "code" && map.has(k)).map((k) => map.get(k)!);
    return [code, ...rest];
  }, [catalog, colKeys]);

  // ---------- โหมดเดี่ยว ----------
  const [sTag, setSTag] = useState<string | null>(null);
  const [sug, setSug] = useState<Suggest | null>(null);
  const [tagCodes, setTagCodes] = useState<TagCode[]>([]);   // ทุกตระกูลรหัสที่ใช้กับแท็กนี้ (tooltip)
  const [single, setSingle] = useState<Row>(blankRow());
  const setSV = (k: string, v: unknown, lbl?: string) => setSingle((s) => ({ values: { ...s.values, [k]: v }, labels: lbl !== undefined ? { ...s.labels, [k]: lbl } : s.labels }));
  const loadSuggest = useCallback((tagId: string) => {
    apiFetch(`/api/skus/code-suggest?family_tag_id=${tagId}`).then((r) => r.json()).then((j) => {
      setSug(j as Suggest);
      if (j.this_suggested) setSingle((s) => (s.values.code ? s : { ...s, values: { ...s.values, code: j.this_suggested } }));
    }).catch(() => {});
    // ดึงทุกตระกูลรหัสจริงที่ผูกแท็กนี้ (สำหรับ tooltip)
    setTagCodes([]);
    apiFetch(`/api/skus/tag-codes?family_tag_id=${tagId}`).then((r) => r.json()).then((j) => setTagCodes((j.prefixes ?? []) as TagCode[])).catch(() => {});
  }, []);

  // ---------- โหมดชุด ----------
  const [lines, setLines] = useState<Row[]>([blankRow(), blankRow(), blankRow()]);
  const [bTag, setBTag] = useState<string | null>(null);
  const [colMenu, setColMenu] = useState(false);
  const setCell = (i: number, k: string, v: unknown, lbl?: string) => setLines((l) => l.map((x, idx) => idx === i ? ({ values: { ...x.values, [k]: v }, labels: lbl !== undefined ? { ...x.labels, [k]: lbl } : x.labels }) : x));
  const fillDown = (k: string) => setLines((l) => {
    if (l.length === 0) return l;
    const v = l[0].values[k]; const lbl = l[0].labels[k];
    return l.map((x, i) => i === 0 ? x : ({ values: { ...x.values, [k]: v }, labels: { ...x.labels, [k]: lbl } }));
  });

  const reset = () => { setSingle(blankRow()); setSug(null); setTagCodes([]); setSTag(null); setLines([blankRow(), blankRow(), blankRow()]); setBTag(null); };
  const close = () => { if (saving) return; reset(); onClose(); };

  const submit = async (rows: Row[], tagId: string | null) => {
    const valid = rows.filter((r) => String(r.values.code ?? "").trim());
    if (valid.length === 0) { toast.error("กรอกรหัส SKU อย่างน้อย 1 ตัว"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/skus/wizard-create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: valid.map((r) => ({ values: r.values, family_tag_ids: [tagId].filter(Boolean) })) }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`สร้าง ${j.created} SKU แล้ว`);
      reset(); onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้าง SKU ไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  // ---- render cell ตามชนิดคอลัมน์ ----
  const cell = (col: ColDef, val: unknown, lbl: string | undefined, onVal: (v: unknown, lbl?: string) => void) => {
    if (col.type === "relation" && col.rel)
      return <AsyncPick table={col.rel.table} label={col.rel.label} secondary={col.rel.secondary} value={(val as string) || null} valueLabel={lbl} onChange={(id, l) => onVal(id, l)} placeholder={col.label} />;
    if (col.type === "boolean")
      return <input type="checkbox" checked={!!val} onChange={(e) => onVal(e.target.checked)} className="h-4 w-4 accent-blue-600" />;
    if (col.type === "number")
      return <input type="number" step="any" value={(val as string) ?? ""} onChange={(e) => onVal(e.target.value)} className="w-full h-8 px-1.5 text-sm text-right border border-transparent hover:border-slate-200 focus:border-blue-400 rounded" />;
    return <input value={(val as string) ?? ""} onChange={(e) => onVal(e.target.value)} className="w-full h-8 px-1.5 text-sm border border-transparent hover:border-slate-200 focus:border-blue-400 rounded" />;
  };

  return (
    <ERPModal open={open} onClose={close} size={step === "batch" ? "xl" : "lg"}
      title={step === "choose" ? "เพิ่ม SKU" : step === "single" ? "เพิ่ม SKU (ทีละตัว)" : "เพิ่ม SKU (เป็นชุด)"}
      description={step === "choose" ? "เลือกวิธีเพิ่ม — ระบบมีตัวช่วยกันส่งผิด/มั่ว/พลาด" : undefined}
      footer={step === "choose" ? undefined : (
        <div className="flex justify-between w-full">
          <button onClick={() => setStep("choose")} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">← ย้อนกลับ</button>
          <div className="flex gap-2">
            {step === "batch" && <button onClick={() => setLines((l) => [...l, blankRow()])} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">＋ เพิ่มแถว</button>}
            <button onClick={close} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => step === "single" ? submit([single], sTag) : submit(lines, bTag)} disabled={saving}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังสร้าง..." : "สร้าง SKU"}</button>
          </div>
        </div>
      )}>

      {/* Step 1 */}
      {step === "choose" && (
        <div className="grid grid-cols-2 gap-3 py-2">
          <button onClick={() => setStep("single")} className="p-5 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/40 text-left">
            <div className="text-2xl">➕</div>
            <div className="mt-2 font-semibold text-slate-800">เพิ่มเดี่ยว</div>
            <div className="text-xs text-slate-500 mt-1">ทีละตัว มีตัวช่วยรหัสอัตโนมัติตามประเภท เหมาะตอนเพิ่มสินค้าใหม่ทีละชิ้น</div>
          </button>
          <button onClick={() => setStep("batch")} className="p-5 border-2 border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/40 text-left">
            <div className="text-2xl">📋</div>
            <div className="mt-2 font-semibold text-slate-800">เพิ่มเป็นชุด</div>
            <div className="text-xs text-slate-500 mt-1">หลายตัวพร้อมกันแบบตาราง + เลือกคอลัมน์ได้ + เติมลงล่าง</div>
          </button>
        </div>
      )}

      {/* โหมดเดี่ยว */}
      {step === "single" && (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-500">ประเภท (Tag) — ใช้เสนอรหัสให้</span>
            <div className="mt-0.5 flex gap-1.5">
              <select value={sTag ?? ""} onChange={(e) => { const v = e.target.value || null; setSTag(v); if (v) loadSuggest(v); else { setSug(null); setTagCodes([]); } }}
                className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">— เลือกประเภท —</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.group_name ? `${t.group_name} · ` : ""}{t.name} {t.code_prefix ? `(${t.code_prefix})` : "— ยังไม่ตั้งรหัส"}</option>)}
              </select>
              {/* ℹ️ tooltip: ทุกตระกูลรหัสที่ SKU ในแท็กนี้ใช้จริง (hover ดู ไม่ใช่ปุ่มเลือก) */}
              {tagCodes.length > 0 && (
                <div className="relative group flex items-center">
                  <span className="h-9 px-2 inline-flex items-center text-sm border border-blue-200 bg-blue-50 text-blue-600 rounded-lg cursor-help whitespace-nowrap">ℹ️ รหัสที่ใช้ ({tagCodes.length})</span>
                  <div className="invisible group-hover:visible absolute right-0 top-full z-30 mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-2 text-xs">
                    <div className="text-slate-400 mb-1">ตระกูลรหัสที่ใช้กับประเภทนี้ (พิมพ์รหัสเอง)</div>
                    <table className="w-full">
                      <tbody>
                        {tagCodes.map((c) => (
                          <tr key={c.prefix} className="border-t border-slate-50">
                            <td className="py-0.5 pr-2 font-mono text-slate-700">{c.prefix}</td>
                            <td className="py-0.5 pr-2 text-slate-500 whitespace-nowrap">ล่าสุด {c.latest_code}</td>
                            <td className="py-0.5 pr-2 text-emerald-600 whitespace-nowrap">→ {c.suggested}</td>
                            <td className="py-0.5 text-right text-slate-300">{c.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <button type="button" onClick={() => setPrefixMgr(true)} title="ตั้ง/แก้รหัสนำหน้าของแต่ละประเภท"
                className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">⚙️ จัดการรหัสนำหน้า</button>
            </div>
          </div>

          {sug && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs space-y-1">
              {sug.error ? <div className="text-amber-600">⚠ {sug.error}</div> : <>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">ถัดไปของประเภทนี้:</span>
                  {sug.this_suggested && <button onClick={() => setSV("code", sug.this_suggested!)} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium hover:bg-emerald-200">{sug.this_suggested} ใช้เลย</button>}
                  {sug.this_latest && <span className="text-slate-400">(ล่าสุด {sug.this_latest})</span>}
                </div>
                {sug.group_latest && <div className="text-slate-400">ล่าสุดทั้งหมวด{sug.group_name ? ` "${sug.group_name}"` : ""}: {sug.group_latest}</div>}
              </>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-xs text-slate-500">รหัส SKU *</span>
              <input value={(single.values.code as string) ?? ""} onChange={(e) => setSV("code", e.target.value)} placeholder="เช่น LEA-SAF-028" className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs text-slate-500">ชื่อ (ไทย)</span>
              <input value={(single.values.name_th as string) ?? ""} onChange={(e) => setSV("name_th", e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs text-slate-500">สี</span>
              <input value={(single.values.color as string) ?? ""} onChange={(e) => setSV("color", e.target.value)} placeholder="ดำ/แดง..." className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs text-slate-500">หน้ากว้าง (ซม. — กรณีผ้า)</span>
              <input type="number" step="any" value={(single.values.fabric_width_cm as string) ?? ""} onChange={(e) => setSV("fabric_width_cm", e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs text-slate-500">หน่วย (Uom)</span>
              <div className="mt-0.5 border border-slate-200 rounded-lg"><AsyncPick table="uoms" label="name" value={(single.values.uom_id as string) ?? null} valueLabel={single.labels.uom_id} onChange={(id, lbl) => setSV("uom_id", id, lbl)} placeholder="เลือกหน่วย" /></div></label>
            <label className="block"><span className="text-xs text-slate-500">ผู้ขาย</span>
              <div className="mt-0.5 border border-slate-200 rounded-lg"><AsyncPick table="partners_v2" label="name_th" secondary="code" value={(single.values.seller_partner_id as string) ?? null} valueLabel={single.labels.seller_partner_id} onChange={(id, lbl) => setSV("seller_partner_id", id, lbl)} placeholder="เลือกผู้ขาย" /></div></label>
            <label className="block"><span className="text-xs text-slate-500">Standard Price</span>
              <input type="number" step="any" value={(single.values.standard_price as string) ?? ""} onChange={(e) => setSV("standard_price", e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
            <label className="block"><span className="text-xs text-slate-500">RMB Cost</span>
              <input type="number" step="any" value={(single.values.rmb_cost as string) ?? ""} onChange={(e) => setSV("rmb_cost", e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg" /></label>
          </div>
          <p className="text-[11px] text-slate-400">Barcode จะตั้งให้เท่ากับรหัส SKU อัตโนมัติ</p>
        </div>
      )}

      {/* โหมดชุด */}
      {step === "batch" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="block"><span className="text-xs text-slate-500">ประเภท (Tag) ทั้งชุด</span>
              <select value={bTag ?? ""} onChange={(e) => setBTag(e.target.value || null)} className="mt-0.5 h-8 px-2 text-sm border border-slate-200 rounded bg-white">
                <option value="">— ไม่ระบุ —</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
            <button type="button" onClick={() => setPrefixMgr(true)} title="ตั้ง/แก้รหัสนำหน้าของแต่ละประเภท"
              className="h-8 px-3 text-sm border border-slate-200 rounded text-slate-600 hover:bg-white whitespace-nowrap">⚙️ จัดการรหัสนำหน้า</button>
            {/* ตัวเลือกคอลัมน์ (จากทะเบียน field) */}
            <div className="relative">
              <button onClick={() => setColMenu((o) => !o)} className="h-8 px-3 text-sm border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50">🧩 เลือกคอลัมน์ ({shownCols.length})</button>
              {colMenu && <>
                <div className="fixed inset-0 z-10" onClick={() => setColMenu(false)} />
                <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1">
                  <div className="flex justify-between px-2 py-1 text-[11px] text-slate-400">
                    <button onClick={() => saveColKeys(DEFAULT_COLS)} className="hover:text-blue-600">รีเซ็ต default</button>
                    <span>{catalog.length} ฟิลด์</span>
                  </div>
                  {catalog.map((c) => {
                    const on = c.key === "code" || colKeys.includes(c.key);
                    return (
                      <label key={c.key} className={`flex items-center gap-2 px-2 py-1 text-sm rounded ${c.key === "code" ? "opacity-50" : "hover:bg-slate-50 cursor-pointer"}`}>
                        <input type="checkbox" checked={on} disabled={c.key === "code"}
                          onChange={(e) => saveColKeys(e.target.checked ? [...colKeys, c.key] : colKeys.filter((k) => k !== c.key))}
                          className="h-4 w-4 accent-blue-600" />
                        <span className="truncate">{c.label}</span>
                        <span className="ml-auto text-[10px] text-slate-300">{c.type}</span>
                      </label>
                    );
                  })}
                </div>
              </>}
            </div>
            <div className="text-xs text-slate-400 ml-auto">เติมลงล่าง = ก๊อปค่าจากแถวแรกไปทุกแถว (กด ↓ ที่หัวคอลัมน์)</div>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="border border-slate-200 px-1 py-1 w-8">#</th>
                  {shownCols.map((c) => (
                    <th key={c.key} className="border border-slate-200 px-2 py-1 text-left min-w-[120px] whitespace-nowrap">
                      {c.label}{c.key === "code" ? " *" : ""}{" "}
                      {c.key !== "code" && <button type="button" onClick={() => fillDown(c.key)} title="เติมลงล่าง" className="text-blue-500 hover:text-blue-700">↓</button>}
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
          <p className="text-[11px] text-slate-400">Barcode = รหัส SKU อัตโนมัติ · ประเภททั้งชุดจะผูกเป็นแท็กให้ทุกแถว · คอลัมน์ที่เลือกจะถูกจำไว้</p>
        </div>
      )}

      {/* ป๊อปจัดการรหัสนำหน้า (ของกลาง) — ปิดแล้วโหลดประเภทใหม่ */}
      {prefixMgr && <SkuPrefixManager onClose={() => { setPrefixMgr(false); loadTags(); }} />}
    </ERPModal>
  );
}
