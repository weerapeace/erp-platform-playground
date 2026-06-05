"use client";

/**
 * FieldCreatorModal (กลุ่ม C) — เพิ่ม field ใหม่จากเว็บ → สร้าง column จริงใน Supabase
 *
 * รองรับ: text/textarea/number/date/boolean/select/image/relation(many2one)
 * relation: เลือก table ปลายทางจาก Supabase (โหลดจาก /api/admin/schema/tables)
 *
 * ปลอดภัย: DDL ทำที่ server ผ่าน SECURITY DEFINER + allowlist (เฉพาะ table ที่เป็น module)
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useBackdropDismiss } from "@/components/modal";
import { validateFormula } from "@/lib/formula";

const TYPES: { v: string; label: string; hint: string }[] = [
  { v: "text",     label: "ข้อความ (Text)",        hint: "ตัวอักษรสั้น" },
  { v: "textarea", label: "ข้อความยาว (Textarea)", hint: "หลายบรรทัด" },
  { v: "number",   label: "ตัวเลข (Number)",        hint: "จำนวน/ราคา" },
  { v: "date",     label: "วันที่ (Date)",          hint: "" },
  { v: "boolean",  label: "ใช่/ไม่ใช่ (Boolean)",   hint: "" },
  { v: "select",   label: "ตัวเลือก (Select)",      hint: "กำหนดตัวเลือกเอง" },
  { v: "image",    label: "รูปภาพ (Image)",         hint: "เก็บใน R2" },
  { v: "relation", label: "เชื่อมตาราง 1 ค่า (many2one)", hint: "ลิงก์ไปอีก table" },
  { v: "many2many", label: "เชื่อมหลายค่า (many2many)", hint: "เลือกได้หลายรายการ" },
  { v: "one2many", label: "รายการลูก (one2many)", hint: "ดูระเบียนที่ชี้กลับมา" },
  { v: "related",  label: "ดึงค่าจากตารางที่เชื่อม (related)", hint: "โชว์ค่าจาก table อื่น (อ่านอย่างเดียว)" },
  { v: "computed", label: "ช่องคำนวณ (Computed)", hint: "คำนวณจากช่องอื่นด้วยสูตร เช่น qty × price" },
];

const REL_TYPES = ["relation", "many2many", "one2many"];

// สิทธิ์ตามตำแหน่ง (admin เห็น/แก้ได้เสมอ จึงไม่อยู่ในรายการ)
const PERM_ROLES = [
  { key: "manager", label: "ผู้จัดการ" },
  { key: "staff",   label: "พนักงาน" },
  { key: "viewer",  label: "ผู้ชม" },
];
const COND_OPS = [
  { v: "=",        label: "เท่ากับ" },
  { v: "!=",       label: "ไม่เท่ากับ" },
  { v: "is_set",   label: "มีค่า (กรอกแล้ว)" },
  { v: "is_empty", label: "ไม่มีค่า (ว่าง)" },
];

type TableOpt = { table_name: string; is_module: boolean };
type RelFieldOpt = { key: string; column: string; label: string; targetTable: string; targetModuleKey: string };
type TargetFieldOpt = { column: string; label: string };
type NumFieldOpt = { column: string; label: string };
// computed builder — แต่ละ "ขั้น" ในสูตรแบบง่าย
type Term = { kind: "field" | "number"; value: string; op: string };

const OPERATORS = [
  { v: "*", label: "× (คูณ)" },
  { v: "/", label: "÷ (หาร)" },
  { v: "+", label: "+ (บวก)" },
  { v: "-", label: "− (ลบ)" },
];

/** แปลง terms (โหมดง่าย) → สตริงสูตร เช่น "qty * price_est" */
function buildFormula(terms: Term[]): string {
  return terms
    .filter((t) => (t.kind === "number" ? t.value.trim() !== "" : t.value !== ""))
    .map((t, i) => {
      const operand = t.kind === "number" ? t.value.trim() : t.value;
      return i === 0 ? operand : `${t.op || "*"} ${operand}`;
    })
    .join(" ");
}

