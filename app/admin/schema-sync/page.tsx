"use client";

/**
 * Admin Schema Sync — Sprint 1
 *
 * URL: /admin/schema-sync
 *
 * - เลือก module
 * - ปุ่ม "Sync from Supabase" — ดึง column ใหม่จาก DB
 * - ตาราง field — แก้ visible/filterable/sortable/required/label/group/width
 * - Save inline (auto-flush เมื่อ blur)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import type { SchemaSyncResponse, RegistryField } from "@/app/api/admin/schema-sync/route";

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

export default function SchemaSyncAdminPage() {
  const { user } = useAuth();
  const [moduleKey, setModuleKey] = useState("parent-skus-v2");
  const [data,      setData]      = useState<SchemaSyncResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [savingId,  setSavingId]  = useState<string | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/schema-sync?module=${moduleKey}`);
      const json: SchemaSyncResponse = await res.json();
      setData(json);
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
      // optimistic update local state
      setData((prev) => prev ? {
        ...prev,
        registry: prev.registry.map((f) => f.id === id ? { ...f, ...patch } : f),
      } : prev);
    } finally { setSavingId(null); }
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
    if (!data) return { total: 0, visible: 0, filterable: 0, sortable: 0, newDB: 0 };
    return {
      total: data.registry.length,
      visible: data.registry.filter((f) => f.is_visible).length,
      filterable: data.registry.filter((f) => f.is_filterable).length,
      sortable: data.registry.filter((f) => f.is_sortable).length,
      newDB: data.diff.new_in_db.length,
    };
  }, [data]);

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
                  อ่าน fields จริงจาก Supabase + admin tick visible/filterable/sortable/required
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
                {stats.newDB > 0 && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-semibold" title="DB columns ที่ยังไม่อยู่ใน registry — กด Sync เพื่อเพิ่ม">
                    ✨ มี {stats.newDB} field ใหม่ใน DB — กด Sync
                  </span>
                )}
              </div>
            )}
          </div>
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
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Column</th>
                      <th className="px-3 py-2 text-left font-medium">Label</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Group</th>
                      <th className="px-3 py-2 text-center font-medium" title="แสดงในตาราง">👁 Vis</th>
                      <th className="px-3 py-2 text-center font-medium" title="กรองได้">🔍 Filt</th>
                      <th className="px-3 py-2 text-center font-medium" title="เรียงได้">↕ Sort</th>
                      <th className="px-3 py-2 text-center font-medium" title="บังคับกรอก">⚠ Req</th>
                      <th className="px-3 py-2 text-center font-medium">Width</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((f) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        saving={savingId === f.id}
                        onUpdate={(patch) => updateField(f.id, patch)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">ไม่พบ field</div>
              )}
            </div>
          )}
        </main>

        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 bg-slate-900 text-white rounded-lg shadow-lg text-sm max-w-md">
            {toast}
          </div>
        )}
      </div>
    </PlaygroundShell>
  );
}

// ============================================================
// FieldRow — บรรทัดเดียวของ table
// ============================================================

function FieldRow({
  field, saving, onUpdate,
}: {
  field: RegistryField;
  saving: boolean;
  onUpdate: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const [label, setLabel] = useState(field.field_label);
  const [width, setWidth] = useState(field.width);

  // sync local เมื่อ field เปลี่ยน (จาก parent update)
  useEffect(() => { setLabel(field.field_label); }, [field.field_label]);
  useEffect(() => { setWidth(field.width); }, [field.width]);

  const onBlurLabel = () => {
    if (label !== field.field_label) onUpdate({ field_label: label });
  };
  const onBlurWidth = () => {
    if (width !== field.width) onUpdate({ width });
  };

  return (
    <tr className={`hover:bg-slate-50 ${saving ? "opacity-60" : ""}`}>
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
        <input type="checkbox" checked={field.is_visible} onChange={(e) => onUpdate({ is_visible: e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_filterable} onChange={(e) => onUpdate({ is_filterable: e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_sortable} onChange={(e) => onUpdate({ is_sortable: e.target.checked })} className="rounded" />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={field.is_required} onChange={(e) => onUpdate({ is_required: e.target.checked })} className="rounded" />
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
