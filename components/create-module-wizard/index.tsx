"use client";

/**
 * CreateModuleWizard — ของกลาง: ตัวช่วยสร้างโมดูล/ตารางใหม่แบบ 3 ขั้น
 *
 * ขั้น 1: ข้อมูลโมดูล (ชื่อ + ชื่อ table + ไอคอน)
 * ขั้น 2: เลือกแม่แบบ (Template) สำเร็จรูป → เลือกชุดช่องที่จำเป็นให้อัตโนมัติ
 * ขั้น 3: ปรับช่อง (ติ๊กเอา/เอาออกจากคลังช่อง, ตั้งบังคับกรอก/ค้นหา/โชว์)
 *
 * เบื้องหลังเรียก API กลางที่มีอยู่แล้ว:
 *   POST /api/admin/schema/create-table   → สร้าง table จริง + field "ชื่อ" + register module
 *   POST /api/admin/schema/add-field      → เพิ่มแต่ละช่องที่เลือก (เรียงทีละช่อง กัน display_order ชน)
 *
 * ใช้ซ้ำได้ทุกที่ (modal overlay) — ส่ง onClose + onCreated เข้ามา
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";

/** นิยามช่องในคลัง (ของกลาง) */
type CatalogField = {
  key: string;            // field_key (a-z, 0-9, _)
  label: string;          // ป้ายภาษาคน
  ui: string;             // ui_field_type: text|textarea|number|date|boolean|select|image
  group: string;          // หมวดในคลัง (เพื่อจัดกลุ่มแสดงผล)
  searchable?: boolean;
  required?: boolean;
  sensitive?: boolean;    // ข้อมูลลับ (ซ่อน default)
  options?: string[];     // สำหรับ select
  hint?: string;          // คำอธิบายสั้น
};

// คลังช่องทั้งหมดที่ให้เลือก (จัดกลุ่ม) — "name (ชื่อ)" มีให้อัตโนมัติทุกตารางอยู่แล้ว จึงไม่อยู่ในคลังนี้
const CATALOG: CatalogField[] = [
  // พื้นฐาน
  { key: "code", label: "รหัส / โค้ด", ui: "text", group: "พื้นฐาน", searchable: true, hint: "เช่น รหัสแบรนด์/หมวด" },
  { key: "description", label: "คำอธิบาย", ui: "textarea", group: "พื้นฐาน" },
  { key: "note", label: "หมายเหตุ", ui: "textarea", group: "พื้นฐาน" },
  { key: "sort_order", label: "ลำดับการเรียง", ui: "number", group: "พื้นฐาน", hint: "เลขน้อยขึ้นก่อน" },
  // ติดต่อ
  { key: "phone", label: "เบอร์โทร", ui: "text", group: "ติดต่อ", searchable: true },
  { key: "email", label: "อีเมล", ui: "text", group: "ติดต่อ" },
  { key: "address", label: "ที่อยู่", ui: "textarea", group: "ติดต่อ" },
  { key: "contact_person", label: "ชื่อผู้ติดต่อ", ui: "text", group: "ติดต่อ" },
  { key: "line_id", label: "ไลน์ไอดี", ui: "text", group: "ติดต่อ" },
  // สินค้า / เงิน
  { key: "sku", label: "รหัสสินค้า (SKU)", ui: "text", group: "สินค้า / เงิน", searchable: true },
  { key: "unit", label: "หน่วยนับ", ui: "text", group: "สินค้า / เงิน", hint: "เช่น ชิ้น/กล่อง" },
  { key: "price", label: "ราคา", ui: "number", group: "สินค้า / เงิน" },
  { key: "cost", label: "ต้นทุน (ข้อมูลลับ)", ui: "number", group: "สินค้า / เงิน", sensitive: true, hint: "ซ่อนจากคนทั่วไป" },
  { key: "qty", label: "จำนวน", ui: "number", group: "สินค้า / เงิน" },
  { key: "amount", label: "ยอดเงิน", ui: "number", group: "สินค้า / เงิน" },
  // วันที่
  { key: "doc_date", label: "วันที่เอกสาร", ui: "date", group: "วันที่" },
  { key: "due_date", label: "กำหนดส่ง", ui: "date", group: "วันที่" },
  { key: "start_date", label: "วันเริ่ม", ui: "date", group: "วันที่" },
  { key: "end_date", label: "วันสิ้นสุด", ui: "date", group: "วันที่" },
  // สถานะ / เอกสาร
  { key: "doc_number", label: "เลขที่เอกสาร", ui: "text", group: "สถานะ / เอกสาร", searchable: true },
  { key: "status", label: "สถานะ", ui: "select", group: "สถานะ / เอกสาร", options: ["ร่าง", "รออนุมัติ", "อนุมัติ", "ยกเลิก"] },
  { key: "priority", label: "ความสำคัญ", ui: "select", group: "สถานะ / เอกสาร", options: ["ต่ำ", "กลาง", "สูง"] },
  // ไฟล์ / อื่นๆ
  { key: "image", label: "รูปภาพ", ui: "image", group: "ไฟล์ / อื่นๆ" },
  { key: "assignee", label: "ผู้รับผิดชอบ", ui: "text", group: "ไฟล์ / อื่นๆ" },
];

