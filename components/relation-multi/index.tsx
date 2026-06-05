"use client";

/**
 * C2b: widget สำหรับ many2many + one2many
 * - RelationMany2Many: เลือกหลายค่า (จัดการ link ใน junction table ทันที)
 * - RelationOne2Many: แสดงรายการลูกที่ชี้กลับมา (read-only)
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { RelationPeekModal } from "@/components/relation-peek";
import { resolveRelationLabels, readRelationLabel, type RelationConfig } from "@/lib/relation";

type RelConfig = {
  kind?: string;
  junction_table?: string;
  target_table?: string;
  target_module_key?: string;
  target_label_field?: string;
  target_fk_column?: string;
  allow_create?: boolean;             // m2m: อนุญาตสร้างแท็กใหม่จากกล่องเลือก
  // one2many: แสดงผลแบบครบ (รูป + ชื่อ + ข้อมูลย่อย) — ถ้าไม่ระบุ จะโชว์แค่ label
  list_image_field?: string;          // column ที่เป็น R2 key รูป
  list_title_field?: string;          // column ชื่อหลัก (default = target_label_field)
  list_sub_fields?: string[];         // columns ข้อมูลย่อย แสดงต่อท้าย คั่นด้วย ·
};

type Opt = { id: string; label: string };

async function fetchOptions(moduleKey: string, labelField: string): Promise<Opt[]> {
  const r = await apiFetch(`/api/master-v2/${moduleKey}?limit=500`);
  const j = await r.json();
  return (j.data ?? j.rows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    label: String(row[labelField] ?? row.name ?? row.id),
  }));
}

// ---- Popup จัดการแท็ก (เพิ่ม/แก้ชื่อ/ลบ แท็กในตารางต้นทาง) ----
function TagsManagerModal({ moduleKey, labelField, onClose, onChanged }: {
  moduleKey: string; labelField: string; onClose: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Opt[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/api/master-v2/${moduleKey}?limit=500&include_inactive=true`).then((r) => r.json())
      .then((j) => setRows(((j.data ?? j.rows ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), label: String(r[labelField] ?? r.name ?? r.id) }))))
      .catch(() => {});
  }, [moduleKey, labelField]);
  useEffect(() => { load(); }, [load]);

  const rename = async (id: string, name: string) => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [labelField]: name.trim() }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert("แก้ชื่อไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      onChanged(); load();
    } finally { setBusy(false); }
  };
  const del = async (id: string, label: string) => {
    if (!confirm(`ลบแท็ก “${label}” ?\n(สินค้าที่เคยติดแท็กนี้จะไม่เห็นแท็กนี้แล้ว)`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert("ลบไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      onChanged(); load();
    } finally { setBusy(false); }
  };
  const add = async () => {
    const n = newName.trim(); if (!n) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [labelField]: n }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert("เพิ่มไม่สำเร็จ: " + (j.error ?? res.status)); return; }
      setNewName(""); onChanged(); load();
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[440px] max-w-[92vw] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">🗂️ จัดการแท็ก (Product Family)</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {rows.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">ยังไม่มีแท็ก</div>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <input
                value={draft[r.id] ?? r.label}
                onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md" />
              <button type="button" disabled={busy || (draft[r.id] ?? r.label) === r.label} onClick={() => rename(r.id, draft[r.id] ?? r.label)}
                className="h-8 px-2 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40">บันทึก</button>
              <button type="button" disabled={busy} onClick={() => del(r.id, r.label)}
                className="h-8 px-2 text-xs rounded-md text-red-500 hover:bg-red-50">🗑️</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-3 py-3 border-t border-slate-100">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อแท็กใหม่…"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-md" />
          <button type="button" onClick={add} disabled={busy || !newName.trim()}
            className="h-9 px-4 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">+ เพิ่ม</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- many2many ---- (ค้นหา + เช็คบ็อกซ์ + สร้างใหม่ + เลือกได้ตั้งแต่ตอนสร้าง)
//
// 2 โหมด แยกชัดเพื่อกัน race/desync:
//  • โหมดสร้าง (ไม่มี recordId): เก็บใน form ผ่าน value/onChange → master-crud ผูกลิงก์หลังสร้าง
//  • โหมดแก้ไข (มี recordId): widget ถือ state เอง (serverLinked) โหลดจาก DB แล้วผูก/ถอดทันทีต่อคลิก
//    (แหล่งความจริงเดียว = state ของ widget ↔ DB, ไม่ผ่าน form → ไม่มี lag/ค่าเพี้ยน)
export function RelationMany2Many({ config, recordId, editable, value, onChange }: {
  config: RelConfig; recordId?: string | null; editable: boolean;
  value?: string[];
  onChange?: (ids: string[]) => void;        // โหมดสร้างเท่านั้น (parent: updateForm)
}) {
  const junction = config.junction_table ?? "";
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const labelField = config.target_label_field ?? "name";
  const allowCreate = config.allow_create !== false;
  const isCreate = !recordId;

  const [opts, setOpts] = useState<Opt[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [mgrOpen, setMgrOpen] = useState(false);   // popup จัดการแท็ก

  // แหล่งความจริงเดียว = ค่าในฟอร์ม (value) — ไม่มี state ภายใน widget (กัน diverge/remount ทำค่าหาย)
  //   โหมดแก้ไข: master-crud โหลดลิงก์เดิมเข้า form ให้ตอน openEdit
  //   value===undefined (โหมดแก้ไข) = ยังโหลดไม่เสร็จ → ล็อกคลิกไว้ก่อน
  const loading = !isCreate && value === undefined;
  const linked = value ?? [];
  // ref ค่าล่าสุด → คลิกถี่ ๆ ไม่เพี้ยน
  const linkedRef = useRef<string[]>(linked);
  linkedRef.current = linked;

  useEffect(() => { fetchOptions(moduleKey, labelField).then(setOpts).catch(() => {}); }, [moduleKey, labelField]);

  const labelOf = (id: string) => opts.find((o) => o.id === id)?.label ?? id.slice(0, 8);

  // toggle: คำนวณจากค่าล่าสุดแล้วส่งเข้า form (chips + บันทึก อ่านจาก form ที่เดียว → ตรงกันเสมอ)
  const toggle = (id: string) => {
    if (loading) return;
    const cur = linkedRef.current;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    linkedRef.current = next;
    onChange?.(next);
  };
  const createNew = async () => {
    const name = q.trim();
    if (!name || !allowCreate) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [labelField]: name }),
      });
      const j = await res.json().catch(() => ({}));
      const id = (j.data as { id?: string } | undefined)?.id;
      if (!res.ok || j.error || !id) { alert("สร้างแท็กไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      setOpts((o) => [...o, { id, label: name }]);
      setQ("");
      toggle(id);
    } catch (e) { alert("สร้างแท็กไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); }
    finally { setBusy(false); }
  };

  const ql = q.trim().toLowerCase();
  const filtered = opts.filter((o) => !ql || o.label.toLowerCase().includes(ql));
  const exact = opts.some((o) => o.label.trim().toLowerCase() === ql);

  return (
    <div className="mt-0.5">
      {loading && <div className="text-xs text-slate-400 italic py-1">กำลังโหลด…</div>}
      {/* แท็กที่เลือก */}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {!loading && linked.length === 0 && <span className="text-xs text-slate-300">— ยังไม่เลือก —</span>}
        {linked.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">
            {labelOf(id)}
            {editable && <button type="button" onClick={() => toggle(id)} className="text-blue-400 hover:text-red-500">✕</button>}
          </span>
        ))}
      </div>
      {editable && !loading && (
        <div>
          {/* ช่องค้นหา + ปุ่มเปิด popup จัดการแท็ก */}
          <div className="flex gap-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา / พิมพ์เพื่อเพิ่ม…"
              className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <button type="button" onClick={() => setMgrOpen(true)} title="จัดการแท็ก (เพิ่ม/แก้ชื่อ/ลบ)"
              className="h-8 px-2.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 shrink-0">🗂️</button>
          </div>
          {/* รายการเช็คบ็อกซ์ โชว์ตลอด (เลื่อนได้) → ไม่มีจังหวะ "ปิด" ที่ทำให้ค่าหาย */}
          <div className="mt-1 max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-1">
            {filtered.map((o) => {
              const on = linked.includes(o.id);
              return (
                <button key={o.id} type="button" onClick={() => toggle(o.id)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-slate-50 ${on ? "bg-blue-50/50" : ""}`}>
                  <input type="checkbox" readOnly checked={on} className="rounded border-slate-300 pointer-events-none" />
                  <span className="flex-1 truncate">{o.label}</span>
                </button>
              );
            })}
            {filtered.length === 0 && !ql && <div className="text-xs text-slate-300 py-2 text-center">— ไม่มีแท็ก —</div>}
            {allowCreate && ql && !exact && (
              <button type="button" onClick={createNew} disabled={busy}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded text-blue-600 hover:bg-blue-50 border-t border-slate-100 mt-1">
                ➕ สร้างแท็กใหม่ “{q.trim()}”
              </button>
            )}
          </div>
        </div>
      )}
      {mgrOpen && (
        <TagsManagerModal moduleKey={moduleKey} labelField={labelField}
          onClose={() => setMgrOpen(false)}
          onChanged={() => fetchOptions(moduleKey, labelField).then(setOpts).catch(() => {})} />
      )}
    </div>
  );
}

// ---- one2many (read-only) ----
const r2img = (k: unknown) => (k ? `/api/r2-image?key=${encodeURIComponent(String(k))}` : null);
const fmtVal = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
};

// ---- ตัวเลือกคอลัมน์ตารางลูก (บันทึกกลาง) ----
function O2MColumnPicker({ allFields, titleField, imageField, current, onSave, onClose }: {
  allFields: { key: string; label: string }[];
  titleField: string;
  imageField?: string;
  current: string[];
  onSave: (next: string[]) => void;
  onClose: () => void;
}) {
  const hidden = new Set(["id", titleField, imageField].filter(Boolean) as string[]);
  const valid = (k: string) => allFields.some((f) => f.key === k);
  const [selected, setSelected] = useState<string[]>(current.filter(valid));
  const labelOf = (k: string) => allFields.find((f) => f.key === k)?.label ?? k;
  const available = allFields.filter((f) => !hidden.has(f.key) && !selected.includes(f.key));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected]; [next[i], next[j]] = [next[j], next[i]]; setSelected(next);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">⚙ เลือกคอลัมน์ตารางลูก</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-100">
          คอลัมน์หลัก: <b className="text-slate-600">{labelOf(titleField)}</b> (แสดงเสมอ) — เลือกคอลัมน์เพิ่มด้านล่าง
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">แสดงอยู่ ({selected.length}) — เรียงลำดับได้</div>
            {selected.length === 0 && <div className="text-xs text-slate-300 italic">— ยังไม่เลือกคอลัมน์เพิ่ม —</div>}
            <ul className="space-y-1">
              {selected.map((k, i) => (
                <li key={k} className="flex items-center gap-1 px-2 py-1.5 bg-blue-50/60 border border-blue-100 rounded-md text-sm">
                  <span className="flex-1 truncate text-slate-700">{labelOf(k)}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} title="ขึ้น" className="w-6 h-6 rounded text-slate-400 hover:text-blue-600 disabled:opacity-30">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === selected.length - 1} title="ลง" className="w-6 h-6 rounded text-slate-400 hover:text-blue-600 disabled:opacity-30">▼</button>
                  <button onClick={() => setSelected(selected.filter((x) => x !== k))} title="เอาออก" className="w-6 h-6 rounded text-slate-400 hover:text-red-500">✕</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">เพิ่มคอลัมน์</div>
            {available.length === 0 ? (
              <span className="text-xs text-slate-300 italic">— เลือกครบทุกคอลัมน์แล้ว —</span>
            ) : (
              <select value="" onChange={(e) => { if (e.target.value) setSelected([...selected, e.target.value]); }}
                className="w-full h-9 px-2 text-sm border border-slate-300 rounded-md bg-white">
                <option value="">+ เลือกคอลัมน์เพิ่ม… ({available.length})</option>
                {available.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 text-sm text-slate-600 hover:bg-slate-100 rounded-md">ยกเลิก</button>
          <button onClick={() => onSave(selected)} className="h-8 px-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">บันทึก (ทุกคนเห็น)</button>
        </div>
      </div>
    </div>
  );
}

export function RelationOne2Many({ config, recordId, title, fieldId, configurable }: { config: RelConfig; recordId?: string | null; title?: string; fieldId?: string; configurable?: boolean }) {
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const fk = config.target_fk_column ?? "";
  const titleField = config.list_title_field ?? config.target_label_field ?? "name";
  const imageField = config.list_image_field;
  // คอลัมน์ที่โชว์ (list_sub_fields) — เก็บเป็น state เพื่อให้ปุ่ม "เลือกคอลัมน์" อัปเดตทันทีไม่ต้อง refresh
  const [subFields, setSubFields] = useState<string[]>(config.list_sub_fields ?? []);
  useEffect(() => { setSubFields(config.list_sub_fields ?? []); }, [config.list_sub_fields]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canConfig = !!configurable && !!fieldId;
  const PAGE = 20;   // โหลดทีละ 20 (ลดภาระ worker) แล้วกด "ดูเพิ่ม"
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [peek, setPeek] = useState<{ id: string; edit: boolean } | null>(null);  // กดรายการลูก → ดู/แก้ record นั้น

  // ดึงทีละหน้า (filter fk ที่ server)
  const fetchPage = useCallback(async (offset: number) => {
    const flt = encodeURIComponent(JSON.stringify({ [fk]: { type: "text", value: recordId } }));
    const j = await apiFetch(`/api/master-v2/${moduleKey}?limit=${PAGE}&offset=${offset}&filters=${flt}`).then((r) => r.json());
    return { data: (j.data ?? j.rows ?? []) as Record<string, unknown>[], total: Number(j.total ?? 0) };
  }, [moduleKey, fk, recordId]);

  const load = useCallback(() => {
    if (!recordId || !fk) return;
    setLoaded(false);
    fetchPage(0).then(({ data, total }) => { setRows(data); setTotal(total); setLoaded(true); }).catch(() => setLoaded(true));
  }, [recordId, fk, fetchPage]);

  useEffect(() => { load(); }, [load]);

  // ดึง label หัวคอลัมน์ + รายการ field + config ของฟิลด์เชื่อม (FK) จากทะเบียน field ของโมดูลลูก (ของกลาง)
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [allFields, setAllFields] = useState<{ key: string; label: string }[]>([]);
  const [relCfgByField, setRelCfgByField] = useState<Record<string, RelationConfig>>({});
  const [typeByField, setTypeByField] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!moduleKey) return;
    apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(moduleKey)}`).then((r) => r.json())
      .then((j) => {
        const m: Record<string, string> = {};
        const list: { key: string; label: string }[] = [];
        const rels: Record<string, RelationConfig> = {};
        const types: Record<string, string> = {};
        (j.fields ?? []).forEach((f: Record<string, unknown>) => {
          const k = String(f.column_name ?? f.field_key);
          const lbl = String(f.field_label ?? k);
          m[k] = lbl; list.push({ key: k, label: lbl });
          types[k] = String(f.ui_field_type ?? "text");
          // ฟิลด์เชื่อม = มี relation_config ที่ชี้ตารางปลายทาง → ใช้แปลง id→ชื่อ
          const rc = f.relation_config as RelationConfig | undefined;
          if (rc && (rc.target_table || rc.lookup_type)) rels[k] = rc;
        });
        setLabels(m); setAllFields(list); setRelCfgByField(rels); setTypeByField(types);
      }).catch(() => {});
  }, [moduleKey]);

  // ---- inline edit + flash fill (ตารางลูก) ----
  const canEditRows = !!configurable;
  const isEditableCol = (f: string) => canEditRows && !relCfgByField[f] && ["text", "number", "currency"].includes(typeByField[f] ?? "text");
  const [editCell, setEditCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const fkCol = config.target_fk_column ?? "";
  const parseByType = (f: string, raw: string): unknown => {
    const t = typeByField[f] ?? "text";
    if (t === "number" || t === "currency") { const n = Number(raw); return raw === "" ? null : (isFinite(n) ? n : null); }
    return raw === "" ? null : raw;
  };
  const saveCell = async (rowId: string, field: string, raw: string) => {
    const val = parseByType(field, raw);
    setEditCell(null);
    setRows((p) => p.map((r) => String(r.id) === rowId ? { ...r, [field]: val } : r));   // อัปเดตจอทันที
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: [{ id: rowId, changes: { [field]: val } }] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { alert("บันทึกไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); load(); }
    } catch (e) { alert("บันทึกไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); load(); }
  };
  const fillColumn = async (field: string) => {
    if (!recordId || !fkCol) return;
    const raw = window.prompt(`เติมค่า "${labelOf(field)}" ให้ SKU ลูกทุกตัวของใบนี้:`, "");
    if (raw == null) return;
    const val = parseByType(field, raw);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { [field]: val }, filters: { [fkCol]: { type: "text", value: recordId } } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { alert("เติมไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      alert(`เติมค่าให้ ${j.affected ?? 0} รายการแล้ว`);
      load();
    } catch (e) { alert("เติมไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); }
  };
  const labelOf = (k: string) => labels[k] ?? k;

  // แปลง id→ชื่อ ของคอลัมน์ที่เป็นฟิลด์เชื่อม (batch ทีเดียวต่อคอลัมน์) — ของกลาง lib/relation
  const [relLabels, setRelLabels] = useState<Record<string, Map<string, string>>>({});
  useEffect(() => {
    const relCols = subFields.filter((f) => relCfgByField[f]);
    if (relCols.length === 0 || rows.length === 0) return;
    let alive = true;
    (async () => {
      const out: Record<string, Map<string, string>> = {};
      for (const f of relCols) {
        // เก็บเฉพาะ id ที่ยังไม่มี label denormalized ติดมา ({base}_label)
        const ids = rows
          .filter((r) => readRelationLabel(r, f) == null && r[f] != null && r[f] !== "")
          .map((r) => String(r[f]));
        if (ids.length === 0) continue;
        try {
          const map = await resolveRelationLabels(apiFetch, relCfgByField[f], ids);
          const labelMap = new Map<string, string>();
          map.forEach((opt, id) => labelMap.set(id, opt.label));
          out[f] = labelMap;
        } catch { /* ignore — fallback แสดง id */ }
      }
      if (alive) setRelLabels(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, subFields, relCfgByField]);

  // ค่าที่จะแสดงในเซลล์ — ถ้าเป็นฟิลด์เชื่อม แปลงเป็นชื่อ ไม่งั้นแสดงค่าปกติ
  const cellValue = (r: Record<string, unknown>, f: string): string | null => {
    if (relCfgByField[f]) {
      const denorm = readRelationLabel(r, f);
      if (denorm) return denorm;
      const id = r[f] != null ? String(r[f]) : "";
      const name = id ? relLabels[f]?.get(id) : undefined;
      return name ?? (id ? fmtVal(id) : null);
    }
    return fmtVal(r[f]);
  };

  // บันทึกคอลัมน์ที่เลือก → ทะเบียน field กลาง (ทุกคนเห็นเหมือนกัน)
  const saveColumns = async (next: string[]) => {
    if (!fieldId) { alert("บันทึกไม่ได้ — ไม่พบรหัส field"); return; }
    try {
      const res = await apiFetch(`/api/admin/field-registry-v2/${fieldId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation_config: { ...config, list_sub_fields: next } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { alert("บันทึกคอลัมน์ไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      setSubFields(next);
      setPickerOpen(false);
      // โหลดใหม่ให้ค่าจาก DB มีผลทุกที่ (และยืนยันว่าบันทึกจริง)
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      alert("บันทึกคอลัมน์ไม่สำเร็จ: " + (e instanceof Error ? e.message : "network error"));
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try { const { data } = await fetchPage(rows.length); setRows((p) => [...p, ...data]); }
    catch { /* ignore */ } finally { setLoadingMore(false); }
  };

  // ปุ่มตั้งค่าคอลัมน์ (เฉพาะคนมีสิทธิ์ + เป็น field จริง)
  const gearBtn = canConfig ? (
    <button type="button" onClick={() => setPickerOpen(true)} title="เลือกคอลัมน์ที่จะแสดง"
      className="flex-shrink-0 w-6 h-6 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center text-xs">⚙</button>
  ) : null;
  const pickerModal = pickerOpen ? (
    <O2MColumnPicker allFields={allFields} titleField={titleField} imageField={imageField}
      current={subFields} onSave={saveColumns} onClose={() => setPickerOpen(false)} />
  ) : null;

  // หัวข้อ + จำนวน (สำหรับ 360 view)
  const header = title ? (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-sm font-medium text-slate-700">{title}</span>
      {loaded && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{total}</span>}
      <div className="flex-1" />
      {gearBtn}
    </div>
  ) : gearBtn ? (
    <div className="flex justify-end mb-1">{gearBtn}</div>
  ) : null;

  if (!recordId) return <>{header}<div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเห็นรายการที่เกี่ยวข้อง</div>{pickerModal}</>;
  if (!loaded) return <>{header}<div className="text-xs text-slate-400">กำลังโหลด…</div>{pickerModal}</>;
  if (rows.length === 0) return <>{header}<div className="text-xs text-slate-300">— ไม่มีรายการ —</div>{pickerModal}</>;

  const rich = !!(imageField || subFields.length > 0);

  const list = !rich ? (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={String(r.id)} className="group flex items-center gap-1 px-2 py-1 bg-slate-50 rounded border border-slate-100 hover:border-blue-300 hover:bg-blue-50/40">
          <button type="button" onClick={() => setPeek({ id: String(r.id), edit: false })} className="flex-1 min-w-0 text-left text-sm text-slate-700 inline-flex items-center gap-1">
            <span className="flex-1 truncate">{String(r[titleField] ?? r.name ?? r.id)}</span>
          </button>
          <button type="button" onClick={() => setPeek({ id: String(r.id), edit: true })} title="แก้ไข"
            className="flex-shrink-0 w-6 h-6 rounded text-xs text-slate-400 hover:text-blue-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">✎</button>
        </li>
      ))}
    </ul>
  ) : (() => {
    // แบบตาราง (ของกลาง) — คอลัมน์ = title + sub fields, มียอดรวมท้ายตาราง
    const sums: Record<string, number> = {};
    let anySum = false;
    for (const f of subFields) {
      let s = 0, has = false;
      for (const r of rows) { const n = Number(r[f]); if (r[f] !== null && r[f] !== "" && typeof r[f] !== "boolean" && isFinite(n)) { s += n; has = true; } }
      if (has) { sums[f] = s; anySum = true; }
    }
    return (
      <div className="overflow-x-auto border border-slate-100 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {imageField && <th className="px-2 py-1.5 w-10" />}
              <th className="px-2 py-1.5 text-left font-medium">{labelOf(titleField)}</th>
              {subFields.map((f) => (
                <th key={f} className={`px-2 py-1.5 font-medium whitespace-nowrap ${relCfgByField[f] ? "text-left" : "text-right"}`}>
                  <span className="inline-flex items-center gap-1">
                    {labelOf(f)}
                    {isEditableCol(f) && (
                      <button type="button" title="เติมค่าเดียวกันทุกแถว" onClick={(e) => { e.stopPropagation(); fillColumn(f); }}
                        className="text-slate-300 hover:text-blue-600">⤓</button>
                    )}
                  </span>
                </th>
              ))}
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={String(r.id)} className="group hover:bg-blue-50/40 cursor-pointer" onClick={() => setPeek({ id: String(r.id), edit: false })}>
                {imageField && (
                  <td className="px-2 py-1.5">
                    <div className="w-8 h-8 rounded bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                      {r2img(r[imageField])
                        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r2img(r[imageField])!} alt="" className="w-full h-full object-cover" />
                        : <span className="text-slate-300 text-xs">📦</span>}
                    </div>
                  </td>
                )}
                <td className="px-2 py-1.5 text-slate-700">{String(r[titleField] ?? r.name ?? r.id)}</td>
                {subFields.map((f) => {
                  const isRel = !!relCfgByField[f];
                  const editable = isEditableCol(f);
                  const editing = !!editCell && editCell.rowId === String(r.id) && editCell.field === f;
                  if (editing) {
                    return (
                      <td key={f} className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <input autoFocus
                          type={["number", "currency"].includes(typeByField[f] ?? "") ? "number" : "text"}
                          value={editVal} onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveCell(String(r.id), f, editVal); if (e.key === "Escape") setEditCell(null); }}
                          onBlur={() => saveCell(String(r.id), f, editVal)}
                          className="w-full h-7 px-1 text-sm border border-blue-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </td>
                    );
                  }
                  return (
                    <td key={f}
                      onClick={editable ? (e) => { e.stopPropagation(); setEditCell({ rowId: String(r.id), field: f }); setEditVal(r[f] == null ? "" : String(r[f])); } : undefined}
                      className={`px-2 py-1.5 text-slate-600 whitespace-nowrap ${isRel ? "text-left" : "text-right tabular-nums"} ${editable ? "cursor-text hover:bg-blue-50/60" : ""}`}>
                      {cellValue(r, f) ?? "—"}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" title="แก้ไข" onClick={(e) => { e.stopPropagation(); setPeek({ id: String(r.id), edit: true }); }}
                    className="w-6 h-6 rounded text-xs text-slate-400 hover:text-blue-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity">✎</button>
                </td>
              </tr>
            ))}
          </tbody>
          {anySum && (
            <tfoot className="bg-slate-50 font-semibold text-slate-700">
              <tr>
                {imageField && <td />}
                <td className="px-2 py-1.5 text-xs text-slate-500">รวม ({rows.length})</td>
                {subFields.map((f) => <td key={f} className="px-2 py-1.5 text-right tabular-nums">{sums[f] != null ? sums[f].toLocaleString() : ""}</td>)}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  })();

  return (
    <>
      {header}
      {list}
      {rows.length < total && (
        <button type="button" onClick={loadMore} disabled={loadingMore}
          className="mt-1.5 w-full h-8 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {loadingMore ? "กำลังโหลด…" : `ดูเพิ่ม (เหลืออีก ${total - rows.length})`}
        </button>
      )}
      {peek && moduleKey && (
        <RelationPeekModal moduleKey={moduleKey} recordId={peek.id} startInEdit={peek.edit}
          onChanged={load} onClose={() => setPeek(null)} />
      )}
      {pickerModal}
    </>
  );
}
