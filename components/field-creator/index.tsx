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

const TYPES: { v: string; label: string; hint: string }[] = [
  { v: "text",     label: "ข้อความ (Text)",        hint: "ตัวอักษรสั้น" },
  { v: "textarea", label: "ข้อความยาว (Textarea)", hint: "หลายบรรทัด" },
  { v: "number",   label: "ตัวเลข (Number)",        hint: "จำนวน/ราคา" },
  { v: "date",     label: "วันที่ (Date)",          hint: "" },
  { v: "boolean",  label: "ใช่/ไม่ใช่ (Boolean)",   hint: "" },
  { v: "select",   label: "ตัวเลือก (Select)",      hint: "กำหนดตัวเลือกเอง" },
  { v: "image",    label: "รูปภาพ (Image)",         hint: "เก็บใน R2" },
  { v: "relation", label: "เชื่อมตาราง (many2one)", hint: "ลิงก์ไปอีก table" },
];

type TableOpt = { table_name: string; is_module: boolean };

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
  const [isVisible, setIsVisible]       = useState(true);
  const [isFilterable, setIsFilterable] = useState(false);
  const [isSearchable, setIsSearchable] = useState(false);
  const [tables, setTables] = useState<TableOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // auto-gen field_key จาก label (snake_case) จนกว่าจะแก้เอง
  useEffect(() => {
    if (keyEdited) return;
    const k = label.trim().toLowerCase()
      .replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_").replace(/^[^a-z]+/, "");
    setFieldKey(k);
  }, [label, keyEdited]);

  // โหลดรายชื่อ table เมื่อเลือก relation
  useEffect(() => {
    if (uiType !== "relation" || tables.length > 0) return;
    apiFetch("/api/admin/schema/tables").then(r => r.json()).then(j => {
      if (!j.error) setTables(j.tables ?? []);
    }).catch(() => {});
  }, [uiType, tables.length]);

  const submit = async () => {
    setErr(null);
    if (!label.trim() || !fieldKey.trim()) { setErr("กรอกชื่อ field และ label"); return; }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(fieldKey)) { setErr("ชื่อ field: a-z, 0-9, _ เริ่มด้วยตัวอักษร"); return; }
    if (uiType === "relation" && !targetTable) { setErr("เลือก table ปลายทาง"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/schema/add-field", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module_key: moduleKey, field_key: fieldKey, label: label.trim(), ui_type: uiType,
          target_table: uiType === "relation" ? targetTable : undefined,
          target_label_field: uiType === "relation" ? targetLabelField : undefined,
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

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
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

          {uiType === "relation" && (
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
