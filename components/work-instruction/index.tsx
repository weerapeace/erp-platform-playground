"use client";

/**
 * WorkInstructionPanel — แผงรายละเอียดสั่งงาน (ของกลาง)
 * เฟส 1: แสดง read-through (SKU → Parent: attribute model+sku + ช่องเดิม + วิธีทำ)
 * เฟส 2: ปุ่ม "✎ แก้ไข" → ฟอร์มแก้ไขสร้างอัตโนมัติจาก product_attribute_definitions
 *        บันทึกลงระบบ attribute (แหล่งจริง) + ช่องเดิม (ระหว่างย้าย) — ไม่แตะ schema
 * ใช้ที่: หน้าแก้ BOM, ใบสั่งผลิต (MO), (ภายหลัง) ใบจ่ายงาน/พิมพ์
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { ComponentPicker } from "@/app/master/bom/line-editor";
import type { ProductSpec, SpecField } from "@/app/api/product-spec/route";
import type { AttrDef, AttrVal } from "@/app/api/product-attributes/route";

function Row({ f, bomSkus, onEdit }: { f: SpecField; bomSkus?: string[]; onEdit?: () => void }) {
  const inBom = f.sku_code && bomSkus ? bomSkus.includes(f.sku_code) : null;
  return (
    <div className="group flex gap-2 text-xs py-0.5 items-center">
      <span className="w-28 shrink-0 flex items-center gap-1">
        <span className="text-slate-400 truncate">{f.label}</span>
        {onEdit && <button type="button" onClick={onEdit} title="แก้ไข" className="shrink-0 h-4 w-4 flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100">✎</button>}
      </span>
      <span className="text-slate-700 flex-1">{f.value}</span>
      {inBom === true && <span className="text-[10px] text-emerald-600 shrink-0">✓ อยู่ใน BOM</span>}
      {inBom === false && <span className="text-[10px] text-amber-600 shrink-0">✗ ยังไม่อยู่</span>}
    </div>
  );
}

export function WorkInstructionPanel({ sku, editable = false, bomSkus, onAddMaterials, refreshKey, className = "" }: { sku: string | null | undefined; editable?: boolean; bomSkus?: string[]; onAddMaterials?: (mats: { code: string; name: string }[]) => void; refreshKey?: number | string; className?: string }) {
  const toast = useToast();
  const [spec, setSpec] = useState<ProductSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  // inline edit (กด ✎ → แก้เฉพาะช่องนั้น)
  const [editData, setEditData] = useState<EditData | null>(null);
  const [editField, setEditField] = useState<{ section: string; key: string } | null>(null);
  const [editVal, setEditVal] = useState<unknown>("");
  const [editName, setEditName] = useState("");
  const [savingField, setSavingField] = useState(false);

  const loadSpec = useCallback(() => {
    if (!sku) { setSpec(null); return; }
    setLoading(true);
    apiFetch(`/api/product-spec?sku=${encodeURIComponent(sku)}`).then((r) => r.json()).then((j) => setSpec(j as ProductSpec)).catch(() => setSpec(null)).finally(() => setLoading(false));
  }, [sku, refreshKey]);   // refreshKey เปลี่ยน → โหลดสเปกใหม่ (เช่น หลังบันทึก BOM)
  useEffect(() => { loadSpec(); }, [loadSpec]);
  useEffect(() => { setEditData(null); setEditField(null); }, [sku, refreshKey]);

  const ensureEditData = async (): Promise<EditData | null> => {
    if (editData) return editData;
    try { const r = await apiFetch(`/api/product-attributes?sku=${encodeURIComponent(sku!)}`); const d = (await r.json()) as EditData; setEditData(d); return d; } catch { return null; }
  };
  const beginEdit = async (section: string, key: string) => {
    const d = await ensureEditData(); if (!d) return;
    setEditName("");
    if (section === "notes") setEditVal(d.parent?.work_instruction_notes ?? "");
    else if (section === "legacy") setEditVal(d.legacy[key] ?? "");
    else {
      const def = d.definitions.find((x) => x.id === key);
      const v = (section === "model" ? d.model_values : d.sku_values)[key];
      if (def && isSkuRef(def)) { setEditVal(v?.text_value ?? ""); setEditName((d.sku_labels?.[v?.text_value ?? ""] ?? v?.text_value ?? "").replace(/^\[[^\]]*\]\s*/, "")); }
      else if (def?.input_type === "many2one") setEditVal(v?.option_id ?? "");
      else if (def?.input_type === "multiselect") setEditVal(v?.option_ids ?? []);
      else if (def?.input_type === "number") setEditVal(v?.number_value != null ? String(v.number_value) : "");
      else if (def?.input_type === "boolean") setEditVal(v?.boolean_value ?? false);
      else setEditVal(v?.text_value ?? "");
    }
    setEditField({ section, key });
  };
  const saveField = async () => {
    if (!editField || !sku) return;
    const { section, key } = editField;
    const body: Record<string, unknown> = { sku };
    if (section === "notes") body.work_instruction_notes = String(editVal ?? "");
    else if (section === "legacy") body.legacy = { [key]: String(editVal ?? "") };
    else {
      const def = editData?.definitions.find((x) => x.id === key);
      const it = { definition_id: key, input_type: def && isSkuRef(def) ? "text" : (def?.input_type ?? "text"), value: editVal };
      if (section === "model") body.model = [it]; else body.sku_vals = [it];
    }
    setSavingField(true);
    try {
      const r = await apiFetch("/api/product-attributes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกแล้ว"); setEditField(null); setEditData(null); loadSpec();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSavingField(false); }
  };

  const editInput = (section: string, key: string) => {
    const cls = "w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
    if (section === "notes") return <textarea autoFocus value={String(editVal ?? "")} onChange={(e) => setEditVal(e.target.value)} rows={2} className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />;
    if (section === "legacy") return <input autoFocus value={String(editVal ?? "")} onChange={(e) => setEditVal(e.target.value)} className={cls} />;
    const def = editData?.definitions.find((x) => x.id === key);
    if (def && isLookup(def)) return <LookupSelect table={def.external_table as string} value={String(editVal ?? "")} onChange={(val) => setEditVal(val)} />;
    if (def && isSkuRef(def)) return <ComponentPicker sku={String(editVal ?? "")} name={editName} placeholder="— เลือกวัตถุดิบ —" allowedTags={def.relation_filter?.tags} onPick={(c) => { setEditVal(c.code); setEditName(c.name); }} />;
    if (def?.input_type === "many2one") return <select autoFocus value={String(editVal ?? "")} onChange={(e) => setEditVal(e.target.value)} className={cls}><option value="">— ไม่ระบุ —</option>{def.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
    if (def?.input_type === "multiselect") { const arr = (editVal as string[]) ?? []; return <div className="flex flex-wrap gap-1">{def.options.map((o) => { const on = arr.includes(o.id); return <button type="button" key={o.id} onClick={() => setEditVal(on ? arr.filter((x) => x !== o.id) : [...arr, o.id])} className={`text-[11px] px-1.5 py-0.5 rounded-full border ${on ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600"}`}>{o.label}</button>; })}</div>; }
    if (def?.input_type === "boolean") return <label className="flex items-center gap-1 text-xs h-8"><input type="checkbox" checked={!!editVal} onChange={(e) => setEditVal(e.target.checked)} className="rounded border-slate-300" /> ใช่</label>;
    if (def?.input_type === "number") return <input autoFocus type="number" value={String(editVal ?? "")} onChange={(e) => setEditVal(e.target.value)} className={cls} />;
    return <input autoFocus value={String(editVal ?? "")} onChange={(e) => setEditVal(e.target.value)} className={cls} />;
  };
  const specRow = (f: SpecField, section: string) => {
    const editing = editField?.section === section && editField?.key === f.key;
    if (editing) return (
      <div key={`${section}:${f.key}`} className="flex gap-2 text-xs py-1 items-start">
        <span className="text-slate-400 w-28 shrink-0 pt-1.5">{f.label}</span>
        <div className="flex-1 min-w-0">{editInput(section, f.key)}</div>
        <button type="button" onClick={saveField} disabled={savingField} title="บันทึก" className="shrink-0 h-7 w-7 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-40">✓</button>
        <button type="button" onClick={() => setEditField(null)} disabled={savingField} title="ยกเลิก" className="shrink-0 h-7 w-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded">✕</button>
      </div>
    );
    return <Row key={`${section}:${f.key}`} f={f} bomSkus={bomSkus} onEdit={editable ? () => beginEdit(section, f.key) : undefined} />;
  };

  if (!sku) return null;
  const empty = spec && !spec.parent && spec.legacy.length === 0 && spec.model_attrs.length === 0 && spec.sku_attrs.length === 0 && (spec.bom_materials?.length ?? 0) === 0;
  const notesEditing = editField?.section === "notes";
  const missing = onAddMaterials && bomSkus
    ? [...(spec?.model_attrs ?? []), ...(spec?.sku_attrs ?? [])].filter((f) => f.sku_code && !bomSkus.includes(f.sku_code)).map((f) => ({ code: f.sku_code as string, name: f.value }))
    : [];
  const missingUniq = [...new Map(missing.map((m) => [m.code, m])).values()];

  return (
    <div className={`border border-slate-200 rounded-lg bg-white ${className}`}>
      <div className="w-full flex items-center justify-between px-3 py-2 rounded-t-lg hover:bg-slate-50">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex-1 flex items-center gap-2 text-sm font-semibold text-slate-700 text-left">
          <span>📋 รายละเอียดสั่งงาน</span><span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
        </button>
        {editable && <button type="button" onClick={() => setEditOpen(true)} title="ลงรายละเอียดสินค้า" className="h-7 px-2.5 text-xs font-medium border border-slate-200 rounded-md text-slate-600 hover:bg-slate-100">✎ แก้ไขละเอียดสินค้า</button>}
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
          {loading ? <div className="text-xs text-slate-400 py-3 text-center">กำลังโหลด…</div>
          : empty || !spec ? <div className="text-xs text-slate-300 py-3 text-center">ยังไม่มีรายละเอียดสั่งงาน{editable ? " — กด ✎ แก้ไขละเอียดสินค้า เพื่อเพิ่ม" : ""}</div>
          : (
            <div className="space-y-2.5">
              {spec.parent && (
                <div className="flex gap-2 items-center">
                  {spec.parent.image_url && (
                    <span className="relative group/zoom shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spec.parent.image_url} alt="" className="w-12 h-12 rounded-md object-cover border border-slate-100 cursor-zoom-in" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spec.parent.image_url} alt="" className="hidden group-hover/zoom:block absolute z-50 left-0 top-14 w-56 h-56 object-contain rounded-lg border border-slate-200 bg-white shadow-xl p-1.5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{spec.parent.name ?? spec.parent.code}</div>
                    {spec.parent.size_summary && <div className="text-[11px] text-slate-400">ขนาด: {spec.parent.size_summary}</div>}
                  </div>
                </div>
              )}
              {(spec.model_attrs.length > 0 || spec.legacy.length > 0) && (
                <div><div className="text-[11px] font-semibold text-slate-500 mb-0.5">สเปกร่วม</div>
                  {spec.model_attrs.map((f) => specRow(f, "model"))}
                  {spec.legacy.map((f) => specRow(f, "legacy"))}
                </div>
              )}
              {spec.sku_attrs.length > 0 && <div className="pt-1 border-t border-slate-50"><div className="text-[11px] font-semibold text-slate-500 mb-0.5">วัตถุดิบ/รายละเอียดของรุ่นสีนี้</div>{spec.sku_attrs.map((f) => specRow(f, "sku"))}</div>}
              {(spec.bom_materials?.length ?? 0) > 0 && (
                <div className="pt-1 border-t border-slate-50">
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">วัตถุดิบ (จาก BOM{spec.bom_version ? ` ${spec.bom_version}` : ""})</div>
                  {spec.bom_materials.map((g) => (
                    <div key={g.slot} className="flex gap-2 text-xs py-0.5">
                      <span className="text-slate-400 w-28 shrink-0">{g.label}</span>
                      <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {g.items.map((it, i) => <span key={i} className="text-slate-700 truncate" title={it.name}>• {it.count > 1 ? `${it.name} (${it.count} บล็อก)` : it.name}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(spec.parent?.work_instruction_notes || editable) && (
                <div className="group pt-1 border-t border-slate-50">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[11px] font-semibold text-slate-500">วิธีทำ / หมายเหตุ</span>
                    {editable && !notesEditing && <button type="button" onClick={() => beginEdit("notes", "notes")} title="แก้ไข" className="h-5 w-5 flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100">✎</button>}
                  </div>
                  {notesEditing ? (
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">{editInput("notes", "notes")}</div>
                      <button type="button" onClick={saveField} disabled={savingField} className="shrink-0 h-7 w-7 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-40">✓</button>
                      <button type="button" onClick={() => setEditField(null)} className="shrink-0 h-7 w-7 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded">✕</button>
                    </div>
                  ) : <p className="text-xs text-slate-700 whitespace-pre-wrap">{spec.parent?.work_instruction_notes || <span className="text-slate-300">—</span>}</p>}
                </div>
              )}
            </div>
          )}
          {onAddMaterials && missingUniq.length > 0 && (
            <button type="button" onClick={() => onAddMaterials(missingUniq)}
              className="mt-2 w-full h-8 text-xs font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50">
              ➕ ดึงวัตถุดิบจากสเปกลง BOM ({missingUniq.length})
            </button>
          )}
        </div>
      )}
      {editOpen && <WorkInstructionEditor sku={sku} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); setEditData(null); loadSpec(); }} />}
    </div>
  );
}

// ===== ตัวแก้ไข (config-driven จาก product_attribute_definitions) =====
type EditData = {
  sku: { id: string; code: string };
  parent: { id: string; name: string | null; product_family: string | null; size_summary: string; work_instruction_notes: string } | null;
  families: string[]; definitions: AttrDef[];
  model_values: Record<string, AttrVal>; sku_values: Record<string, AttrVal>;
  legacy: Record<string, string>; sku_labels: Record<string, string>; error?: string;
};
const isSkuRef = (d: AttrDef) => d.external_table === "skus_v2";
const isLookup = (d: AttrDef) => !!d.external_table && d.external_table !== "skus_v2";

// dropdown ดึงตัวเลือกสดจากตารางหลัก (เช่น belt_tails) — เก็บค่าเป็นชื่อรายการ
function LookupSelect({ table, value, onChange }: { table: string; value: string; onChange: (v: string) => void }) {
  const [opts, setOpts] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => { apiFetch(`/api/admin/picker?table=${encodeURIComponent(table)}&label=name&limit=300`).then((r) => r.json()).then((j) => setOpts((j.data ?? []) as { id: string; label: string }[])).catch(() => {}); }, [table]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
      <option value="">— ไม่ระบุ —</option>
      {opts.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
      {value && !opts.some((o) => o.label === value) && <option value={value}>{value}</option>}
    </select>
  );
}
const LEGACY_LABELS: Record<string, string> = { materials: "วัตถุดิบ", lining: "ซับใน", zipper: "ซิป", strap: "สาย/สายสะพาย", thread: "ด้าย", spares: "อะไหล่", logo: "โลโก้/พิมพ์" };
// ป้ายประเภทสินค้า (ค่าใน DB → ชื่อไทย) + ประเภทที่ใช้ "ช่องกระเป๋า" (legacy) เป็นชุดฟิลด์
const FAMILY_LABELS: Record<string, string> = { belt: "เข็มขัด", bag: "กระเป๋า", "กระเป๋า": "กระเป๋า" };
const BAG_FAMILY = "กระเป๋า";

function initVal(def: AttrDef, v: AttrVal | undefined): unknown {
  if (def.input_type === "many2one") return v?.option_id ?? "";
  if (def.input_type === "multiselect") return v?.option_ids ?? [];
  if (def.input_type === "number") return v?.number_value != null ? String(v.number_value) : "";
  if (def.input_type === "boolean") return v?.boolean_value ?? false;
  return v?.text_value ?? "";
}

function WorkInstructionEditor({ sku, onClose, onSaved }: { sku: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<EditData | null>(null);
  const [family, setFamily] = useState("");
  const [vals, setVals] = useState<Record<string, unknown>>({});   // key = scope+":"+defId
  const [skuNames, setSkuNames] = useState<Record<string, string>>({});   // key → ชื่อ SKU ที่เลือก (โชว์ในตัวเลือก)
  const [legacy, setLegacy] = useState<Record<string, string>>({});
  const [size, setSize] = useState(""); const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/product-attributes?sku=${encodeURIComponent(sku)}`).then((r) => r.json()).then((d: EditData) => {
      if (d.error) { toast.error(d.error); return; }
      setData(d);
      // ประเภทเริ่มต้น = ตามที่บันทึกไว้ (ถ้ามี) ไม่งั้น "ไม่ระบุ"
      setFamily(d.parent?.product_family ?? "");
      const init: Record<string, unknown> = {}; const names: Record<string, string> = {};
      for (const def of d.definitions) {
        const k = `${def.scope}:${def.id}`;
        const cur = (def.scope === "model" ? d.model_values : d.sku_values)[def.id];
        init[k] = isSkuRef(def) ? (cur?.text_value ?? "") : initVal(def, cur);
        if (isSkuRef(def) && cur?.text_value) names[k] = (d.sku_labels?.[cur.text_value] ?? cur.text_value).replace(/^\[[^\]]*\]\s*/, "");
      }
      setVals(init); setSkuNames(names);
      setLegacy({ ...d.legacy }); setSize(d.parent?.size_summary ?? ""); setNotes(d.parent?.work_instruction_notes ?? "");
    }).catch(() => toast.error("โหลดไม่สำเร็จ"));
  }, [sku]); // eslint-disable-line react-hooks/exhaustive-deps

  const defsOf = (scope: string) => (data?.definitions ?? []).filter((d) => d.scope === scope && d.product_family === family).sort((a, b) => a.display_order - b.display_order);
  const setV = (k: string, v: unknown) => setVals((s) => ({ ...s, [k]: v }));
  // เลือกฟิลด์ lookup ที่เป็น "เทมเพลต" → ดึงค่าสำเร็จเติมฟิลด์อื่น (เช่น รูปแบบเข็มขัด → เจาะรู/ห่วง/ปลายหาง/ไซส์)
  const cascadeFrom = async (def: AttrDef, val: string) => {
    if (!val || !def.external_table) return;
    try {
      const res = await apiFetch(`/api/bom/lookup-cascade?table=${encodeURIComponent(def.external_table)}&value=${encodeURIComponent(val)}`);
      const j = await res.json();
      const fields = (j.fields ?? {}) as Record<string, string>;
      const keys = Object.keys(fields);
      if (!keys.length) return;
      setVals((prev) => {
        const next = { ...prev };
        for (const fk of keys) { const d = (data?.definitions ?? []).find((x) => x.key === fk); if (d) next[`${d.scope}:${d.id}`] = fields[fk]; }
        return next;
      });
      toast.success("ดึงค่าจากรูปแบบให้แล้ว");
    } catch { /* ignore */ }
  };
  // ประเภทนี้มี "ชุดฟิลด์" เฉพาะไหม (เช่น belt) → ถ้ามี ซ่อนช่องกระเป๋า · ถ้าไม่มี (กระเป๋า/ไม่ระบุ) ใช้ช่องกระเป๋า
  const hasFieldSet = defsOf("model").length > 0 || defsOf("sku").length > 0;
  // ตัวเลือกประเภท: รวม "กระเป๋า" (built-in) + ประเภทที่มีชุดฟิลด์ + ประเภทที่บันทึกไว้ปัจจุบัน
  const familyOptions = [...new Set([BAG_FAMILY, ...(data?.families ?? []), family].filter(Boolean) as string[])];

  const renderInput = (def: AttrDef, scope: string) => {
    const k = `${scope}:${def.id}`; const v = vals[k];
    const cls = "w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
    if (isLookup(def)) return <LookupSelect table={def.external_table as string} value={String(v ?? "")} onChange={(val) => { setV(k, val); void cascadeFrom(def, val); }} />;
    if (isSkuRef(def)) return <ComponentPicker sku={String(v ?? "")} name={skuNames[k] ?? ""} placeholder="— เลือกวัตถุดิบ —" allowedTags={def.relation_filter?.tags}
      onPick={(c) => { setV(k, c.code); setSkuNames((s) => ({ ...s, [k]: c.name })); }} />;
    if (def.input_type === "many2one") return <select value={String(v ?? "")} onChange={(e) => setV(k, e.target.value)} className={cls}><option value="">— ไม่ระบุ —</option>{def.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
    if (def.input_type === "multiselect") { const arr = (v as string[]) ?? []; return <div className="flex flex-wrap gap-1.5 pt-1">{def.options.map((o) => { const on = arr.includes(o.id); return <button type="button" key={o.id} onClick={() => setV(k, on ? arr.filter((x) => x !== o.id) : [...arr, o.id])} className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-blue-50 border-blue-300 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{o.label}</button>; })}{def.options.length === 0 && <span className="text-[11px] text-slate-300">ยังไม่มีตัวเลือก</span>}</div>; }
    if (def.input_type === "number") return <input type="number" value={String(v ?? "")} onChange={(e) => setV(k, e.target.value)} className={cls} />;
    if (def.input_type === "boolean") return <label className="flex items-center gap-2 text-sm text-slate-600 h-8"><input type="checkbox" checked={!!v} onChange={(e) => setV(k, e.target.checked)} className="rounded border-slate-300" /> ใช่</label>;
    return <input value={String(v ?? "")} onChange={(e) => setV(k, e.target.value)} className={cls} />;
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    const model = defsOf("model").map((d) => ({ definition_id: d.id, input_type: isSkuRef(d) ? "text" : d.input_type, value: vals[`model:${d.id}`] }));
    const sku_vals = defsOf("sku").map((d) => ({ definition_id: d.id, input_type: isSkuRef(d) ? "text" : d.input_type, value: vals[`sku:${d.id}`] }));
    try {
      const res = await apiFetch("/api/product-attributes", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, family, size_summary: size, work_instruction_notes: notes, legacy, model, sku_vals }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกรายละเอียดสั่งงานแล้ว"); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={() => !saving && onClose()} size="lg" title="✎ แก้รายละเอียดสั่งงาน"
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={save} disabled={saving || !data} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
      </>}>
      {!data ? <div className="py-10 text-center text-slate-400">กำลังโหลด…</div> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-[11px] text-slate-500">ประเภทสินค้า (ชุดฟิลด์)</span>
              <select value={family} onChange={(e) => setFamily(e.target.value)} className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— ไม่ระบุ —</option>{familyOptions.map((f) => <option key={f} value={f}>{FAMILY_LABELS[f] ?? f}</option>)}
              </select>
              <a href="/admin/attribute-fields" target="_blank" rel="noopener" className="text-[11px] text-blue-600 hover:underline mt-0.5 inline-block">⚙️ เพิ่ม/แก้ฟิลด์ของประเภทนี้ →</a>
            </label>
            <label className="block"><span className="text-[11px] text-slate-500">ขนาด (สรุป)</span>
              <input value={size} onChange={(e) => setSize(e.target.value)} className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
          </div>

          {family && defsOf("model").length > 0 && (
            <div className="border border-slate-100 rounded-lg p-2.5">
              <div className="text-xs font-semibold text-slate-600 mb-1.5">สเปกร่วม (ใช้ทุกสี)</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">{defsOf("model").map((d) => <div key={d.id}><span className="text-[11px] text-slate-500">{d.label}</span><div className="mt-0.5">{renderInput(d, "model")}</div></div>)}</div>
            </div>
          )}
          {family && defsOf("sku").length > 0 && (
            <div className="border border-slate-100 rounded-lg p-2.5">
              <div className="text-xs font-semibold text-slate-600 mb-1.5">วัตถุดิบ/รายละเอียดของรุ่นสีนี้</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">{defsOf("sku").map((d) => <div key={d.id}><span className="text-[11px] text-slate-500">{d.label}</span><div className="mt-0.5">{renderInput(d, "sku")}</div></div>)}</div>
            </div>
          )}

          {/* ช่องกระเป๋า — โชว์เฉพาะประเภทที่ยังไม่มีชุดฟิลด์เฉพาะ (กระเป๋า / ไม่ระบุ) · ประเภทอย่าง belt จะไม่เห็น */}
          {!hasFieldSet && (
            <div className="border border-slate-100 rounded-lg p-2.5">
              <div className="text-xs font-semibold text-slate-600 mb-1.5">รายละเอียดกระเป๋า (วัตถุดิบหลัก)</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">{Object.keys(LEGACY_LABELS).map((c) => <div key={c}><span className="text-[11px] text-slate-500">{LEGACY_LABELS[c]}</span><input value={legacy[c] ?? ""} onChange={(e) => setLegacy((s) => ({ ...s, [c]: e.target.value }))} className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>)}</div>
            </div>
          )}

          <label className="block"><span className="text-[11px] text-slate-500">วิธีทำ / หมายเหตุ</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></label>
        </div>
      )}
    </ERPModal>
  );
}