export function FieldCreatorModal({
  moduleKey, moduleTitle, onClose, onCreated,
}: {
  moduleKey: string;
  moduleTitle: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel]       = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [uiType, setUiType]     = useState("text");
  const [options, setOptions] = useState<string[]>([""]);   // ตัวเลือก Select — เพิ่มทีละรายการ
  const [targetTable, setTargetTable] = useState("");
  const [targetLabelField, setTargetLabelField] = useState("name");
  const [targetFkColumn, setTargetFkColumn] = useState("");
  const [isVisible, setIsVisible]       = useState(true);
  const [isFilterable, setIsFilterable] = useState(false);
  const [isSearchable, setIsSearchable] = useState(false);
  const [tables, setTables] = useState<TableOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // related: เลือกผ่านความสัมพันธ์ที่มีอยู่ + field ปลายทางที่จะดึงมาโชว์
  const [relFields, setRelFields] = useState<RelFieldOpt[]>([]);
  const [viaField, setViaField] = useState("");
  const [targetFields, setTargetFields] = useState<TargetFieldOpt[]>([]);
  const [relatedTargetField, setRelatedTargetField] = useState("");
  // computed: สูตร + รูปแบบ + field ในโมดูลนี้ (สำหรับ insert เข้าสูตร)
  const [formula, setFormula] = useState("");
  const [computeFormat, setComputeFormat] = useState("number");
  const [computeDecimals, setComputeDecimals] = useState(2);
  const [computeSummary, setComputeSummary] = useState(false);
  const [numFields, setNumFields] = useState<NumFieldOpt[]>([]);
  // computed builder: โหมดง่าย (dropdown) vs ขั้นสูง (พิมพ์สูตร)
  const [formulaMode, setFormulaMode] = useState<"simple" | "advanced">("simple");
  const [terms, setTerms] = useState<Term[]>([
    { kind: "field", value: "", op: "*" },
    { kind: "field", value: "", op: "*" },
  ]);

  // ── ตั้งค่าเพิ่มเติม (advanced) ──
  const [showAdv, setShowAdv] = useState(false);
  const [isRequired, setIsRequired]   = useState(false);
  const [isEditable, setIsEditable]   = useState(true);
  const [isInline, setIsInline]       = useState(false);
  const [isBulk, setIsBulk]           = useState(true);
  const [showInForm, setShowInForm]   = useState(true);
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitivePerm, setSensitivePerm] = useState("products.cost.view");
  const [viewRoles, setViewRoles] = useState<string[]>([]);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [helpText, setHelpText]   = useState("");
  const [note, setNote]           = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [width, setWidth]         = useState(150);
  const [valCatalog, setValCatalog] = useState<{ rule_key: string; label: string }[]>([]);
  const [selVal, setSelVal]       = useState<string[]>([]);
  const [advFields, setAdvFields] = useState<{ value: string; label: string }[]>([]);
  const [condField, setCondField] = useState("");
  const [condOp, setCondOp]       = useState("=");
  const [condValue, setCondValue] = useState("");

  // โหลดแคตตาล็อก validation + รายชื่อ field อื่น (สำหรับเงื่อนไขแสดง) ครั้งเดียว
  useEffect(() => {
    apiFetch("/api/validation-rules").then((r) => r.json()).then((j) => {
      const arr = (Array.isArray(j) ? j : j.data ?? []) as Record<string, unknown>[];
      setValCatalog(arr.filter((x) => x.rule_key).map((x) => ({ rule_key: String(x.rule_key), label: String(x.label ?? x.rule_key) })));
    }).catch(() => {});
    apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then((r) => r.json()).then((j) => {
      setAdvFields(((j.fields ?? []) as Record<string, unknown>[])
        .filter((f) => f.column_name)
        .map((f) => ({ value: String(f.column_name), label: String(f.field_label ?? f.column_name) })));
    }).catch(() => {});
  }, [moduleKey]);

  // auto-gen field_key จาก label (snake_case) จนกว่าจะแก้เอง
  useEffect(() => {
    if (keyEdited) return;
    const k = label.trim().toLowerCase()
      .replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_").replace(/^[^a-z]+/, "");
    setFieldKey(k);
  }, [label, keyEdited]);

  // โหลดรายชื่อ table เมื่อเลือกชนิด relation (m2o/m2m/o2m)
  useEffect(() => {
    if (!REL_TYPES.includes(uiType) || tables.length > 0) return;
    apiFetch("/api/admin/schema/tables").then(r => r.json()).then(j => {
      if (!j.error) setTables(j.tables ?? []);
    }).catch(() => {});
  }, [uiType, tables.length]);

  // related: โหลด field ความสัมพันธ์ (many2one) ที่มีอยู่ใน module นี้
  useEffect(() => {
    if (uiType !== "related") return;
    apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then(r => r.json()).then(j => {
      const rels: RelFieldOpt[] = (j.fields ?? [])
        .filter((f: Record<string, unknown>) => f.ui_field_type === "relation" && (f.relation_config as Record<string, unknown>)?.target_module_key)
        .map((f: Record<string, unknown>) => {
          const rc = f.relation_config as Record<string, unknown>;
          return { key: String(f.field_key), column: String(f.column_name ?? f.field_key), label: String(f.field_label),
            targetTable: String(rc.target_table ?? ""), targetModuleKey: String(rc.target_module_key ?? "") };
        });
      setRelFields(rels);
    }).catch(() => {});
  }, [uiType, moduleKey]);

  // related: เมื่อเลือกความสัมพันธ์แล้ว โหลด field ของตารางปลายทางให้เลือกว่าจะดึงอันไหนมาโชว์
  useEffect(() => {
    const vf = relFields.find(r => r.key === viaField);
    if (!vf) { setTargetFields([]); return; }
    apiFetch(`/api/admin/field-registry-v2?module=${vf.targetModuleKey}`).then(r => r.json()).then(j => {
      setTargetFields((j.fields ?? [])
        .filter((f: Record<string, unknown>) => f.column_name)
        .map((f: Record<string, unknown>) => ({ column: String(f.column_name), label: String(f.field_label) })));
    }).catch(() => {});
  }, [viaField, relFields]);

  // computed: โหลด field ของโมดูลนี้มาเป็นปุ่มกดใส่สูตร (เน้น number — แต่โชว์ทุก field ที่มี column)
  useEffect(() => {
    if (uiType !== "computed") return;
    apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then(r => r.json()).then(j => {
      setNumFields((j.fields ?? [])
        .filter((f: Record<string, unknown>) => f.column_name && (f.ui_field_type === "number" || f.data_type === "numeric" || f.data_type === "number" || f.ui_field_type === "currency"))
        .map((f: Record<string, unknown>) => ({ column: String(f.column_name), label: String(f.field_label) })));
    }).catch(() => {});
  }, [uiType, moduleKey]);

  // โหมดง่าย: terms เปลี่ยน → สร้างสูตรอัตโนมัติ
  useEffect(() => {
    if (uiType === "computed" && formulaMode === "simple") setFormula(buildFormula(terms));
  }, [terms, formulaMode, uiType]);

  const insertToken = (tok: string) => setFormula(prev => (prev && !prev.endsWith(" ") ? prev + " " : prev) + tok + " ");
  // helpers สำหรับ builder โหมดง่าย
  const updateTerm = (i: number, patch: Partial<Term>) => setTerms(ts => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const addTerm = () => setTerms(ts => [...ts, { kind: "field", value: "", op: "*" }]);
  const removeTerm = (i: number) => setTerms(ts => ts.length > 1 ? ts.filter((_, j) => j !== i) : ts);

  const submit = async () => {
    setErr(null);
    if (!label.trim() || !fieldKey.trim()) { setErr("กรอกชื่อ field และ label"); return; }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(fieldKey)) { setErr("ชื่อ field: a-z, 0-9, _ เริ่มด้วยตัวอักษร"); return; }
    const isRel = REL_TYPES.includes(uiType);
    if (isRel && !targetTable) { setErr("เลือก table ปลายทาง"); return; }
    if (uiType === "one2many" && !targetFkColumn.trim()) { setErr("ระบุ column FK บน target ที่ชี้กลับมา"); return; }
    const vf = relFields.find(r => r.key === viaField);
    if (uiType === "related" && (!viaField || !relatedTargetField)) { setErr("เลือกความสัมพันธ์ + field ที่จะดึงมาโชว์"); return; }
    if (uiType === "computed") {
      const fErr = validateFormula(formula);
      if (fErr) { setErr(fErr); return; }
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/schema/add-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_key: moduleKey, field_key: fieldKey, label: label.trim(), ui_type: uiType,
          target_table: uiType === "related" ? vf?.targetTable : (isRel ? targetTable : undefined),
          target_label_field: isRel ? targetLabelField : undefined,
          target_fk_column: uiType === "one2many" ? targetFkColumn.trim() : undefined,
          // related
          via_field:    uiType === "related" ? viaField : undefined,
          via_column:   uiType === "related" ? vf?.column : undefined,
          target_field: uiType === "related" ? relatedTargetField : undefined,
          // computed
          formula:          uiType === "computed" ? formula.trim() : undefined,
          compute_format:   uiType === "computed" ? computeFormat : undefined,
          compute_decimals: uiType === "computed" ? computeDecimals : undefined,
          compute_summary:  uiType === "computed" ? computeSummary : undefined,
          options: uiType === "select" ? options.map(s => s.trim()).filter(Boolean) : undefined,
          is_visible: isVisible, is_filterable: isFilterable, is_searchable: isSearchable,
          // ── ตั้งค่าเพิ่มเติม ──
          is_required: isRequired,
          is_editable: isEditable,
          is_inline_editable: isInline,
          is_bulk_editable: isBulk,
          show_in_form: showInForm,
          is_sensitive: isSensitive,
          sensitive_permission: isSensitive ? (sensitivePerm.trim() || null) : null,
          view_roles: viewRoles.length ? viewRoles : null,
          edit_roles: editRoles.length ? editRoles : null,
          help_text: helpText.trim() || null,
          description: note.trim() || null,
          default_value: defaultValue.trim() || null,
          width,
          validation_rules: selVal.length ? { rules: selVal } : {},
          condition_rules: condField ? { show_if: { field: condField, operator: condOp, value: condValue } } : {},
        }),
      });
      const json = await res.json();
      if (json.error) { setErr(json.error); return; }
      onCreated();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally { setSaving(false); }
  };

  const dismiss = useBackdropDismiss(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" {...dismiss}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">＋ เพิ่ม Field ใหม่</h3>
            <p className="text-xs text-slate-500 mt-0.5">{moduleTitle} — {["computed", "related", "many2many", "one2many"].includes(uiType) ? "field เสมือน (ไม่สร้าง column จริง)" : "จะสร้าง column จริงใน Supabase"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">ชื่อที่แสดง (label) *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="เช่น สีหลัก"
              className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">ชื่อ field (อังกฤษ) *</label>
            <input value={fieldKey} onChange={e => { setKeyEdited(true); setFieldKey(e.target.value); }} placeholder="เช่น main_color"
              className="mt-1 w-full h-9 px-3 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <p className="text-[11px] text-slate-400 mt-0.5">a-z, 0-9, _ เท่านั้น (จะเป็นชื่อ column จริง)</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">ชนิด field *</label>
            <select value={uiType} onChange={e => setUiType(e.target.value)}
              className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
              {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}{t.hint ? ` — ${t.hint}` : ""}</option>)}
            </select>
          </div>

          {uiType === "select" && (
            <div>
              <label className="text-xs font-medium text-slate-600">ตัวเลือก</label>
              <div className="mt-1 space-y-1.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-5 text-right">{i + 1}.</span>
                    <input value={opt} autoFocus={i === options.length - 1 && options.length > 1}
                      onChange={e => setOptions(p => p.map((o, j) => j === i ? e.target.value : o))}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setOptions(p => [...p, ""]); } }}
                      placeholder={`ตัวเลือกที่ ${i + 1}`}
                      className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    <button type="button" onClick={() => setOptions(p => p.length > 1 ? p.filter((_, j) => j !== i) : [""])}
                      className="w-8 h-8 flex-shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md" title="ลบ">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setOptions(p => [...p, ""])}
                className="mt-2 h-8 px-3 text-xs font-medium border border-dashed border-emerald-300 text-emerald-700 rounded-md hover:bg-emerald-50">
                ＋ เพิ่มตัวเลือก
              </button>
              <p className="mt-1 text-[11px] text-slate-400">กด Enter เพื่อเพิ่มแถวถัดไปได้</p>
            </div>
          )}

          {REL_TYPES.includes(uiType) && (
            <div className="space-y-3 p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg">
              <div>
                <label className="text-xs font-medium text-slate-600">เชื่อมไป table ไหน *</label>
                <select value={targetTable} onChange={e => setTargetTable(e.target.value)}
                  className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="">— เลือก table —</option>
                  {tables.map(t => <option key={t.table_name} value={t.table_name}>{t.table_name}{t.is_module ? " ⭐" : ""}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-0.5">⭐ = มีหน้าจัดการในเว็บแล้ว (picker ดึงรายการได้)</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">ใช้ field ไหนเป็นชื่อแสดง</label>
                <input value={targetLabelField} onChange={e => setTargetLabelField(e.target.value)} placeholder="name"
                  className="mt-1 w-full h-9 px-3 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              {uiType === "one2many" && (
                <div>
                  <label className="text-xs font-medium text-slate-600">column FK บน target ที่ชี้กลับมา *</label>
                  <input value={targetFkColumn} onChange={e => setTargetFkColumn(e.target.value)} placeholder="เช่น order_id"
                    className="mt-1 w-full h-9 px-3 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                  <p className="text-[11px] text-slate-400 mt-0.5">column ใน target ที่เก็บ id ของระเบียนนี้ (ปลายของ many2one)</p>
                </div>
              )}
              {uiType === "many2many" && (
                <p className="text-[11px] text-emerald-700">จะสร้างตารางเชื่อม (junction) ให้อัตโนมัติ + เลือกได้หลายค่า</p>
              )}
            </div>
          )}

          {uiType === "related" && (
            <div className="space-y-3 p-3 bg-sky-50/60 border border-sky-100 rounded-lg">
              <p className="text-[11px] text-sky-700">ดึงค่าจากตารางอื่นมาโชว์ (อ่านอย่างเดียว) ผ่านความสัมพันธ์ที่มีอยู่แล้วใน module นี้</p>
              <div>
                <label className="text-xs font-medium text-slate-600">ผ่านความสัมพันธ์ *</label>
                <select value={viaField} onChange={e => { setViaField(e.target.value); setRelatedTargetField(""); }}
                  className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-500">
                  <option value="">— เลือกความสัมพันธ์ —</option>
                  {relFields.map(r => <option key={r.key} value={r.key}>{r.label} → {r.targetTable}</option>)}
                </select>
                {relFields.length === 0 && <p className="text-[11px] text-amber-600 mt-0.5">module นี้ยังไม่มี field ความสัมพันธ์ (many2one) — สร้างก่อนถึงจะดึง related ได้</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">เอา field ไหนมาโชว์ *</label>
                <select value={relatedTargetField} onChange={e => setRelatedTargetField(e.target.value)} disabled={!viaField}
                  className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-sky-500">
                  <option value="">— เลือก field ปลายทาง —</option>
                  {targetFields.map(t => <option key={t.column} value={t.column}>{t.label} ({t.column})</option>)}
                </select>
              </div>
            </div>
          )}

          {uiType === "computed" && (
            <div className="space-y-3 p-3 bg-violet-50/60 border border-violet-100 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-violet-700">ช่องคำนวณอัตโนมัติ (อ่านอย่างเดียว ไม่สร้าง column จริง)</p>
                {/* สลับโหมด ง่าย / สูตร */}
                <div className="flex rounded-md border border-violet-200 overflow-hidden text-[11px]">
                  <button type="button" onClick={() => setFormulaMode("simple")}
                    className={`px-2 py-1 ${formulaMode === "simple" ? "bg-violet-600 text-white" : "bg-white text-violet-700"}`}>เลือกจากช่อง</button>
                  <button type="button" onClick={() => setFormulaMode("advanced")}
                    className={`px-2 py-1 ${formulaMode === "advanced" ? "bg-violet-600 text-white" : "bg-white text-violet-700"}`}>พิมพ์สูตรเอง</button>
                </div>
              </div>

              {formulaMode === "simple" ? (
                <div className="space-y-2">
                  {terms.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {/* เครื่องหมายระหว่างขั้น (ขั้นแรกไม่มี) */}
                      {i === 0 ? (
                        <span className="w-16 text-xs text-slate-400 flex-shrink-0">เริ่มจาก</span>
                      ) : (
                        <select value={t.op} onChange={e => updateTerm(i, { op: e.target.value })}
                          className="w-16 h-9 px-1 text-sm border border-slate-200 rounded-md bg-white flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-violet-500">
                          {OPERATORS.map(o => <option key={o.v} value={o.v}>{o.label.split(" ")[0]}</option>)}
                        </select>
                      )}
                      {/* ชนิด operand: ช่อง / ตัวเลข */}
                      <select value={t.kind} onChange={e => updateTerm(i, { kind: e.target.value as Term["kind"], value: "" })}
                        className="w-20 h-9 px-1 text-sm border border-slate-200 rounded-md bg-white flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-violet-500">
                        <option value="field">ช่อง</option>
                        <option value="number">ตัวเลข</option>
                      </select>
                      {/* ค่า: dropdown ช่อง หรือ input ตัวเลข */}
                      {t.kind === "field" ? (
                        <select value={t.value} onChange={e => updateTerm(i, { value: e.target.value })}
                          className="flex-1 min-w-0 h-9 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-violet-500">
                          <option value="">— เลือกช่อง —</option>
                          {numFields.map(nf => <option key={nf.column} value={nf.column}>{nf.label}</option>)}
                        </select>
                      ) : (
                        <input type="number" step="any" value={t.value} onChange={e => updateTerm(i, { value: e.target.value })}
                          placeholder="เช่น 1.07"
                          className="flex-1 min-w-0 h-9 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      )}
                      {terms.length > 1 && (
                        <button type="button" onClick={() => removeTerm(i)} title="ลบขั้นนี้"
                          className="w-7 h-9 flex-shrink-0 text-slate-300 hover:text-red-500">✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addTerm}
                    className="text-xs text-violet-700 hover:text-violet-900 font-medium">＋ เพิ่มขั้น</button>
                  {numFields.length === 0 && <p className="text-[11px] text-amber-600">module นี้ยังไม่มีช่องตัวเลข — เลือก &quot;ตัวเลข&quot; เพื่อพิมพ์ค่าเอง หรือเพิ่มช่องตัวเลขก่อน</p>}
                  {/* preview สูตรที่ได้ */}
                  <div className="text-[11px] text-slate-500">สูตรที่ได้: <code className="font-mono text-slate-700">{formula || "—"}</code></div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-600">สูตร *</label>
                  <textarea value={formula} onChange={e => setFormula(e.target.value)} rows={2}
                    placeholder="เช่น  qty * price_est"
                    className="mt-1 w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  <p className="text-[11px] text-slate-400 mt-0.5">ใช้ได้: + − × (*) ÷ (/) วงเล็บ ( ) และ round() abs() min() max()</p>
                  {numFields.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {numFields.map(nf => (
                        <button key={nf.column} type="button" onClick={() => insertToken(nf.column)}
                          className="px-2 py-0.5 text-[11px] font-mono bg-white border border-violet-200 rounded text-violet-700 hover:bg-violet-100" title={nf.label}>
                          {nf.column}
                        </button>
                      ))}
                      {["*", "/", "+", "-", "(", ")"].map(op => (
                        <button key={op} type="button" onClick={() => insertToken(op)}
                          className="px-2 py-0.5 text-[11px] font-mono bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100">
                          {op}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600">รูปแบบ</label>
                  <select value={computeFormat} onChange={e => setComputeFormat(e.target.value)}
                    className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-violet-500">
                    <option value="number">ตัวเลข</option>
                    <option value="currency">เงิน (มีคอมมา)</option>
                    <option value="percent">เปอร์เซ็นต์ (%)</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-slate-600">ทศนิยม</label>
                  <input type="number" min={0} max={6} value={computeDecimals} onChange={e => setComputeDecimals(Math.max(0, Math.min(6, Number(e.target.value))))}
                    className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={computeSummary} onChange={e => setComputeSummary(e.target.checked)} /> แสดงผลรวม (sum) ท้ายตาราง
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isVisible} onChange={e => setIsVisible(e.target.checked)} /> โชว์ในตาราง</label>
            {uiType !== "computed" && uiType !== "related" && <>
              <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isFilterable} onChange={e => setIsFilterable(e.target.checked)} /> กรองได้</label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isSearchable} onChange={e => setIsSearchable(e.target.checked)} /> ค้นหาได้</label>
            </>}
          </div>

          {/* ───────── ตั้งค่าเพิ่มเติม (advanced) ───────── */}
          <div className="border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setShowAdv(v => !v)}
              className="text-sm font-medium text-slate-600 hover:text-slate-800 flex items-center gap-1">
              <span className="text-xs">{showAdv ? "▾" : "▸"}</span> ตั้งค่าเพิ่มเติม (ไม่บังคับ)
            </button>

            {showAdv && (
              <div className="mt-3 space-y-4">
                {/* คุณสมบัติ */}
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} /> บังคับกรอก (require)</label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={showInForm} onChange={e => setShowInForm(e.target.checked)} /> แสดงในฟอร์ม</label>
                  {uiType !== "computed" && uiType !== "related" && <>
                    <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isEditable} onChange={e => setIsEditable(e.target.checked)} /> แก้ไขได้</label>
                    <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isInline} onChange={e => setIsInline(e.target.checked)} /> แก้เร็วในตาราง (quick edit)</label>
                    <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isBulk} onChange={e => setIsBulk(e.target.checked)} /> แก้หลายรายการ (bulk)</label>
                  </>}
                </div>

                {/* ข้อมูลอ่อนไหว */}
                {uiType !== "computed" && uiType !== "related" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" className="accent-red-500" checked={isSensitive} onChange={e => setIsSensitive(e.target.checked)} /> 🔒 ข้อมูลอ่อนไหว</label>
                    {isSensitive && (
                      <input value={sensitivePerm} onChange={e => setSensitivePerm(e.target.value)} placeholder="permission key เช่น products.cost.view"
                        className="flex-1 min-w-[180px] h-9 px-3 text-sm font-mono border border-slate-200 rounded-md" />
                    )}
                  </div>
                )}

                {/* สิทธิ์ตามตำแหน่ง (role) */}
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2">
                  <p className="text-[11px] text-slate-500">สิทธิ์ตามตำแหน่ง — ว่าง = ทุกคน · admin เห็น/แก้ได้เสมอ</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-600 w-16">👁 เห็นได้</span>
                    {PERM_ROLES.map(r => {
                      const on = viewRoles.includes(r.key);
                      return <button key={r.key} type="button" onClick={() => setViewRoles(p => on ? p.filter(x => x !== r.key) : [...p, r.key])}
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${on ? "border-indigo-400 bg-indigo-100 text-indigo-700 font-medium" : "border-slate-200 text-slate-500"}`}>{r.label}</button>;
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-600 w-16">✏ แก้ได้</span>
                    {PERM_ROLES.map(r => {
                      const on = editRoles.includes(r.key);
                      return <button key={r.key} type="button" onClick={() => setEditRoles(p => on ? p.filter(x => x !== r.key) : [...p, r.key])}
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${on ? "border-indigo-400 bg-indigo-100 text-indigo-700 font-medium" : "border-slate-200 text-slate-500"}`}>{r.label}</button>;
                    })}
                  </div>
                </div>

                {/* ข้อความช่วย / ค่าเริ่มต้น / ความกว้าง */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-600">ข้อความช่วย (help text)</label>
                    <input value={helpText} onChange={e => setHelpText(e.target.value)} placeholder="คำอธิบายใต้ช่องกรอก (ผู้ใช้เห็น)"
                      className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">หมายเหตุภายใน (admin)</label>
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="โน้ตของแอดมิน (ผู้ใช้ไม่เห็น)"
                      className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">ค่าเริ่มต้น (default)</label>
                    <input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} placeholder="ค่าตั้งต้นตอนสร้างใหม่"
                      className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">ความกว้างคอลัมน์ (px)</label>
                    <input type="number" min={60} max={600} value={width} onChange={e => setWidth(Number(e.target.value) || 150)}
                      className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                  </div>
                </div>

                {/* Validation */}
                {valCatalog.length > 0 && uiType !== "computed" && uiType !== "related" && (
                  <div>
                    <label className="text-xs font-medium text-slate-600">ตรวจสอบความถูกต้อง (Validation)</label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {valCatalog.map(v => {
                        const on = selVal.includes(v.rule_key);
                        return <button key={v.rule_key} type="button" onClick={() => setSelVal(p => on ? p.filter(x => x !== v.rule_key) : [...p, v.rule_key])}
                          className={`text-[11px] px-2 py-1 rounded-md border ${on ? "border-emerald-400 bg-emerald-50 text-emerald-700 font-medium" : "border-slate-200 text-slate-500"}`}
                          title={v.rule_key}>{v.label}</button>;
                      })}
                    </div>
                  </div>
                )}

                {/* เงื่อนไขแสดงในฟอร์ม (show_if) */}
                <div>
                  <label className="text-xs font-medium text-slate-600">แสดงช่องนี้เมื่อ… (เงื่อนไข)</label>
                  <div className="mt-1 flex flex-wrap gap-2 items-center">
                    <select value={condField} onChange={e => setCondField(e.target.value)}
                      className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                      <option value="">— แสดงเสมอ —</option>
                      {advFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    {condField && <>
                      <select value={condOp} onChange={e => setCondOp(e.target.value)}
                        className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
                        {COND_OPS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                      </select>
                      {condOp !== "is_set" && condOp !== "is_empty" && (
                        <input value={condValue} onChange={e => setCondValue(e.target.value)} placeholder="ค่า"
                          className="h-9 px-3 text-sm border border-slate-200 rounded-md w-28" />
                      )}
                    </>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">เช่น แสดงช่อง “เหตุผล” เมื่อ “สถานะ” = ปฏิเสธ</p>
                </div>
              </div>
            )}
          </div>

          {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving}
            className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "กำลังสร้าง..." : "สร้าง field"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