const CATALOG_BY_KEY: Record<string, CatalogField> = Object.fromEntries(CATALOG.map((f) => [f.key, f]));
const GROUP_ORDER = ["พื้นฐาน", "ติดต่อ", "สินค้า / เงิน", "วันที่", "สถานะ / เอกสาร", "ไฟล์ / อื่นๆ"];

/** แม่แบบสำเร็จรูป → ติ๊กช่องให้อัตโนมัติ */
type Template = { key: string; icon: string; label: string; desc: string; fields: string[] };
const TEMPLATES: Template[] = [
  { key: "simple", icon: "📋", label: "ตารางอ้างอิงง่าย", desc: "แบรนด์ / หมวด / แท็ก", fields: ["code", "description", "sort_order"] },
  { key: "contact", icon: "👤", label: "ผู้ติดต่อ / คู่ค้า", desc: "ลูกค้า / ซัพพลายเออร์", fields: ["code", "phone", "email", "address", "contact_person", "note"] },
  { key: "product", icon: "📦", label: "สินค้า / รายการ", desc: "สินค้า / วัสดุ", fields: ["sku", "description", "unit", "price", "cost", "image", "note"] },
  { key: "document", icon: "📄", label: "เอกสาร / เดินเรื่อง", desc: "ใบสั่ง / คำขอ", fields: ["doc_number", "doc_date", "status", "amount", "note"] },
  { key: "task", icon: "✅", label: "งาน / โปรเจกต์", desc: "งาน / ทาสก์", fields: ["description", "assignee", "status", "due_date", "priority"] },
  { key: "blank", icon: "⬜", label: "เริ่มจากว่าง", desc: "มีแค่ ชื่อ + สถานะ", fields: [] },
];

// ช่องที่ผู้ใช้เพิ่มเอง (นอกเหนือคลัง)
type CustomField = {
  key: string; label: string; ui: string;
  required: boolean; searchable: boolean; sensitive: boolean;
  options?: string[];            // select
  target_table?: string;         // relation
  target_label?: string;         // relation
};
const CF_TYPES = [
  { v: "text", l: "ข้อความ" },
  { v: "textarea", l: "ข้อความยาว" },
  { v: "number", l: "ตัวเลข" },
  { v: "date", l: "วันที่" },
  { v: "boolean", l: "ใช่/ไม่ใช่" },
  { v: "select", l: "ตัวเลือก (dropdown)" },
  { v: "image", l: "รูปภาพ" },
  { v: "relation", l: "เชื่อมตารางอื่น" },
];
const CF_TYPE_LABEL: Record<string, string> = Object.fromEntries(CF_TYPES.map((t) => [t.v, t.l]));
const CF_RESERVED = ["id", "name", "is_active", "created_at", "updated_at"];

type Progress = { total: number; done: number; current: string } | null;

