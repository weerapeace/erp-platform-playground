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
];

const REL_TYPES = ["relation", "many2many", "one2many"];

type TableOpt = { table_name: string; is_module: boolean };
type RelFieldOpt = { key: string; column: string; label: string; targetTable: string; targetModuleKey: string };
type TargetFieldOpt = { column: string; label: string };

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
  const [optionsText, setOptionsText] = useState("");
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

  const submit = async () => {
    setErr(null);
    if (!label.trim() || !fieldKey.trim()) { setErr("กรอกชื่อ field และ label"); return; }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(fieldKey)) { setErr("ชื่อ field: a-z, 0-9, _ เริ่มด้วยตัวอักษร"); return; }
    const isRel = REL_TYPES.includes(uiType);
    if (isRel && !targetTable) { setErr("เลือก table ปลายทาง"); return; }
    if (uiType === "one2many" && !targetFkColumn.trim()) { setErr("ระบุ column FK บน target ที่ชี้กลับมา"); return; }
    const vf = relFields.find(r => r.key === viaField);
    if (uiType === "related" && (!viaField || !relatedTargetField)) { setErr("เลือกความสัมพันธ์ + field ที่จะดึงมาโชว์"); return; }
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
          options: uiType === "select" ? optionsText.split(",").map(s => s.trim()).filter(Boolean) : undefined,
          is_visible: isVisible, is_filterable: isFilterable, is_searchable: isSearchable,
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
            <p className="text-xs text-slate-500 mt-0.5">{moduleTitle} — จะสร้าง column จริงใน Supabase</p>
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
              <label className="text-xs font-medium text-slate-600">ตัวเลือก (คั่นด้วย ,)</label>
              <input value={optionsText} onChange={e => setOptionsText(e.target.value)} placeholder="แดง, เขียว, น้ำเงิน"
                className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500" />
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

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isVisible} onChange={e => setIsVisible(e.target.checked)} /> โชว์ในตาราง</label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isFilterable} onChange={e => setIsFilterable(e.target.checked)} /> กรองได้</label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={isSearchable} onChange={e => setIsSearchable(e.target.checked)} /> ค้นหาได้</label>
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
