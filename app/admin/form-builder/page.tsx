"use client";

import { useState, useEffect, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import {
  FormRenderer, mapRegistryType, loadFormLayout, saveFormLayout, clearFormLayout, getDefaultValues,
  type FormLayoutConfig, type FormSection, type FormFieldConfig, type FormFieldType, type ConditionalOp,
} from "@/components/form-builder";
import type { FieldRegistryEntry, FieldRegistryResponse } from "@/app/api/field-registry/product-skus/route";

const FORM_ID = "products";

const TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "ข้อความ" }, { value: "textarea", label: "ข้อความยาว" },
  { value: "number", label: "ตัวเลข" }, { value: "currency", label: "เงิน" },
  { value: "date", label: "วันที่" }, { value: "boolean", label: "ใช่/ไม่" },
  { value: "select", label: "ตัวเลือก (dropdown)" },
];
const PATTERN_OPTIONS = [
  { value: "none", label: "ไม่ตรวจ" }, { value: "email", label: "อีเมล" },
  { value: "phone", label: "เบอร์โทร" }, { value: "url", label: "URL" },
];
const PERMISSION_OPTIONS = [
  { value: "",                   label: "ทุกคนเห็น" },
  { value: "products.cost.view", label: "ราคาต้นทุน (เฉพาะ Admin)" },
  { value: "products.edit",      label: "แก้ไขสินค้าได้ (Admin/ผจก/พนักงาน)" },
  { value: "products.delete",    label: "ลบสินค้าได้ (เฉพาะ Admin)" },
];

const COND_OPS: { value: ConditionalOp; label: string }[] = [
  { value: "equals", label: "เท่ากับ" }, { value: "not_equals", label: "ไม่เท่ากับ" },
  { value: "is_empty", label: "ว่าง" }, { value: "is_not_empty", label: "ไม่ว่าง" },
];

const genId = () => Math.random().toString(36).slice(2, 9);
const defaultLayout = (): FormLayoutConfig => ({ sections: [{ id: genId(), title: "ข้อมูลหลัก", columns: 2, fields: [] }] });