// ฟอร์มตั้งช่องเอง — ครบทุกอย่างที่จำเป็น (ชนิด/บังคับ/ค้นหา/ลับ/ตัวเลือก/เชื่อมตาราง)
function CustomFieldEditor({ existingKeys, onAdd, onCancel }: {
  existingKeys: string[]; onAdd: (f: CustomField) => void; onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState(""); const [keyEdited, setKeyEdited] = useState(false);
  const [type, setType] = useState("text");
  const [req, setReq] = useState(false); const [search, setSearch] = useState(false); const [sensitive, setSensitive] = useState(false);
  const [opts, setOpts] = useState("");
  const [target, setTarget] = useState(""); const [targetLabel, setTargetLabel] = useState("name");
  const [modules, setModules] = useState<{ key: string; label: string; table?: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/modules").then((r) => r.json()).then((j) => { if (Array.isArray(j.data)) setModules(j.data as { key: string; label: string; table?: string }[]); }).catch(() => {});
  }, []);

  const onLabel = (v: string) => {
    setLabel(v);
    if (!keyEdited) setKey(v.trim().toLowerCase().replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_").replace(/^[^a-z]+/, ""));
  };

  const add = () => {
    setErr(null);
    if (!label.trim()) { setErr("กรอกชื่อช่อง"); return; }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) { setErr("ชื่อ field (อังกฤษ) ไม่ถูกต้อง — a-z, 0-9, _ เริ่มด้วยตัวอักษร"); return; }
    if (CF_RESERVED.includes(key) || existingKeys.includes(key)) { setErr("ชื่อ field ซ้ำกับช่องที่มีอยู่"); return; }
    if (type === "select" && !opts.split(/[\n,]/).some((s) => s.trim())) { setErr("ใส่ตัวเลือกอย่างน้อย 1 ค่า"); return; }
    if (type === "relation" && !target) { setErr("เลือกตารางปลายทาง"); return; }
    onAdd({
      key, label: label.trim(), ui: type, required: req, searchable: search, sensitive,
      options: type === "select" ? opts.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : undefined,
      target_table: type === "relation" ? target : undefined,
      target_label: type === "relation" ? (targetLabel || "name") : undefined,
    });
  };

  const inp = "w-full h-9 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500";
  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label className="text-[11px] text-slate-500">ชื่อช่อง (ภาษาคน) *</label><input value={label} onChange={(e) => onLabel(e.target.value)} placeholder="เช่น สี" className={inp} /></div>
        <div><label className="text-[11px] text-slate-500">ชื่อ field (อังกฤษ)</label><input value={key} onChange={(e) => { setKeyEdited(true); setKey(e.target.value); }} placeholder="color" className={`${inp} font-mono`} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><label className="text-[11px] text-slate-500">ชนิดข้อมูล</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inp}>{CF_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
        </div>
        <div className="flex items-end gap-3 text-xs text-slate-600 flex-wrap pb-1">
          <label className="flex items-center gap-1"><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} className="accent-rose-500" />บังคับกรอก</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} className="accent-pink-500" />ค้นหาได้</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="accent-red-500" />ข้อมูลลับ</label>
        </div>
      </div>
      {type === "select" && (
        <div><label className="text-[11px] text-slate-500">ตัวเลือก (บรรทัดละ 1 ค่า)</label>
          <textarea value={opts} onChange={(e) => setOpts(e.target.value)} rows={3} placeholder={"ตัวเลือก 1\nตัวเลือก 2"} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md" /></div>
      )}
      {type === "relation" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><label className="text-[11px] text-slate-500">ตารางปลายทาง</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={inp}>
              <option value="">— เลือก —</option>
              {modules.filter((m) => m.table).map((m) => <option key={m.key} value={m.table}>{m.label}</option>)}
            </select></div>
          <div><label className="text-[11px] text-slate-500">field ที่ใช้แสดงชื่อ</label><input value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)} placeholder="name" className={inp} /></div>
        </div>
      )}
      {err && <div className="text-xs text-red-600">⚠ {err}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="h-8 px-3 text-xs text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">ยกเลิก</button>
        <button onClick={add} className="h-8 px-3 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">เพิ่มช่องนี้</button>
      </div>
    </div>
  );
}

