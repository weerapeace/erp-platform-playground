"use client";

/**
 * C2b: widget สำหรับ many2many + one2many
 * - RelationMany2Many: เลือกหลายค่า (จัดการ link ใน junction table ทันที)
 * - RelationOne2Many: แสดงรายการลูกที่ชี้กลับมา (read-only)
 */
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import nextDynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { ImageInput } from "@/components/image-input";
import { TagOrganizerModal } from "@/components/tag-organizer";
import { resolveRelationLabels, readRelationLabel, type RelationConfig } from "@/lib/relation";
// drawer เก่าตัวจริงของ MasterCRUD — dynamic กัน import วน (master-crud import ไฟล์นี้อยู่)
const MasterRecordDrawer = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

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
  list_display_mode?: string;         // 'table' | 'tags' | 'cards' | 'master_detail'
  parent_match_field?: string;        // ฟิลด์ของพ่อที่ใช้จับคู่ (default 'id'; เช่น 'code' = เชื่อมด้วยรหัส)
  detail_field?: string;              // master_detail: field_key ของ o2m ชั้น 2 บน target module (เช่น bom_lines บน bom-headers)
};

type Opt = { id: string; label: string; group_id?: string | null; sort_order?: number };
type Grp = { id: string; name: string; parent_group_id: string | null; single_select: boolean; sort_order: number };

async function fetchOptions(moduleKey: string, labelField: string, targetTable?: string, useGroups?: boolean): Promise<Opt[]> {
  // product_families (มีระบบกลุ่ม) → master-v2 (ได้ group_id) · ตารางอื่น → picker กลาง (ตารางใดก็ได้)
  if (!useGroups && targetTable) {
    const r = await apiFetch(`/api/admin/picker?table=${encodeURIComponent(targetTable)}&label=${encodeURIComponent(labelField)}&limit=500`);
    const j = await r.json();
    return ((j.data ?? []) as { id: string; label: string }[]).map((o) => ({ id: String(o.id), label: String(o.label ?? o.id), group_id: null }));
  }
  const r = await apiFetch(`/api/master-v2/${moduleKey}?limit=500`);
  const j = await r.json();
  return (j.data ?? j.rows ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    label: String(row[labelField] ?? row.name ?? row.id),
    group_id: row.group_id ? String(row.group_id) : null,
    sort_order: row.sort_order != null ? Number(row.sort_order) : undefined,
  }));
}

