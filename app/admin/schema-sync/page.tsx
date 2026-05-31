"use client";

/**
 * Admin Schema Sync — Sprint 1 + Sprint 11
 *
 * URL: /admin/schema-sync
 *
 * Sprint 1:
 * - เลือก module
 * - ปุ่ม "Sync from Supabase" — ดึง column ใหม่จาก DB
 * - ตาราง field — แก้ visible/filterable/sortable/required/label/group/width
 *
 * Sprint 11:
 * - ✋ Drag-drop reorder fields → PATCH bulk display_order
 * - ☑ Checkbox + bulk action bar → set visible/filter/sort หลาย row พร้อมกัน
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import type { SchemaSyncResponse, RegistryField } from "@/app/api/admin/schema-sync/route";
import {
  DndContext, DragEndEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const MODULES = [
  { key: "parent-skus-v2", label: "Parent SKUs (v2)" },
  { key: "skus-v2",        label: "SKUs (v2)" },
  { key: "partners-v2",    label: "Partners (v2)" },
  { key: "brands",         label: "Brands" },
  { key: "collections",    label: "Collections" },
];

const GROUP_OPTIONS = [
  { value: "core",      label: "ข้อมูลหลัก" },
  { value: "relations", label: "ความสัมพันธ์" },
  { value: "pricing",   label: "ราคา" },
  { value: "specs",     label: "ขนาด/สเปก" },
  { value: "content",   label: "เนื้อหา" },
  { value: "status",    label: "สถานะ" },
  { value: "system",    label: "ระบบ" },
  { value: "other",     label: "อื่นๆ" },
];

const UI_TYPE_OPTIONS = ["text", "number", "boolean", "date", "select", "relation", "json", "textarea"];

// 12 columns — ต้อง match กับ FieldRow + thead ด้านล่าง
const COLUMN_COUNT = 13;

export default function SchemaSyncAdminPage() {
  const { user: _user } = useAuth();
  const [moduleKey, setModuleKey] = useState("parent-skus-v2");
  const [data,      setData]      = useState<SchemaSyncResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [savingId,  setSavingId]  = useState<string | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  // Sprint 11
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkSaving,  setBulkSaving]  = useState(false);
  const [reordering,  setReordering]  = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/schema-sync?module=${moduleKey}`);
      const json: SchemaSyncResponse = await res.json();
      setData(json);
      setSelected(new Set());  // เคลียร์ selection เมื่อเปลี่ยน module
    } finally { setLoading(false); }
  }, [moduleKey]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch(`/api/admin/schema-sync?module=${moduleKey}`, { method: "POST" });
      const json = await res.json();
      if (json.error) flash("❌ " + json.error);
      else {
        const r = json.data;
        flash(`✓ Sync เสร็จ — ใหม่ ${r.inserted} fields | DB ${r.db_column_count} | Registry ${r.registry_count}`);
        await load();
      }
    } finally { setSyncing(false); }
  };

  const updateField = async (id: string, patch: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const res = await apiFetch(`/api/admin/field-registry-v2/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.error) {
        flash("❌ " + json.error);
        return;
      }
      setData((prev) => prev ? {
        ...prev,
        registry: prev.registry.map((f) => f.id === id ? { ...f, ...patch } : f),
      } : prev);
    } finally { setSavingId(null); }
  };

  // ========== Sprint 11: Bulk update ==========
  const bulkUpdate = async (patch: Record<string, unknown>) => {
    if (selected.size === 0) return;
    setBulkSaving(true);
    try {
      const ids = [...selected];
      const res = await apiFetch("/api/admin/field-registry-v2/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      const json = await res.json();
      if (json.error) flash("❌ " + json.error);
      else {
        flash(`✓ อัปเดต ${json.success} field (${Object.keys(patch).join(", ")})`);
        // optimistic update local
        setData((prev) => prev ? {
          ...prev,
          registry: prev.registry.map((f) => selected.has(f.id) ? { ...f, ...patch } : f),
        } : prev);
        setSelected(new Set());
      }
    } finally { setBulkSaving(false); }
  };

  // ========== Sprint 11: Drag-drop reorder ==========
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;

    const oldIdx = data.registry.findIndex((f) => f.id === active.id);
    const newIdx = data.registry.findIndex((f) => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(data.registry, oldIdx, newIdx);
    // คำนวณ display_order ใหม่ — รักษา gap step 10 เพื่อแทรกง่าย
    const updates = reordered.map((f, i) => ({ id: f.id, display_order: (i + 1) * 10 }));

    // optimistic update
    setData((prev) => prev ? {
      ...prev,
      registry: reordered.map((f, i) => ({ ...f, display_order: (i + 1) * 10 })),
    } : prev);

    setReordering(true);
    try {
      const res = await apiFetch("/api/admin/field-registry-v2/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: updates }),
      });
      const json = await res.json();
      if (json.error) flash("❌ reorder failed: " + json.error);
      else flash(`✓ เรียงลำดับใหม่ ${json.success} field`);
    } finally { setReordering(false); }
  };

  // filter rows
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.registry.filter((f) => {
      if (groupFilter && f.group_key !== groupFilter) return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        f.field_label.toLowerCase().includes(q) ||
        (f.column_name ?? "").toLowerCase().includes(q) ||
        f.field_key.toLowerCase().includes(q)
      );
    });
  }, [data, filter, groupFilter]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, visible: 0, filterable: 0, sortable: 0, searchable: 0, sensitive: 0, newDB: 0 };
    return {
      total: data.registry.length,
      visible: data.registry.filter((f) => f.is_visible).length,
      filterable: data.registry.filter((f) => f.is_filterable).length,
      sortable: data.registry.filter((f) => f.is_sortable).length,
      searchable: data.registry.filter((f) => f.is_searchable).length,
      sensitive: data.registry.filter((f) => f.is_sensitive).length,
      newDB: data.diff.new_in_db.length,
    };
  }, [data]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.id));
  const someSelected = filtered.some((f) => selected.has(f.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((f) => next.delete(f.id));
      } else {
        filtered.forEach((f) => next.add(f.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <PlaygroundShell>
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-[1600px] mx-auto px-6 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  🗂️ Schema Sync + Field Registry
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  อ่าน fields จริงจาก Supabase + admin tick visible/filterable/sortable/required • ✋ลากเรียงลำดับ • ☑ เลือกหลายเพื่อแก้พร้อมกัน
                </p>
              </div>
              <button
                onClick={sync}
                disabled={syncing}
                className="h-10 px-5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 shadow-sm"
              >
                {syncing ? "กำลัง sync..." : "🔄 Sync from Supabase"}
              </button>
            </div>

            {/* controls */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">Module:</label>
              <select
                value={moduleKey}
                onChange={(e) => setModuleKey(e.target.value)}
                className="h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {MODULES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>

              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="ค้นหา field..."
                className="h-9 px-3 text-sm border border-slate-300 rounded-md w-48"
              />

              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="h-9 px-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">ทุก group</option>
                {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>

            {/* stats */}
            {data && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md">
                  ทั้งหมด <strong>{stats.total}</strong>
                </span>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md">
                  Visible: {stats.visible}
                </span>
                <span className="px-2.5 py-1 bg-violet-50 text-violet-700 rounded-md">
                  Filterable: {stats.filterable}
                </span>
                <span className="px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-md">
                  Sortable: {stats.sortable}
                </span>
                <span className="px-2.5 py-1 bg-pink-50 text-pink-700 rounded-md">
                  Searchable: {stats.searchable}
                </span>
                {stats.sensitive > 0 && (
                  <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-md" title="ซ่อนจากคนไม่มี permission">
                    🔒 Sensitive: {stats.sensitive}
                  </span>
                )}
                {stats.newDB > 0 && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-semibold" title="DB columns ที่ยังไม่อยู่ใน registry — กด Sync เพื่อเพิ่ม">
                    ✨ มี {stats.newDB} field ใหม่ใน DB — กด Sync
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sprint 11: Bulk action bar */}
          {selected.size > 0 && (
            <div className="border-t border-orange-200 bg-orange-50">
              <div className="max-w-[1600px] mx-auto px-6 py-2.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-orange-900">
                  ☑ เลือก {selected.size} field
                </span>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={() => bulkUpdate({ is_visible: true })}  disabled={bulkSaving} variant="success">👁 แสดง</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_visible: false })} disabled={bulkSaving} variant="muted">👁 ซ่อน</BulkBtn>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={() => bulkUpdate({ is_filterable: true })}  disabled={bulkSaving}>🔍 เปิด filter</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_filterable: false })} disabled={bulkSaving} variant="muted">🔍 ปิด filter</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_sortable: true })}    disabled={bulkSaving}>↕ เปิด sort</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_sortable: false })}   disabled={bulkSaving} variant="muted">↕ ปิด sort</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_searchable: true })}  disabled={bulkSaving}>🔎 เปิด search</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_searchable: false })} disabled={bulkSaving} variant="muted">🔎 ปิด search</BulkBtn>
                <div className="h-5 w-px bg-orange-300 mx-1" />
                <BulkBtn onClick={() => bulkUpdate({ is_inline_editable: true })}  disabled={bulkSaving}>✎ เปิด inline edit</BulkBtn>
                <BulkBtn onClick={() => bulkUpdate({ is_inline_editable: false })} disabled={bulkSaving} variant="muted">✎ ปิด inline edit</BulkBtn>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-orange-700 hover:text-orange-900 underline"
                  >ล้างการเลือก</button>
                </div>
              </div>
            </div>
          )}

          {reordering && (
            <div className="border-t border-blue-200 bg-blue-50 text-center text-xs text-blue-700 py-1">
              ⏳ กำลังบันทึกลำดับใหม่...
            </div>
          )}
        </header>

        <main className="max-w-[1600px] mx-auto px-6 py-6">
          {loading ? (
            <div className="py-20 text-center text-slate-400">กำลังโหลด...</div>
          ) : !data?.module ? (
            <div className="py-20 text-center text-red-500">{data?.error ?? "ไม่พบ module"}</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th className="w-8 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allFilteredSelected; }}
                          onChange={toggleAll}
                          className="rounded"
                          title="เลือกทั้งหมด"
                        />
                      </th>
                      <th className="w-6 px-1 py-2" title="ลากเรียง">✋</th>
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Column</th>
                      <th className="px-3 py-2 text-left font-medium">Label</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Group</th>
                      <th className="px-3 py-2 text-center font-medium" title="แสดงในตาราง">👁 Vis</th>
                      <th className="px-3 py-2 text-center font-medium" title="กรองได้">🔍 Filt</th>
                      <th className="px-3 py-2 text-center font-medium" title="ค้นหาเจอ (รวมในช่อง search)">🔎 Search</th>
                      <th className="px-3 py-2 text-center font-medium" title="เรียงได้">↕ Sort</th>
                      <th className="px-3 py-2 text-center font-medium" title="บังคับกรอก">⚠ Req</th>
                      <th className="px-3 py-2 text-center font-medium" title="ซ่อนจากคนไม่มี permission">🔒 Sensitive</th>
                      <th className="px-3 py-2 text-center font-medium" title="ดับเบิ้ลคลิก cell แก้ในตาราง">✎ Inline</th>
                      <th className="px-3 py-2 text-left font-medium" title="Default ตอน Create — รองรับ now() today() current_user() uuid()">Default</th>
                      <th className="px-3 py-2 text-center font-medium">Width</th>
                    </tr>
                  </thead>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={filtered.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((f) => (
                          <SortableFieldRow
                            key={f.id}
                            field={f}
                            saving={savingId === f.id}
                            selected={selected.has(f.id)}
                            onToggle={() => toggleOne(f.id)}
                            onUpdate={(patch) => updateField(f.id, patch)}
                          />
                        ))}
                      </tbody>
                    </SortableContext>
                  </DndContext>
                </table>
              </div>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">ไม่พบ field</div>
              )}
            </div>
          )}
        </main>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 bg-slate-900 text-white rounded-lg shadow-lg text-sm max-w-md z-50">
            {toast}
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}