export default function FormBuilderPage() {
  const allowed = usePermission("admin.module_layout.edit");
  const [registry, setRegistry] = useState<FieldRegistryEntry[]>([]);
  const [config,   setConfig]   = useState<FormLayoutConfig>(defaultLayout());
  const [loaded,   setLoaded]   = useState(false);
  const [savedAt,  setSavedAt]  = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);  // "sid:key"
  const [drag,     setDrag]     = useState<{ sid: string; key: string } | null>(null);
  const [previewVals, setPreviewVals] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!allowed) return;
    apiFetch("/api/field-registry/product-skus").then(r => r.json())
      .then((j: FieldRegistryResponse) => setRegistry(j.data ?? [])).catch(() => {});
    const saved = loadFormLayout(FORM_ID);
    if (saved) setConfig(saved);
    setLoaded(true);
  }, [allowed]);

  // reset preview default values เมื่อ config เปลี่ยน
  useEffect(() => { setPreviewVals(getDefaultValues(config)); }, [config]);

  const usedKeys = useMemo(() => new Set(config.sections.flatMap(s => s.fields.map(f => f.key))), [config]);
  const availableFields = registry.filter(f => !usedKeys.has(f.field_key) && !f.is_sensitive);
  const allFields = useMemo(() => config.sections.flatMap(s => s.fields), [config]);

  const update = (fn: (c: FormLayoutConfig) => FormLayoutConfig) => setConfig(prev => fn(structuredClone(prev)));

  const addSection = () => update(c => { c.sections.push({ id: genId(), title: "หัวข้อใหม่", columns: 2, fields: [] }); return c; });
  const removeSection = (sid: string) => update(c => { c.sections = c.sections.filter(s => s.id !== sid); return c; });
  const setSection = (sid: string, patch: Partial<FormSection>) => update(c => { const s = c.sections.find(x => x.id === sid); if (s) Object.assign(s, patch); return c; });

  const addField = (sid: string, reg: FieldRegistryEntry) => update(c => {
    const s = c.sections.find(x => x.id === sid);
    if (s) s.fields.push({ key: reg.field_key, label: reg.field_label, type: mapRegistryType(reg.ui_type), width: 1 });
    return c;
  });
  const removeField = (sid: string, key: string) => update(c => { const s = c.sections.find(x => x.id === sid); if (s) s.fields = s.fields.filter(f => f.key !== key); return c; });
  const setField = (key: string, patch: Partial<FormFieldConfig>) => update(c => {
    for (const s of c.sections) { const f = s.fields.find(x => x.key === key); if (f) { Object.assign(f, patch); break; } }
    return c;
  });

  // ---- Drag & drop: ย้าย field (ใน/ข้าม section) ----
  const dropOnField = (toSid: string, toKey: string) => {
    if (!drag) return;
    update(c => {
      const from = c.sections.find(s => s.id === drag.sid);
      const fIdx = from?.fields.findIndex(f => f.key === drag.key) ?? -1;
      if (!from || fIdx < 0) return c;
      const [moved] = from.fields.splice(fIdx, 1);
      const to = c.sections.find(s => s.id === toSid);
      if (!to) return c;
      const tIdx = to.fields.findIndex(f => f.key === toKey);
      to.fields.splice(tIdx < 0 ? to.fields.length : tIdx, 0, moved);
      return c;
    });
    setDrag(null);
  };
  const dropOnSection = (toSid: string) => {
    if (!drag) return;
    update(c => {
      const from = c.sections.find(s => s.id === drag.sid);
      const fIdx = from?.fields.findIndex(f => f.key === drag.key) ?? -1;
      if (!from || fIdx < 0) return c;
      const [moved] = from.fields.splice(fIdx, 1);
      c.sections.find(s => s.id === toSid)?.fields.push(moved);
      return c;
    });
    setDrag(null);
  };

  const save = () => { saveFormLayout(FORM_ID, config); setSavedAt(new Date().toLocaleTimeString("th-TH")); };
  const reset = () => { clearFormLayout(FORM_ID); setConfig(defaultLayout()); setSavedAt(null); };

  if (!allowed) return <PlaygroundShell><AccessDenied message="หน้าออกแบบฟอร์มต้องเป็นผู้ดูแลระบบ (Admin)" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-medium mb-3">🧩 Form Layout Builder — Full</div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ออกแบบฟอร์ม — สินค้า</h1>
            <p className="text-slate-500 mt-1">ลากจัดลำดับ · ตั้งชนิดช่อง/ค่าเริ่มต้น · กฎตรวจสอบ · เงื่อนไขแสดงผล</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savedAt && <span className="text-xs text-emerald-600 self-center">✓ บันทึก {savedAt}</span>}
            <button onClick={reset} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">รีเซ็ต</button>
            <button onClick={save} className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">💾 บันทึก Layout</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {!loaded ? <div className="text-center py-12 text-slate-400">กำลังโหลด...</div> : (
          <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_380px] gap-5">

            {/* คลัง field */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">คลัง Field ({availableFields.length})</p>
              <p className="text-xs text-slate-400 mb-3">field จาก Registry ที่ยังไม่ใช้</p>
              <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
                {availableFields.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">ใช้ครบแล้ว</p>
                  : availableFields.map(f => (
                    <div key={f.field_key} className="px-2.5 py-1.5 bg-slate-50 rounded-lg text-sm text-slate-700 truncate">{f.field_label}</div>
                  ))}
              </div>
            </div>

            {/* จัด layout */}
            <div className="space-y-4">
              {config.sections.map(section => (
                <div key={section.id} className="bg-white rounded-xl border border-slate-200 p-4"
                  onDragOver={e => { if (drag) e.preventDefault(); }}
                  onDrop={() => dropOnSection(section.id)}>
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                    <input value={section.title} onChange={e => setSection(section.id, { title: e.target.value })}
                      className="flex-1 h-8 px-2 text-sm font-semibold border border-transparent hover:border-slate-200 focus:border-blue-400 rounded focus:outline-none" />
                    <select value={section.columns} onChange={e => setSection(section.id, { columns: Number(e.target.value) as 1|2|3 })} className="h-8 px-2 text-xs border border-slate-200 rounded">
                      <option value={1}>1 คอลัมน์</option><option value={2}>2 คอลัมน์</option><option value={3}>3 คอลัมน์</option>
                    </select>
                    <button onClick={() => removeSection(section.id)} className="h-8 w-8 text-slate-300 hover:text-red-500">🗑</button>
                  </div>

                  <div className="space-y-2">
                    {section.fields.length === 0 && <p className="text-xs text-slate-400 text-center py-3 border-2 border-dashed border-slate-100 rounded-lg">ลาก field มาที่นี่ หรือเพิ่มด้านล่าง</p>}
                    {section.fields.map(f => {
                      const eid = `${section.id}:${f.key}`;
                      const isExp = expanded === eid;
                      return (
                        <div key={f.key}
                          draggable
                          onDragStart={() => setDrag({ sid: section.id, key: f.key })}
                          onDragEnd={() => setDrag(null)}
                          onDragOver={e => { if (drag) e.preventDefault(); }}
                          onDrop={e => { e.stopPropagation(); dropOnField(section.id, f.key); }}
                          className={`border rounded-lg ${drag?.key === f.key ? "opacity-40" : ""} ${isExp ? "border-blue-300 bg-blue-50/30" : "border-slate-100 bg-slate-50/40"}`}>
                          {/* row หลัก */}
                          <div className="flex items-center gap-2 px-2 py-1.5 flex-wrap">
                            <span className="cursor-grab text-slate-300 hover:text-slate-500" title="ลากเพื่อย้าย">⠿</span>
                            <input value={f.label} onChange={e => setField(f.key, { label: e.target.value })}
                              className="w-28 h-7 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <select value={f.type} onChange={e => setField(f.key, { type: e.target.value as FormFieldType })} className="h-7 px-1 text-xs border border-slate-200 rounded">
                              {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={!!f.required} onChange={e => setField(f.key, { required: e.target.checked })} className="rounded border-slate-300" />บังคับ</label>
                            <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={!!f.hidden} onChange={e => setField(f.key, { hidden: e.target.checked })} className="rounded border-slate-300" />ซ่อน</label>
                            <select value={f.width ?? 1} onChange={e => setField(f.key, { width: Number(e.target.value) as 1|2|3 })} className="h-7 px-1 text-xs border border-slate-200 rounded">
                              <option value={1}>กว้าง1</option><option value={2}>กว้าง2</option><option value={3}>กว้าง3</option>
                            </select>
                            <button onClick={() => setExpanded(isExp ? null : eid)} className={`h-7 w-7 rounded text-sm ${isExp ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:bg-slate-100"}`} title="ตั้งค่าเพิ่มเติม">⚙</button>
                            <button onClick={() => removeField(section.id, f.key)} className="ml-auto text-slate-300 hover:text-red-500">✕</button>
                          </div>

                          {/* ตั้งค่าเพิ่มเติม */}
                          {isExp && (
                            <div className="px-3 py-3 border-t border-blue-100 space-y-3 text-xs">
                              <div className="grid grid-cols-2 gap-2">
                                <label className="block"><span className="text-slate-500">Placeholder</span>
                                  <input value={f.placeholder ?? ""} onChange={e => setField(f.key, { placeholder: e.target.value })} className="w-full h-7 px-2 mt-0.5 border border-slate-200 rounded" /></label>
                                <label className="block"><span className="text-slate-500">ค่าเริ่มต้น</span>
                                  <input value={f.defaultValue ?? ""} onChange={e => setField(f.key, { defaultValue: e.target.value })} className="w-full h-7 px-2 mt-0.5 border border-slate-200 rounded" /></label>
                              </div>
                              <label className="block"><span className="text-slate-500">คำอธิบาย (help text)</span>
                                <input value={f.helpText ?? ""} onChange={e => setField(f.key, { helpText: e.target.value })} className="w-full h-7 px-2 mt-0.5 border border-slate-200 rounded" /></label>

                              {/* options (select) */}
                              {f.type === "select" && (
                                <div className="bg-white rounded-lg p-2 border border-slate-200">
                                  <p className="text-slate-500 mb-1">ตัวเลือก (dropdown)</p>
                                  {(f.options ?? []).map((o, oi) => (
                                    <div key={oi} className="flex items-center gap-1 mb-1">
                                      <input value={o.label} placeholder="ป้าย" onChange={e => { const opts = [...(f.options ?? [])]; opts[oi] = { ...opts[oi], label: e.target.value, value: opts[oi].value || e.target.value }; setField(f.key, { options: opts }); }} className="flex-1 h-6 px-1.5 border border-slate-200 rounded" />
                                      <button onClick={() => setField(f.key, { options: (f.options ?? []).filter((_, x) => x !== oi) })} className="text-slate-300 hover:text-red-500">✕</button>
                                    </div>
                                  ))}
                                  <button onClick={() => setField(f.key, { options: [...(f.options ?? []), { value: "", label: "" }] })} className="text-blue-600 hover:underline">＋ เพิ่มตัวเลือก</button>
                                </div>
                              )}

                              {/* validation */}
                              <div className="bg-white rounded-lg p-2 border border-slate-200">
                                <p className="text-slate-500 mb-1.5">กฎตรวจสอบ (Validation)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <label className="block"><span className="text-slate-400">{f.type === "number" || f.type === "currency" ? "ค่าต่ำสุด" : "ยาวต่ำสุด"}</span>
                                    <input type="number" value={f.validation?.min ?? ""} onChange={e => setField(f.key, { validation: { ...f.validation, min: e.target.value === "" ? undefined : Number(e.target.value) } })} className="w-full h-7 px-1.5 mt-0.5 border border-slate-200 rounded" /></label>
                                  <label className="block"><span className="text-slate-400">{f.type === "number" || f.type === "currency" ? "ค่าสูงสุด" : "ยาวสูงสุด"}</span>
                                    <input type="number" value={f.validation?.max ?? ""} onChange={e => setField(f.key, { validation: { ...f.validation, max: e.target.value === "" ? undefined : Number(e.target.value) } })} className="w-full h-7 px-1.5 mt-0.5 border border-slate-200 rounded" /></label>
                                  <label className="block"><span className="text-slate-400">รูปแบบ</span>
                                    <select value={f.validation?.pattern ?? "none"} onChange={e => setField(f.key, { validation: { ...f.validation, pattern: e.target.value as "none"|"email"|"phone"|"url" } })} className="w-full h-7 px-1 mt-0.5 border border-slate-200 rounded">
                                      {PATTERN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select></label>
                                </div>
                                <label className="block mt-2"><span className="text-slate-400">ข้อความ error เอง (ไม่บังคับ)</span>
                                  <input value={f.validation?.customMessage ?? ""} onChange={e => setField(f.key, { validation: { ...f.validation, customMessage: e.target.value } })} className="w-full h-7 px-1.5 mt-0.5 border border-slate-200 rounded" /></label>
                              </div>

                              {/* conditional */}
                              <div className="bg-white rounded-lg p-2 border border-slate-200">
                                <p className="text-slate-500 mb-1.5">เงื่อนไขแสดงผล (แสดงช่องนี้เมื่อ...)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <select value={f.showWhen?.field ?? ""} onChange={e => setField(f.key, { showWhen: e.target.value ? { field: e.target.value, operator: f.showWhen?.operator ?? "equals", value: f.showWhen?.value ?? "" } : null })} className="h-7 px-1 border border-slate-200 rounded">
                                    <option value="">— แสดงเสมอ —</option>
                                    {allFields.filter(x => x.key !== f.key).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                                  </select>
                                  {f.showWhen?.field && (
                                    <>
                                      <select value={f.showWhen.operator} onChange={e => setField(f.key, { showWhen: { ...f.showWhen!, operator: e.target.value as ConditionalOp } })} className="h-7 px-1 border border-slate-200 rounded">
                                        {COND_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </select>
                                      {(f.showWhen.operator === "equals" || f.showWhen.operator === "not_equals") && (
                                        <input value={f.showWhen.value} placeholder="ค่า" onChange={e => setField(f.key, { showWhen: { ...f.showWhen!, value: e.target.value } })} className="h-7 px-1.5 border border-slate-200 rounded" />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* permission */}
                              <div className="bg-white rounded-lg p-2 border border-slate-200">
                                <p className="text-slate-500 mb-1.5">สิทธิ์การเห็น (ซ่อนถ้าไม่มีสิทธิ์)</p>
                                <select value={f.permission ?? ""} onChange={e => setField(f.key, { permission: e.target.value || undefined })}
                                  className="w-full h-7 px-1 border border-slate-200 rounded">
                                  {PERMISSION_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {availableFields.length > 0 && (
                    <select value="" onChange={e => { const reg = registry.find(r => r.field_key === e.target.value); if (reg) addField(section.id, reg); }} className="mt-3 h-8 px-2 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 w-full">
                      <option value="">＋ เพิ่ม field เข้า section นี้...</option>
                      {availableFields.map(f => <option key={f.field_key} value={f.field_key}>{f.field_label}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <button onClick={addSection} className="w-full h-10 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600">＋ เพิ่ม Section</button>
            </div>

            {/* Preview */}
            <div className="h-fit sticky top-4">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ตัวอย่างฟอร์มจริง</span>
                  <span className="text-xs text-slate-400">ลองกรอกดูได้</span>
                </div>
                <div className="p-5 max-h-[600px] overflow-y-auto">
                  {config.sections.every(s => s.fields.length === 0) ? (
                    <p className="text-sm text-slate-400 text-center py-8">เพิ่ม field เพื่อดูตัวอย่าง</p>
                  ) : (
                    <FormRenderer config={config} values={previewVals} onChange={(k, v) => setPreviewVals(p => ({ ...p, [k]: v }))} />
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2 px-1">💡 ลองเปลี่ยนค่าในช่องที่ตั้งเงื่อนไข — ช่องที่ผูกไว้จะโผล่/ซ่อนตามจริง</p>
            </div>

          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}