// โหลดรายชื่อกลุ่มแท็ก (ใช้กับ product_families เท่านั้น)
async function fetchGroups(): Promise<Grp[]> {
  const r = await apiFetch(`/api/master-v2/product_family_groups?limit=500`);
  const j = await r.json();
  return ((j.data ?? []) as Record<string, unknown>[]).map((g) => ({
    id: String(g.id), name: String(g.name ?? ""),
    parent_group_id: g.parent_group_id ? String(g.parent_group_id) : null,
    single_select: g.single_select === true, sort_order: Number(g.sort_order ?? 100),
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
    // ไม่เอา include_inactive → แท็กที่ลบแล้ว (is_active=false) จะหายไปจากรายการ (ลบแล้วเห็นว่าหายจริง)
    apiFetch(`/api/master-v2/${moduleKey}?limit=500`).then((r) => r.json())
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
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const labelField = config.target_label_field ?? "name";
  const isCreate = !recordId;
  const usesGroups = moduleKey === "product_families";   // แท็กที่มีระบบกลุ่ม
  const allowCreate = usesGroups && config.allow_create !== false;   // สร้าง/จัดการ เฉพาะแท็ก product_families
  const pickTitle = usesGroups ? "เลือกแท็ก (Product Family)" : "เลือกข้อมูล";

  const [opts, setOpts] = useState<Opt[]>([]);
  const [groups, setGroups] = useState<Grp[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [mgrOpen, setMgrOpen] = useState(false);       // popup จัดการแท็ก
  const [pickerOpen, setPickerOpen] = useState(false); // popup เลือกแท็ก (แบ่งกลุ่ม)

  // แหล่งความจริงเดียว = ค่าในฟอร์ม (value) — ไม่มี state ภายใน widget (กัน diverge/remount ทำค่าหาย)
  const loading = !isCreate && value === undefined;
  const linked = value ?? [];
  const linkedRef = useRef<string[]>(linked);
  linkedRef.current = linked;

  const reloadOpts = useCallback(() => { fetchOptions(moduleKey, labelField, config.target_table, usesGroups).then(setOpts).catch(() => {}); }, [moduleKey, labelField, config.target_table, usesGroups]);
  useEffect(() => { reloadOpts(); }, [reloadOpts]);
  useEffect(() => { if (usesGroups) fetchGroups().then(setGroups).catch(() => {}); }, [usesGroups]);

  const labelOf = (id: string) => opts.find((o) => o.id === id)?.label ?? id.slice(0, 8);

  // ── ระบบกลุ่ม + "เลือกได้แค่ 1" ──
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  // scope การบังคับเลือกเดียว = ancestor ที่ single_select สูงสุดในสายโซ่กลุ่มของแท็ก
  const scopeOfGroup = useCallback((gid: string | null): string | null => {
    let cur = gid, found: string | null = null; const seen = new Set<string>();
    while (cur && !seen.has(cur)) { seen.add(cur); const n = groupById.get(cur); if (!n) break; if (n.single_select) found = cur; cur = n.parent_group_id; }
    return found;
  }, [groupById]);
  const scopeOfTag = useCallback((id: string): string | null => {
    const o = opts.find((x) => x.id === id); return o ? scopeOfGroup(o.group_id ?? null) : null;
  }, [opts, scopeOfGroup]);

  // toggle: ถ้าแท็กอยู่ในกลุ่ม "เลือกได้แค่ 1" → เอาแท็กอื่นใน scope เดียวกันออกก่อน
  const toggle = (id: string) => {
    if (loading) return;
    const cur = linkedRef.current;
    let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else {
      const sc = scopeOfTag(id);
      const base = sc ? cur.filter((x) => scopeOfTag(x) !== sc) : cur;
      next = [...base, id];
    }
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
      setOpts((o) => [...o, { id, label: name, group_id: null }]);
      setQ("");
      toggle(id);
    } catch (e) { alert("สร้างแท็กไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); }
    finally { setBusy(false); }
  };

  const ql = q.trim().toLowerCase();
  const filteredOpts = opts.filter((o) => !ql || o.label.toLowerCase().includes(ql));
  const exact = opts.some((o) => o.label.trim().toLowerCase() === ql);

  // จัดโครงสร้างกลุ่มสำหรับ popup (กลุ่ม → กลุ่มย่อย → แท็ก)
  const byOrder = (a: Grp, b: Grp) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th");
  const topGroups = groups.filter((g) => !g.parent_group_id).sort(byOrder);
  const subsOf = (gid: string) => groups.filter((g) => g.parent_group_id === gid).sort(byOrder);
  const byTagOrder = (a: Opt, b: Opt) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.label.localeCompare(b.label, "th");
  const tagsOf = (gid: string) => filteredOpts.filter((o) => o.group_id === gid).sort(byTagOrder);
  const ungrouped = filteredOpts.filter((o) => !o.group_id || !groupById.has(o.group_id)).sort(byTagOrder);

  // แถวแท็ก 1 อันใน popup (single = อยู่ในกลุ่มเลือกเดียว → วงกลม, ปกติ → ติ๊กถูก)
  const tagRow = (o: Opt) => {
    const on = linked.includes(o.id);
    const single = scopeOfTag(o.id) != null;
    return (
      <button key={o.id} type="button" onClick={() => toggle(o.id)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left rounded hover:bg-slate-50 ${on ? "bg-blue-50/60" : ""}`}>
        <span className={`inline-flex items-center justify-center w-4 h-4 ${single ? "rounded-full" : "rounded"} border text-[10px] leading-none ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-transparent"}`}>
          {single ? "●" : "✓"}
        </span>
        <span className="flex-1 truncate">{o.label}</span>
      </button>
    );
  };

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
        <div className="flex gap-1.5">
          <button type="button" onClick={() => { setPickerOpen(true); setQ(""); }}
            className="h-8 px-3 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">＋ {usesGroups ? "เลือก/แก้ไขแท็ก" : "เลือก"}</button>
          {usesGroups && (
            <button type="button" onClick={() => setMgrOpen(true)} title="จัดการแท็ก (เพิ่ม/แก้ชื่อ/ลบ)"
              className="h-8 px-2.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">🗂️</button>
          )}
        </div>
      )}

      {/* POPUP เลือกแท็ก แบ่งกลุ่ม → กลุ่มย่อย */}
      {pickerOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[94vw] max-h-[82vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{pickTitle}</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
            </div>
            <div className="px-3 pt-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="ค้นหา / พิมพ์เพื่อเพิ่ม…"
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {usesGroups && topGroups.map((g) => {
                const direct = tagsOf(g.id);
                const subs = subsOf(g.id).map((s) => ({ s, tags: tagsOf(s.id) }));
                const anySub = subs.some((x) => x.tags.length > 0);
                if (direct.length === 0 && !anySub) return null;
                return (
                  <div key={g.id} className="border border-slate-100 rounded-lg">
                    <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{g.name}</span>
                      {g.single_select && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">เลือกได้ 1</span>}
                    </div>
                    <div className="p-1">
                      {direct.map((o) => tagRow(o))}
                      {subs.filter((x) => x.tags.length > 0).map(({ s, tags }) => (
                        <div key={s.id} className="mt-1">
                          <div className="px-2 py-1 flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500">↳ {s.name}</span>
                            {s.single_select && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">เลือกได้ 1</span>}
                          </div>
                          {tags.map((o) => tagRow(o))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {ungrouped.length > 0 && (
                <div className="border border-slate-100 rounded-lg">
                  <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100 text-sm font-medium text-slate-500">{usesGroups ? "ไม่มีกลุ่ม" : "แท็กทั้งหมด"}</div>
                  <div className="p-1">{ungrouped.map((o) => tagRow(o))}</div>
                </div>
              )}
              {filteredOpts.length === 0 && !ql && <div className="text-xs text-slate-300 py-4 text-center">{usesGroups ? "— ยังไม่มีแท็ก —" : "— ไม่มีข้อมูลให้เลือก —"}</div>}
              {allowCreate && ql && !exact && (
                <button type="button" onClick={createNew} disabled={busy}
                  className="flex items-center gap-2 w-full px-2 py-2 text-sm text-left rounded text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200">
                  ➕ สร้างแท็กใหม่ “{q.trim()}”
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-3 py-3 border-t border-slate-100">
              {usesGroups
                ? <button type="button" onClick={() => setMgrOpen(true)} className="h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">🗂️ จัดการแท็ก</button>
                : <span />}
              <button type="button" onClick={() => setPickerOpen(false)} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">เสร็จ ({linked.length})</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {mgrOpen && (usesGroups ? (
        // แท็กที่มีระบบกลุ่ม → ตัวจัดการแบบลากวาง (ย้ายกลุ่ม/หมวดย่อย + เรียงลำดับ)
        <TagOrganizerModal moduleKey={moduleKey} labelField={labelField}
          onClose={() => setMgrOpen(false)}
          onChanged={() => { reloadOpts(); fetchGroups().then(setGroups).catch(() => {}); }} />
      ) : (
        <TagsManagerModal moduleKey={moduleKey} labelField={labelField}
          onClose={() => setMgrOpen(false)}
          onChanged={() => { reloadOpts(); }} />
      ))}
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

// ---- เลือกรายการที่ "มีอยู่แล้ว" มาผูกเป็นลูก (ตั้งค่า FK) — ของกลาง ใช้ได้ทุก one2many ----
function O2MAttachPicker({ moduleKey, fk, matchValue, titleField, imageField, labels, alreadyIds, title, onAttached, onClose }: {
  moduleKey: string; fk: string; matchValue: string | number; titleField: string;
  imageField?: string;
  labels: Record<string, string>; alreadyIds: Set<string>; title?: string;
  onAttached: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // ฟิลด์ชื่อรอง (โชว์ใต้รหัส) — เลือกตัวแรกที่มีจริง
  const secField = ["name_th", "name", "color_th", "color"].find((k) => k !== titleField && rows.some((r) => r[k] != null && r[k] !== ""));
  // คอลัมน์รูป: ใช้ที่ config ตั้งไว้ ไม่งั้นเดาจากคอลัมน์รูปยอดนิยมที่มีค่าจริง (ให้โชว์รูปได้ทุกที่)
  const imgField = imageField || ["cover_image_r2_key", "image_key", "cover_url", "image_url", "cover_image", "image", "thumbnail_url", "photo_url"].find((k) => rows.some((r) => r[k] != null && r[k] !== ""));
  // รับได้ทั้ง R2 key และ URL เต็ม · ย่อรูป (&w) เพื่อความเร็ว
  const thumbSrc = (v: unknown): string | null => {
    if (v == null || v === "") return null;
    const s = String(v);
    const base = /^(https?:|\/)/.test(s) ? s : `/api/r2-image?key=${encodeURIComponent(s)}`;
    return base.includes("/api/r2-image") ? `${base}&w=72` : base;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      const sp = q.trim() ? `&search=${encodeURIComponent(q.trim())}` : "";
      apiFetch(`/api/master-v2/${moduleKey}?limit=30&offset=0${sp}`).then((r) => r.json())
        .then((j) => { if (alive) setRows((j.data ?? j.rows ?? []) as Record<string, unknown>[]); })
        .catch(() => { if (alive) setRows([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q, moduleKey]);

  const candidates = rows.filter((r) => !alreadyIds.has(String(r.id)));   // ตัดตัวที่เป็นลูกใบนี้อยู่แล้วออก
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const attach = async () => {
    if (picked.size === 0) return;
    setSaving(true);
    try {
      const edits = [...picked].map((id) => ({ id, changes: { [fk]: matchValue } }));
      const res = await apiFetch(`/api/master-v2/${moduleKey}/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { alert("แนบไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      onAttached(); onClose();
    } catch (e) { alert("แนบไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">เลือก{title ? ` ${title}` : "รายการ"}ที่มีอยู่แล้ว</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>
        <div className="p-3 border-b border-slate-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส/ชื่อ…" autoFocus
            className="w-full h-8 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-400" />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loading && <div className="px-3 py-4 text-xs text-slate-400 text-center">กำลังโหลด…</div>}
          {!loading && candidates.length === 0 && <div className="px-3 py-6 text-xs text-slate-400 text-center">— ไม่พบรายการให้เลือก —</div>}
          {!loading && candidates.map((r) => {
            const id = String(r.id);
            const checked = picked.has(id);
            const fkVal = r[fk];
            const linkedElsewhere = fkVal != null && fkVal !== "" && String(fkVal) !== String(matchValue);
            return (
              <button key={id} type="button" onClick={() => toggle(id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                <span className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 ${checked ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white"}`}>{checked && <span className="text-[10px] leading-none">✓</span>}</span>
                {imgField && (() => {
                  const src = thumbSrc(r[imgField]);
                  return src
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={src} alt="" loading="lazy" className="w-9 h-9 rounded-md object-contain bg-slate-50 border border-slate-200 flex-shrink-0" />
                    : <span className="w-9 h-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 text-sm flex-shrink-0">📦</span>;
                })()}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{String(r[titleField] ?? r.name ?? id)}</span>
                  {secField && r[secField] != null && r[secField] !== "" && <span className="block text-[11px] text-slate-400 truncate">{String(r[secField])}</span>}
                </span>
                {linkedElsewhere && <span className="flex-shrink-0 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-1">อยู่ใบอื่น</span>}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{picked.size > 0 ? `เลือก ${picked.size} รายการ` : "เลือกรายการที่จะผูก"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 text-sm text-slate-600 hover:bg-slate-100 rounded-md">ยกเลิก</button>
            <button onClick={attach} disabled={saving || picked.size === 0}
              className="h-8 px-4 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-40">
              {saving ? "กำลังผูก…" : `ผูกเป็นลูก (${picked.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RelationOne2Many({ config, recordId, title, fieldId, configurable, parentCode, parentValues }: { config: RelConfig; recordId?: string | null; title?: string; fieldId?: string; configurable?: boolean; parentCode?: string; parentValues?: Record<string, unknown> }) {
  const moduleKey = config.target_module_key ?? config.target_table ?? "";
  const fk = config.target_fk_column ?? "";
  const titleField = config.list_title_field ?? config.target_label_field ?? "name";
  const imageField = config.list_image_field;
  // จับคู่ด้วยฟิลด์ไหนของพ่อ: 'id' = ลิงก์ id ปกติ (ใช้ recordId) · อื่นๆ เช่น 'code' = เชื่อมด้วยรหัส (ใช้ค่าจาก parentValues)
  const matchField = config.parent_match_field || "id";
  const matchValue = matchField === "id" ? recordId : ((parentValues?.[matchField] as string | number | null | undefined) ?? null);
  // เงื่อนไข filter สำหรับจับลูก: id → eq (uuid) · รหัส/ข้อความ → in (ตรงเป๊ะ)
  const matchCond = matchField === "id"
    ? { type: "text", value: String(matchValue ?? "") }
    : { type: "select", selected: [String(matchValue ?? "")] };
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
  // เรียงลำดับตารางลูก (server-side) — กดหัวคอลัมน์
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (col: string) =>
    setSort((p) => (p && p.col === col ? { col, dir: p.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
  const sortArrow = (col: string) => (sort?.col === col ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  // ดึงทีละหน้า (filter fk ที่ server) — จับคู่ด้วย id (ilike/eq) หรือรหัส/ข้อความ (select = ตรงเป๊ะ)
  const fetchPage = useCallback(async (offset: number) => {
    const flt = encodeURIComponent(JSON.stringify({ [fk]: matchCond }));
    const sortQ = sort ? `&sort_by=${encodeURIComponent(sort.col)}&sort_dir=${sort.dir}` : "";
    const j = await apiFetch(`/api/master-v2/${moduleKey}?limit=${PAGE}&offset=${offset}&filters=${flt}${sortQ}`).then((r) => r.json());
    return { data: (j.data ?? j.rows ?? []) as Record<string, unknown>[], total: Number(j.total ?? 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey, fk, matchField, matchValue, sort]);

  const load = useCallback(() => {
    if (matchValue == null || matchValue === "" || !fk) return;
    setLoaded(false);
    fetchPage(0).then(({ data, total }) => { setRows(data); setTotal(total); setLoaded(true); }).catch(() => setLoaded(true));
  }, [matchValue, fk, fetchPage]);

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
    if (matchValue == null || !fkCol) return;
    const raw = window.prompt(`เติมค่า "${labelOf(field)}" ให้รายการลูกทุกตัวของใบนี้:`, "");
    if (raw == null) return;
    const val = parseByType(field, raw);
    try {
      const res = await apiFetch(`/api/master-v2/${moduleKey}/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { [field]: val }, filters: { [fkCol]: matchCond } }),
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

  // ปุ่มเพิ่มรายการลูก (สร้าง record ใหม่ในตารางลูก โดยผูก FK กลับมาหา record นี้ให้อัตโนมัติ)
  const [creating, setCreating] = useState(false);
  const canAdd = canEditRows && !!recordId && !!fk && !!moduleKey;
  // inline add-row: พิมพ์ในแถวว่างท้ายตารางแล้วสร้างลูกได้เลย (ไม่ต้องเปิด popup)
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [newImg, setNewImg] = useState<string | null>(null);   // รูปปกของแถวที่กำลังเพิ่ม (r2 key)
  const [adding, setAdding] = useState(false);

  // ไล่เลข code อัตโนมัติ = {parentCode}-{NN} (หาเลขถัดไปจากลูกที่มีอยู่ของ parent นี้)
  const genNextCode = async () => {
    if (!parentCode || matchValue == null || !fk) return;
    try {
      const flt = encodeURIComponent(JSON.stringify({ [fk]: matchCond }));
      const j = await apiFetch(`/api/master-v2/${moduleKey}?limit=500&offset=0&filters=${flt}`).then((r) => r.json());
      const childRows = (j.data ?? j.rows ?? []) as Record<string, unknown>[];
      const esc = parentCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${esc}-(\\d+)$`);
      let max = 0, width = 2;
      childRows.forEach((r) => {
        const m = re.exec(String(r[titleField] ?? ""));
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; width = Math.max(width, m[1].length); }
      });
      setNewRow((p) => ({ ...p, [titleField]: `${parentCode}-${String(max + 1).padStart(width, "0")}` }));
    } catch { setNewRow((p) => ({ ...p, [titleField]: `${parentCode}-01` })); }
  };

  const submitNewRow = async () => {
    const code = (newRow[titleField] ?? "").trim();
    if (!code || matchValue == null || !fk) return;
    setAdding(true);
    try {
      const body: Record<string, unknown> = { [fk]: matchValue, [titleField]: code, is_active: true };
      if (imageField && newImg) body[imageField] = newImg;
      subFields.forEach((f) => {
        if (!isEditableCol(f)) return;
        const raw = newRow[f];
        if (raw != null && raw !== "") body[f] = parseByType(f, raw);
      });
      const res = await apiFetch(`/api/master-v2/${moduleKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { alert("เพิ่มไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      setNewRow({});
      setNewImg(null);
      load();
    } catch (e) { alert("เพิ่มไม่สำเร็จ: " + (e instanceof Error ? e.message : "network")); }
    finally { setAdding(false); }
  };
  const addBtn = canAdd ? (
    <button type="button" onClick={() => setCreating(true)} title="เพิ่มแบบกรอกครบทุกช่อง (popup)"
      className="flex-shrink-0 h-6 px-2 rounded-md text-xs font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1">+ เพิ่มแบบเต็ม</button>
  ) : null;
  const createModal = creating ? (
    <MasterRecordDrawer moduleKey={moduleKey} recordId={null}
      createDefaults={{ [fk]: matchValue, is_active: true }}
      createTitle={title ? `เพิ่ม ${title}` : "เพิ่มรายการใหม่"}
      onChanged={load} onClose={() => setCreating(false)} />
  ) : null;

  // เลือก "ที่มีอยู่แล้ว" มาผูกเป็นลูก (ตั้งค่า FK ให้ชี้มาหาใบนี้) — ของกลาง ใช้ได้ทุก one2many
  const [attaching, setAttaching] = useState(false);
  const attachBtn = (canAdd && matchValue != null && matchValue !== "") ? (
    <button type="button" onClick={() => setAttaching(true)} title="เลือกรายการที่มีอยู่แล้วมาผูกเป็นลูก"
      className="flex-shrink-0 h-6 px-2 rounded-md text-xs font-medium border border-emerald-200 text-emerald-600 hover:bg-emerald-50 inline-flex items-center gap-1">+ เลือกที่มีอยู่</button>
  ) : null;
  const attachModal = attaching ? (
    <O2MAttachPicker moduleKey={moduleKey} fk={fk} matchValue={matchValue as string | number}
      titleField={titleField} imageField={imageField} labels={labels} alreadyIds={new Set(rows.map((r) => String(r.id)))}
      title={title} onAttached={load} onClose={() => setAttaching(false)} />
  ) : null;

  // หัวข้อ + จำนวน (สำหรับ 360 view)
  const header = (title || gearBtn || addBtn) ? (
    <div className="flex items-center gap-1.5 mb-1.5">
      {title && <span className="text-sm font-medium text-slate-700">{title}</span>}
      {title && loaded && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{total}</span>}
      <div className="flex-1" />
      {attachBtn}
      {addBtn}
      {gearBtn}
    </div>
  ) : null;

  const displayMode = config.list_display_mode;     // 'table' | 'tags' | 'cards'
  const rich = displayMode === "tags" ? false : !!(imageField || subFields.length > 0);
  const showInlineAdd = canAdd && rich;   // แถวเพิ่มแบบ inline (เฉพาะโหมดตาราง)

  if (matchValue == null || matchValue === "") return <>{header}<div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเห็นรายการที่เกี่ยวข้อง</div>{pickerModal}</>;
  if (!loaded) return <>{header}<div className="text-xs text-slate-400">กำลังโหลด…</div>{pickerModal}</>;

  // โหมด tag-ชิป — แสดงแต่ละลูกเป็นชิป (เพิ่มผ่านปุ่ม "+ เพิ่มแบบเต็ม")
  if (displayMode === "tags") {
    return (
      <>
        {header}
        {rows.length === 0 ? (
          <div className="text-xs text-slate-300">— ไม่มีรายการ —</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rows.map((r) => (
              <button key={String(r.id)} type="button" onClick={() => setPeek({ id: String(r.id), edit: false })}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-700 border border-slate-200 hover:border-blue-300 hover:bg-blue-50">
                {String(r[titleField] ?? r.name ?? r.id)}
              </button>
            ))}
            {rows.length < total && (
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="px-2 py-1 text-xs rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                {loadingMore ? "…" : `+${total - rows.length}`}
              </button>
            )}
          </div>
        )}
        {peek && moduleKey && (
          <MasterRecordDrawer moduleKey={moduleKey} recordId={peek.id} startInEdit={peek.edit} onChanged={load} onClose={() => setPeek(null)} />
        )}
        {pickerModal}{createModal}{attachModal}
      </>
    );
  }

  // โหมดการ์ด — รูป + ชื่อ + ข้อมูลย่อย (กริด)
  if (displayMode === "cards") {
    return (
      <>
        {header}
        {rows.length === 0 ? (
          <div className="text-xs text-slate-300">— ไม่มีรายการ —</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rows.map((r) => (
              <button key={String(r.id)} type="button" onClick={() => setPeek({ id: String(r.id), edit: false })}
                className="text-left border border-slate-200 rounded-lg overflow-hidden hover:border-blue-300 hover:shadow-sm">
                <div className="aspect-square bg-slate-50 flex items-center justify-center">
                  {imageField && r2img(r[imageField])
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={r2img(r[imageField])!} alt="" className="w-full h-full object-cover" />
                    : <span className="text-slate-300 text-2xl">📦</span>}
                </div>
                <div className="p-1.5">
                  <div className="text-xs font-medium text-slate-700 truncate">{String(r[titleField] ?? r.name ?? r.id)}</div>
                  {subFields.map((f) => <div key={f} className="text-[10px] text-slate-400 truncate">{cellValue(r, f) ?? "—"}</div>)}
                </div>
              </button>
            ))}
          </div>
        )}
        {rows.length < total && (
          <button type="button" onClick={loadMore} disabled={loadingMore}
            className="mt-1.5 w-full h-8 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {loadingMore ? "กำลังโหลด…" : `ดูเพิ่ม (เหลืออีก ${total - rows.length})`}
          </button>
        )}
        {peek && moduleKey && (
          <MasterRecordDrawer moduleKey={moduleKey} recordId={peek.id} startInEdit={peek.edit} onChanged={load} onClose={() => setPeek(null)} />
        )}
        {pickerModal}{createModal}{attachModal}
      </>
    );
  }

  // ว่าง + เพิ่ม inline ไม่ได้ → โชว์ข้อความ; ถ้าเพิ่ม inline ได้ → ตกลงไปเรนเดอร์ตาราง (มีแถวว่างให้พิมพ์)
  if (rows.length === 0 && !showInlineAdd) return <>{header}<div className="text-xs text-slate-300">— ไม่มีรายการ —</div>{pickerModal}{createModal}</>;

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
              <th className="px-2 py-1.5 text-left font-medium">
                <button type="button" onClick={() => toggleSort(titleField)} title="กดเพื่อเรียง"
                  className="inline-flex items-center gap-0.5 hover:text-slate-700">
                  {labelOf(titleField)}<span className="text-blue-500">{sortArrow(titleField)}</span>
                </button>
              </th>
              {subFields.map((f) => (
                <th key={f} className={`px-2 py-1.5 font-medium whitespace-nowrap ${relCfgByField[f] ? "text-left" : "text-right"}`}>
                  <span className={`inline-flex items-center gap-1 ${relCfgByField[f] ? "" : "flex-row-reverse"}`}>
                    <button type="button" onClick={() => toggleSort(f)} title="กดเพื่อเรียง"
                      className="inline-flex items-center gap-0.5 hover:text-slate-700">
                      {labelOf(f)}<span className="text-blue-500">{sortArrow(f)}</span>
                    </button>
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
            {showInlineAdd && (
              <tr className="bg-amber-50/50">
                {imageField && (
                  <td className="px-2 py-1.5">
                    <ImageInput compact value={newImg} onChange={setNewImg} folder={moduleKey} disabled={adding} />
                  </td>
                )}
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1">
                    <input value={newRow[titleField] ?? ""} disabled={adding}
                      onChange={(e) => setNewRow((p) => ({ ...p, [titleField]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") void submitNewRow(); }}
                      placeholder={`+ ${labelOf(titleField)} ใหม่…`}
                      className="flex-1 min-w-0 h-7 px-1.5 text-sm border border-amber-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
                    {parentCode && (
                      <button type="button" onClick={() => void genNextCode()} disabled={adding}
                        title={`ไล่เลขอัตโนมัติ (${parentCode}-xx)`}
                        className="flex-shrink-0 h-7 px-1.5 rounded border border-amber-300 bg-white text-amber-600 hover:bg-amber-100 text-xs font-medium disabled:opacity-40">🔢</button>
                    )}
                  </div>
                </td>
                {subFields.map((f) => {
                  const editable = isEditableCol(f);
                  if (!editable) return <td key={f} className="px-2 py-1.5 text-center text-slate-300 text-xs">—</td>;
                  const isNum = ["number", "currency"].includes(typeByField[f] ?? "");
                  return (
                    <td key={f} className="px-2 py-1">
                      <input value={newRow[f] ?? ""} disabled={adding} type={isNum ? "number" : "text"}
                        onChange={(e) => setNewRow((p) => ({ ...p, [f]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") void submitNewRow(); }}
                        placeholder={labelOf(f)}
                        className={`w-full h-7 px-1.5 text-sm border border-amber-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 ${isNum ? "text-right" : ""}`} />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" onClick={() => void submitNewRow()} title="เพิ่ม (หรือกด Enter)"
                    disabled={adding || !(newRow[titleField] ?? "").trim()}
                    className="h-7 px-2 rounded-md text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                    {adding ? "…" : "เพิ่ม"}
                  </button>
                </td>
              </tr>
            )}
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
        <MasterRecordDrawer moduleKey={moduleKey} recordId={peek.id} startInEdit={peek.edit}
          onChanged={load} onClose={() => setPeek(null)} />
      )}
      {pickerModal}
      {createModal}
      {attachModal}
    </>
  );
}

// ============================================================
// MasterDetailRelation — o2m 2 ชั้น (เช่น BOM Builder)
//   ชั้น 1: เลือก "ใบ" (เช่น BOM version) เป็นแท็บด้านบน
//   ชั้น 2: รายการลูกของใบที่เลือก โชว์/แก้ inline ข้างล่าง (reuse RelationOne2Many)
// config: o2m ชั้น 1 ปกติ + detail_field = field_key ของ o2m ชั้น 2 บน target module
// ============================================================
export function MasterDetailRelation({ config, recordId, configurable, parentValues }: {
  config: RelConfig; recordId?: string | null; configurable?: boolean; parentValues?: Record<string, unknown>;
}) {
  const l1ModuleKey = config.target_module_key ?? config.target_table ?? "";  // เช่น bom-headers
  const l1Fk = config.target_fk_column ?? "";                                  // เช่น product_sku
  const l1MatchField = config.parent_match_field || "id";                      // เช่น code
  const l1MatchValue = l1MatchField === "id" ? recordId : ((parentValues?.[l1MatchField] as string | number | null | undefined) ?? null);
  const l1TitleField = config.list_title_field ?? config.target_label_field ?? "code";
  const detailFieldKey = config.detail_field ?? "";

  const [headers, setHeaders] = useState<Record<string, unknown>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [detailCfg, setDetailCfg] = useState<RelConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const matchCond = l1MatchField === "id"
    ? { type: "text", value: String(l1MatchValue ?? "") }
    : { type: "select", selected: [String(l1MatchValue ?? "")] };

  // โหลด "ใบ" ชั้น 1 (เช่น BOM versions)
  const loadHeaders = useCallback(() => {
    if (l1MatchValue == null || l1MatchValue === "" || !l1Fk || !l1ModuleKey) return;
    const flt = encodeURIComponent(JSON.stringify({ [l1Fk]: matchCond }));
    apiFetch(`/api/master-v2/${l1ModuleKey}?limit=100&filters=${flt}`).then((r) => r.json()).then((j) => {
      const rows = (j.data ?? j.rows ?? []) as Record<string, unknown>[];
      setHeaders(rows);
      setSelId((prev) => (prev && rows.some((r) => String(r.id) === prev)) ? prev : (rows[0] ? String(rows[0].id) : null));
      setLoaded(true);
    }).catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l1ModuleKey, l1Fk, l1MatchValue]);
  useEffect(() => { loadHeaders(); }, [loadHeaders]);

  // โหลด config ของ o2m ชั้น 2 จากทะเบียน field ของ target module (เช่น bom_lines บน bom-headers)
  useEffect(() => {
    if (!l1ModuleKey || !detailFieldKey) return;
    apiFetch(`/api/admin/field-registry-v2?module=${encodeURIComponent(l1ModuleKey)}`).then((r) => r.json()).then((j) => {
      const f = ((j.fields ?? []) as Record<string, unknown>[]).find((x) => String(x.field_key) === detailFieldKey);
      if (f?.relation_config) setDetailCfg(f.relation_config as RelConfig);
    }).catch(() => {});
  }, [l1ModuleKey, detailFieldKey]);

  const selected = headers.find((h) => String(h.id) === selId) ?? null;
  const canAdd = !!configurable && l1MatchValue != null && l1MatchValue !== "" && !!l1Fk;

  if (l1MatchValue == null || l1MatchValue === "") return <div className="text-xs text-slate-400 italic">บันทึกระเบียนก่อน จึงเห็นรายการที่เกี่ยวข้อง</div>;
  if (!loaded) return <div className="text-xs text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-2">
      {/* ชั้น 1: เลือกใบ (version) เป็นแท็บ */}
      <div className="flex flex-wrap items-center gap-1.5">
        {headers.length === 0 && <span className="text-xs text-slate-300">— ยังไม่มี —</span>}
        {headers.map((h) => {
          const isSel = String(h.id) === selId;
          const isDefault = h.is_default === true;
          return (
            <button key={String(h.id)} type="button" onClick={() => setSelId(String(h.id))}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                isSel ? "border-orange-400 bg-orange-50 text-orange-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:border-orange-300"
              }`}>
              <span>{String(h[l1TitleField] ?? h.id)}</span>
              {h.version != null && h.version !== "" && <span className="text-[10px] text-slate-400">{String(h.version)}</span>}
              {isDefault && <span className="text-[10px] text-emerald-500" title="ค่าเริ่มต้น">★</span>}
            </button>
          );
        })}
        {canAdd && (
          <button type="button" onClick={() => setCreating(true)}
            className="px-2.5 py-1 text-xs rounded-lg border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50">+ เพิ่ม version</button>
        )}
      </div>

      {/* ชั้น 2: รายการลูกของใบที่เลือก (reuse RelationOne2Many — มี inline add/edit ครบ) */}
      {selected && detailCfg ? (
        <div className="border border-slate-150 rounded-lg p-2 bg-slate-50/40">
          <RelationOne2Many config={detailCfg} recordId={String(selected.id)} parentValues={selected}
            configurable={configurable} parentCode={String(selected[l1TitleField] ?? "")} />
        </div>
      ) : selected && !detailCfg ? (
        <div className="text-xs text-amber-600">— ยังไม่ได้ตั้งค่ารายการลูกชั้นใน (detail_field) —</div>
      ) : null}

      {/* เพิ่มใบใหม่ (version) */}
      {creating && (
        <MasterRecordDrawer moduleKey={l1ModuleKey} recordId={null}
          createDefaults={{ [l1Fk]: l1MatchValue, is_active: true }}
          createTitle="เพิ่ม BOM version ใหม่"
          onChanged={loadHeaders} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