// ============================================================
// SortableFieldRow — แถวที่ลากเรียงได้
// ============================================================

function SortableFieldRow({
  field, saving, selected, onToggle, onUpdate,
}: {
  field:    RegistryField;
  saving:   boolean;
  selected: boolean;
  onToggle: () => void;
  onUpdate: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.5 : 1,
    background: isDragging ? "#fef3c7" : undefined,
  };

  const [label, setLabel] = useState(field.field_label);
  const [width, setWidth] = useState(field.width);

  useEffect(() => { setLabel(field.field_label); }, [field.field_label]);
  useEffect(() => { setWidth(field.width); }, [field.width]);

  const onBlurLabel = () => { if (label !== field.field_label) onUpdate({ field_label: label }); };
  const onBlurWidth = () => { if (width !== field.width)       onUpdate({ width });            };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-slate-50 ${saving ? "opacity-60" : ""} ${selected ? "bg-orange-50" : ""}`}
    >
      <td className="w-8 px-2 py-1.5 text-center">
        <input type="checkbox" checked={selected} onChange={onToggle} className="rounded" />
      </td>
      <td
        className="w-6 px-1 py-1.5 text-center text-slate-400 cursor-grab active:cursor-grabbing select-none"
        {...attributes}
        {...listeners}
        title="ลากเพื่อเรียงลำดับ"
      >⋮⋮</td>
      <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums">{field.display_order}</td>
      <td className="px-3 py-1.5">
        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{field.column_name ?? field.field_key}</code>
      </td>
      <td className="px-3 py-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={onBlurLabel}
          className="w-full px-2 py-1 text-sm border border-transparent hover:border-slate-200 focus:border-orange-400 rounded outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          value={field.ui_field_type}
          onChange={(e) => onUpdate({ ui_field_type: e.target.value })}
          className="text-xs px-1.5 py-1 border border-slate-200 rounded bg-white"
        >
          {UI_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <select
          value={field.group_key}
          onChange={(e) => onUpdate({ group_key: e.target.value })}
          className="text-xs px-1.5 py-1 border border-slate-200 rounded bg-white"
        >
          {GROUP_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_visible}    onChange={(e) => onUpdate({ is_visible:    e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_filterable} onChange={(e) => onUpdate({ is_filterable: e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_searchable} onChange={(e) => onUpdate({ is_searchable: e.target.checked })} className="rounded accent-pink-500" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_sortable}   onChange={(e) => onUpdate({ is_sortable:   e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_required}   onChange={(e) => onUpdate({ is_required:   e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <input
            type="checkbox"
            checked={field.is_sensitive}
            onChange={(e) => onUpdate({
              is_sensitive: e.target.checked,
              sensitive_permission: e.target.checked ? (field.sensitive_permission ?? "products.cost.view") : null,
            })}
            className="rounded accent-red-500"
            title="ซ่อน field จากคนที่ไม่มี permission"
          />
          {field.is_sensitive && (
            <input
              type="text"
              value={field.sensitive_permission ?? ""}
              onChange={(e) => onUpdate({ sensitive_permission: e.target.value })}
              placeholder="products.cost.view"
              className="w-32 text-[10px] px-1.5 py-0.5 border border-slate-200 rounded"
              title="permission key"
            />
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={field.is_inline_editable}
          onChange={(e) => onUpdate({ is_inline_editable: e.target.checked })}
          className="rounded accent-amber-500"
          title="ดับเบิ้ลคลิก cell ในตารางเพื่อแก้"
        />
      </td>
      <td className="px-3 py-1.5">
        <DefaultValueCell field={field} onUpdate={onUpdate} />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="number"
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          onBlur={onBlurWidth}
          className="w-16 text-xs px-1.5 py-1 border border-slate-200 rounded text-right tabular-nums"
        />
      </td>
    </tr>
  );
}

// ============================================================
// DefaultValueCell — Sprint 12: textbox + expression dropdown
// ============================================================

const EXPRESSION_PRESETS = [
  { value: "",                label: "— static value —" },
  { value: "now()",           label: "🕓 now() — เวลาปัจจุบัน" },
  { value: "today()",         label: "📅 today() — วันที่วันนี้" },
  { value: "current_user()",  label: "👤 current_user() — email ผู้ใช้" },
  { value: "uuid()",          label: "🆔 uuid() — สุ่ม UUID" },
];

function DefaultValueCell({
  field, onUpdate,
}: {
  field:    RegistryField;
  onUpdate: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const [val, setVal] = useState(field.default_value ?? "");
  const [expr, setExpr] = useState(field.default_expression ?? "");

  useEffect(() => { setVal(field.default_value ?? ""); }, [field.default_value]);
  useEffect(() => { setExpr(field.default_expression ?? ""); }, [field.default_expression]);

  const onBlurVal = () => {
    if (val !== (field.default_value ?? "")) onUpdate({ default_value: val === "" ? null : val });
  };
  const onChangeExpr = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setExpr(next);
    onUpdate({ default_expression: next === "" ? null : next });
  };

  return (
    <div className="flex items-center gap-1 min-w-[200px]">
      <select
        value={expr}
        onChange={onChangeExpr}
        className="text-[10px] px-1 py-0.5 border border-slate-200 rounded bg-white w-[110px]"
        title="dynamic expression — ชนะ static value"
      >
        {EXPRESSION_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={onBlurVal}
        disabled={!!expr}
        placeholder={expr ? "expression ชนะ" : "—"}
        className="flex-1 text-xs px-1.5 py-1 border border-slate-200 rounded disabled:bg-slate-50 disabled:text-slate-400"
      />
    </div>
  );
}

// ============================================================
// BulkBtn — ปุ่มเล็กในแถบ bulk action
// ============================================================

function BulkBtn({
  children, onClick, disabled, variant = "default",
}: {
  children: React.ReactNode;
  onClick:  () => void;
  disabled?: boolean;
  variant?: "default" | "success" | "muted";
}) {
  const cls = variant === "success"
    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
    : variant === "muted"
    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
    : "bg-white text-orange-900 hover:bg-orange-100 border border-orange-200";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2.5 text-xs font-medium rounded-md disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

// silence unused — keep underscore-prefix for future use
void COLUMN_COUNT;