export function CreateModuleWizard({ onClose, onCreated }: { onClose: () => void; onCreated?: (moduleKey: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // ขั้น 1
  const [label, setLabel] = useState("");
  const [table, setTable] = useState("");
  const [tableEdited, setTableEdited] = useState(false);
  const [icon, setIcon] = useState("🧩");
  // ขั้น 2-3
  const [template, setTemplate] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reqKeys, setReqKeys] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  // สถานะ
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ key: string; warnings: string[] } | null>(null);

  const onLabel = (v: string) => {
    setLabel(v);
    if (!tableEdited) setTable(v.trim().toLowerCase().replace(/[^a-z0-9\s_]/g, "").replace(/\s+/g, "_").replace(/^[^a-z]+/, ""));
  };

  const pickTemplate = (t: Template) => {
    setTemplate(t.key);
    setSelected(new Set(t.fields));
    // เลขที่เอกสาร = บังคับกรอกโดยปริยาย
    setReqKeys(new Set(t.fields.filter((k) => k === "doc_number")));
  };

  const toggleField = (k: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(k)) { n.delete(k); setReqKeys((r) => { const rr = new Set(r); rr.delete(k); return rr; }); }
      else n.add(k);
      return n;
    });
  };
  const toggleReq = (k: string) => setReqKeys((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const selectedList = useMemo(() => CATALOG.filter((f) => selected.has(f.key)), [selected]);

  // ไปขั้นถัดไป — validate แบบมีข้อความบอก (ไม่ปิดปุ่มเฉยๆ ให้กดแล้วรู้สาเหตุ)
  const goNext = () => {
    setErr(null);
    if (step === 1) {
      if (!label.trim()) { setErr("กรอกชื่อโมดูลก่อน"); return; }
      if (!/^[a-z][a-z0-9_]{1,62}$/.test(table)) {
        setErr("ชื่อ table ต้องเป็นภาษาอังกฤษ (a-z, 0-9, _) อย่างน้อย 2 ตัว — ถ้าชื่อโมดูลเป็นภาษาไทย ให้พิมพ์ชื่อ table เองในช่องที่สอง");
        return;
      }
    }
    setStep((s) => (s + 1) as 1 | 2 | 3);
  };

  const create = async () => {
    setErr(null); setSaving(true);
    // รวมช่องจากคลัง + ช่องที่เพิ่มเอง เป็น payload เดียว
    const toCreate: { field_key: string; label: string; ui_type: string; is_searchable: boolean; is_required: boolean; is_sensitive: boolean; options?: string[]; target_table?: string; target_label_field?: string }[] = [
      ...selectedList.map((f) => ({ field_key: f.key, label: f.label, ui_type: f.ui, is_searchable: !!f.searchable, is_required: reqKeys.has(f.key), is_sensitive: !!f.sensitive, options: f.ui === "select" ? f.options : undefined })),
      ...customFields.map((c) => ({ field_key: c.key, label: c.label, ui_type: c.ui, is_searchable: c.searchable, is_required: c.required, is_sensitive: c.sensitive, options: c.ui === "select" ? c.options : undefined, target_table: c.target_table, target_label_field: c.target_label })),
    ];
    setProgress({ total: toCreate.length + 1, done: 0, current: "สร้างตาราง…" });
    try {
      // 1) สร้าง table (จะได้ field "ชื่อ" + สถานะ มาให้)
      const r = await apiFetch("/api/admin/schema/create-table", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, label: label.trim(), icon }),
      });
      const j = await r.json();
      if (j.error) { setErr(j.error); setSaving(false); setProgress(null); return; }
      const moduleKey: string = j.module_key;

      // 2) เพิ่มแต่ละช่อง — เรียงทีละช่อง (display_order อิงค่ามากสุดเดิม จึงห้ามยิงพร้อมกัน)
      const warnings: string[] = [];
      let doneCount = 1;
      for (const f of toCreate) {
        setProgress({ total: toCreate.length + 1, done: doneCount, current: `เพิ่มช่อง “${f.label}”…` });
        try {
          const fr = await apiFetch("/api/admin/schema/add-field", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              module_key: moduleKey, field_key: f.field_key, label: f.label, ui_type: f.ui_type,
              group_key: "core", is_visible: true, show_in_form: true,
              is_searchable: f.is_searchable, is_required: f.is_required, is_sensitive: f.is_sensitive,
              options: f.options, target_table: f.target_table, target_label_field: f.target_label_field,
            }),
          });
          const fj = await fr.json().catch(() => ({} as { error?: string }));
          if (fj.error) warnings.push(`${f.label}: ${fj.error}`);
        } catch (e) {
          warnings.push(`${f.label}: ${String((e as Error).message ?? e)}`);
        }
        doneCount += 1;
      }
      setProgress(null);
      setDone({ key: moduleKey, warnings });
      onCreated?.(moduleKey);
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setProgress(null);
    } finally {
      setSaving(false);
    }
  };

  // popup กลาง: dirty = มีการกรอก/เลือก หรือกำลังสร้าง → ใช้กฎ "เตือนก่อนปิด"
  const dirty = !done && (saving || !!label.trim() || !!table.trim() || selected.size > 0 || customFields.length > 0);
  const totalFields = selected.size + customFields.length;
  const guardedClose = () => { if (saving) return; onClose(); };   // ห้ามปิดระหว่างกำลังสร้าง

  const footer = done ? (
    <>
      <a href={`/m/${done.key}`} className="h-9 px-4 leading-9 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">เปิดหน้าโมดูล →</a>
      <button onClick={onClose} className="h-9 px-4 text-sm font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">ปิด</button>
    </>
  ) : (
    <div className="flex w-full items-center justify-between">
      <button onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2 | 3))} disabled={saving}
        className="h-9 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-40">
        {step === 1 ? "ยกเลิก" : "← ย้อนกลับ"}
      </button>
      {step < 3 ? (
        <button onClick={goNext}
          className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          ถัดไป →
        </button>
      ) : (
        <button onClick={create} disabled={saving}
          className="h-9 px-5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "กำลังสร้าง…" : `สร้างโมดูล (${totalFields} ช่อง)`}
        </button>
      )}
    </div>
  );

  return (
    <ERPModal open onClose={guardedClose} size="lg" hasUnsavedChanges={dirty}
      title="➕ สร้างโมดูลใหม่" description="สร้างตารางจริง + ได้หน้าจัดการทันที" footer={footer}>
        {done ? (
          <div className="py-2 text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-emerald-800 font-medium">สร้างโมดูล “{label}” แล้ว!</p>
            {done.warnings.length > 0 && (
              <div className="mt-3 text-left text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
                <div className="font-medium mb-1">⚠ บางช่องเพิ่มไม่สำเร็จ ({done.warnings.length}) — เพิ่มเองภายหลังได้:</div>
                <ul className="list-disc pl-4 space-y-0.5">{done.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* stepper */}
            <div className="flex items-center gap-2 pb-4 text-xs">
              {[{ n: 1, t: "ข้อมูลโมดูล" }, { n: 2, t: "เลือกแม่แบบ" }, { n: 3, t: "ปรับช่อง" }].map((s, i) => (
                <div key={s.n} className="flex items-center gap-2">
                  <span className={`h-6 w-6 rounded-full grid place-items-center font-semibold ${step >= (s.n as 1 | 2 | 3) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"}`}>{s.n}</span>
                  <span className={step === s.n ? "text-slate-700 font-medium" : "text-slate-400"}>{s.t}</span>
                  {i < 2 && <span className="text-slate-300">›</span>}
                </div>
              ))}
            </div>

            <div>
              {/* ── ขั้น 1 ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600">ชื่อโมดูล (ภาษาคน) *</label>
                    <input value={label} onChange={(e) => onLabel(e.target.value)} placeholder="เช่น โปรโมชั่น"
                      className="mt-1 w-full h-10 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">ชื่อ table (อังกฤษ) *</label>
                    <input value={table} onChange={(e) => { setTableEdited(true); setTable(e.target.value); }} placeholder="เช่น promotions"
                      className="mt-1 w-full h-10 px-3 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <p className="text-[11px] text-slate-400 mt-0.5">a-z, 0-9, _ — ชื่อจริงใน database (สร้างให้อัตโนมัติจากชื่อโมดูล)</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">ไอคอน</label>
                    <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4}
                      className="mt-1 w-20 h-10 px-3 text-lg text-center border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
                    💡 ทุกตารางจะมีช่อง <code>ชื่อ</code> + สถานะเปิด/ปิด ให้อยู่แล้ว — ขั้นต่อไปเลือกช่องอื่นเพิ่ม
                  </div>
                </div>
              )}

              {/* ── ขั้น 2 ── */}
              {step === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEMPLATES.map((t) => (
                    <button key={t.key} onClick={() => pickTemplate(t)}
                      className={`text-left p-4 rounded-xl border-2 transition ${template === t.key ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="text-2xl">{t.icon}</div>
                      <div className="mt-1 font-medium text-slate-800 text-sm">{t.label}</div>
                      <div className="text-xs text-slate-500">{t.desc}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {t.fields.length ? `${t.fields.length} ช่อง: ${t.fields.map((k) => CATALOG_BY_KEY[k]?.label).filter(Boolean).join(", ")}` : "ไม่มีช่องเพิ่ม"}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ── ขั้น 3 ── */}
              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">ติ๊กช่องที่ต้องการ (แม่แบบเลือกให้แล้ว ปรับเพิ่ม/ลดได้) — รวม {totalFields} ช่อง</p>

                  {/* ช่องที่เพิ่มเอง */}
                  <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">➕ ช่องที่เพิ่มเอง{customFields.length > 0 ? ` (${customFields.length})` : ""}</span>
                      {!showAdd && (
                        <button onClick={() => setShowAdd(true)}
                          className="text-xs px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">+ เพิ่มช่องเอง</button>
                      )}
                    </div>
                    {customFields.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {customFields.map((c) => (
                          <div key={c.key} className="flex items-center gap-2 text-sm bg-white rounded-md border border-slate-200 px-2 py-1.5">
                            <span className="flex-1 min-w-0 truncate">{c.label} <code className="text-[10px] text-slate-400">{c.key}</code></span>
                            <span className="text-[10px] text-slate-400 shrink-0">{CF_TYPE_LABEL[c.ui] ?? c.ui}{c.required ? " · บังคับ" : ""}{c.sensitive ? " · ลับ" : ""}</span>
                            <button onClick={() => setCustomFields((p) => p.filter((x) => x.key !== c.key))} className="text-slate-300 hover:text-red-500 shrink-0">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {showAdd && (
                      <CustomFieldEditor
                        existingKeys={[...CATALOG.map((f) => f.key), ...customFields.map((c) => c.key)]}
                        onAdd={(f) => { setCustomFields((p) => [...p, f]); setShowAdd(false); }}
                        onCancel={() => setShowAdd(false)}
                      />
                    )}
                  </div>
                  {GROUP_ORDER.map((g) => {
                    const items = CATALOG.filter((f) => f.group === g);
                    if (!items.length) return null;
                    return (
                      <div key={g}>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{g}</div>
                        <div className="space-y-1">
                          {items.map((f) => {
                            const on = selected.has(f.key);
                            return (
                              <div key={f.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${on ? "border-blue-200 bg-blue-50/50" : "border-slate-100"}`}>
                                <input type="checkbox" checked={on} onChange={() => toggleField(f.key)} className="h-4 w-4 accent-blue-600" />
                                <span className="text-sm text-slate-700 flex-1 min-w-0">
                                  {f.label}
                                  <span className="ml-1.5 text-[10px] text-slate-400">{f.ui === "select" ? "ตัวเลือก" : f.ui === "image" ? "รูป" : f.ui === "number" ? "ตัวเลข" : f.ui === "date" ? "วันที่" : f.ui === "textarea" ? "ข้อความยาว" : "ข้อความ"}{f.sensitive ? " · ลับ" : ""}</span>
                                  {f.hint && <span className="block text-[10px] text-slate-400">{f.hint}</span>}
                                </span>
                                {on && (
                                  <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                                    <input type="checkbox" checked={reqKeys.has(f.key)} onChange={() => toggleReq(f.key)} className="h-3.5 w-3.5 accent-rose-500" />
                                    บังคับกรอก
                                  </label>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {err && <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
              {progress && (
                <div className="mt-4">
                  <div className="text-xs text-slate-500 mb-1">{progress.current} ({progress.done}/{progress.total})</div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </ERPModal>
  );
}
