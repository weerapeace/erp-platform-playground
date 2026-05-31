"use client";

/**
 * Admin Field Registry — ใช้ DataTable กลาง (K2.5)
 *
 * เป็น "spreadsheet editor" — ทุก cell เป็น input ที่แก้ได้ + dirty tracking
 * แทน raw <table> เดิม เพื่อได้ search/filter/sort/column manager/saved views
 * เลือกกลุ่มเป็น "view" (built-in views) แทน group section header
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type { FieldRegistryEntry, FieldRegistryResponse } from "@/app/api/field-registry/product-skus/route";

const GROUP_CONFIG: Record<string, { label: string; color: string }> = {
  core:     { label: "ข้อมูลหลัก",  color: "bg-blue-50 text-blue-700 border-blue-200" },
  relation: { label: "ความสัมพันธ์", color: "bg-purple-50 text-purple-700 border-purple-200" },
  supplier: { label: "ผู้จำหน่าย",  color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  product:  { label: "คุณสมบัติ",   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pricing:  { label: "ราคา",        color: "bg-amber-50 text-amber-700 border-amber-200" },
  status:   { label: "สถานะ",       color: "bg-green-50 text-green-700 border-green-200" },
  system:   { label: "ระบบ",        color: "bg-slate-100 text-slate-600 border-slate-200" },
  content:  { label: "เนื้อหา",      color: "bg-rose-50 text-rose-700 border-rose-200" },
  other:    { label: "อื่นๆ",        color: "bg-slate-100 text-slate-500 border-slate-200" },
};
const GROUP_OPTIONS = Object.entries(GROUP_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }));

const UI_TYPE_LABELS: Record<string, string> = {
  text: "ข้อความ", currency: "เงิน", number: "ตัวเลข", boolean: "ใช่/ไม่", date: "วันที่",
};

type EditableField = {
  field_key:     string;
  field_label:   string;
  group_key:     string;
  ui_type:       string;
  is_visible:    boolean;
  is_filterable: boolean;
  is_sortable:   boolean;
  col_width:     number;
  is_sensitive:  boolean;
  /** เก็บสถานะ dirty ต่อแถว — Record<string, unknown> สำหรับให้ DataTable พิมพ์ได้ */
  __dirty?:      boolean;
};

function toEditable(e: FieldRegistryEntry): EditableField {
  return {
    field_key: e.field_key, field_label: e.field_label, group_key: e.group_key,
    ui_type: e.ui_type,
    is_visible: e.is_visible, is_filterable: e.is_filterable, is_sortable: e.is_sortable,
    col_width: e.col_width, is_sensitive: e.is_sensitive,
  };
}

function isEqualFields(a: EditableField, b: EditableField): boolean {
  return a.field_label === b.field_label && a.group_key === b.group_key &&
    a.is_visible === b.is_visible && a.is_filterable === b.is_filterable &&
    a.is_sortable === b.is_sortable && a.col_width === b.col_width;
}

export default function FieldRegistryAdminPage() {
  const allowed = usePermission("admin.field_registry");
  const [original, setOriginal] = useState<Record<string, EditableField>>({});
  const [draft,    setDraft]    = useState<Record<string, EditableField>>({});
  const [order,    setOrder]    = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/field-registry/product-skus");
      const json: FieldRegistryResponse = await res.json();
      if (json.error) throw new Error(json.error);
      const orig: Record<string, EditableField> = {};
      const ord: string[] = [];
      json.data.forEach(e => {
        orig[e.field_key] = toEditable(e);
        ord.push(e.field_key);
      });
      setOriginal(orig);
      setDraft(structuredClone(orig));
      setOrder(ord);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const changedKeys = useMemo(
    () => order.filter(k => original[k] && draft[k] && !isEqualFields(original[k], draft[k])),
    [order, original, draft]
  );

  const updateField = (key: string, patch: Partial<EditableField>) => {
    setDraft(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const save = async () => {
    if (changedKeys.length === 0) return;
    setSaving(true); setError(null);
    try {
      for (const key of changedKeys) {
        const d = draft[key];
        const res = await apiFetch("/api/field-registry/product-skus", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field_key:     key,
            field_label:   d.field_label,
            group_key:     d.group_key,
            is_visible:    d.is_visible,
            is_filterable: d.is_filterable,
            is_sortable:   d.is_sortable,
            col_width:     d.col_width,
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(`${key}: ${json.error}`);
      }
      setOriginal(structuredClone(draft));
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setDraft(structuredClone(original)); setError(null); };

  // ============================================================
  // Data array (มาจาก draft + dirty flag)
  // ============================================================
  const tableData = useMemo<EditableField[]>(
    () => order.map(k => {
      const d = draft[k];
      if (!d) return null;
      const dirty = original[k] && !isEqualFields(original[k], d);
      return { ...d, __dirty: dirty };
    }).filter(Boolean) as EditableField[],
    [order, draft, original]
  );

  // ============================================================
  // Columns
  // ============================================================
  const columns = useMemo<ColumnDef<EditableField, unknown>[]>(() => [
    { id: "field_key", accessorKey: "field_key", header: "Field (DB)",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-slate-500">{row.original.field_key}</span>
          {row.original.is_sensitive && <span title="ข้อมูลละเอียดอ่อน — ล็อก">🔒</span>}
          {row.original.__dirty && <span className="w-1.5 h-1.5 inline-block rounded-full bg-amber-500" />}
        </div>
      ),
    },
    { id: "field_label", accessorKey: "field_label", header: "ชื่อที่แสดง",
      meta: { group: "การแสดงผล" },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <input type="text" value={d.field_label} disabled={d.is_sensitive}
            onChange={e => updateField(d.field_key, { field_label: e.target.value })}
            onClick={e => e.stopPropagation()}
            className="w-full h-7 px-2 text-sm border border-transparent hover:border-slate-200 focus:border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400" />
        );
      },
    },
    { id: "ui_type", accessorKey: "ui_type", header: "ประเภท",
      meta: { group: "การแสดงผล", filterType: "select" },
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return <span className="text-xs text-slate-500">{UI_TYPE_LABELS[v] ?? v}</span>;
      },
    },
    { id: "group_key", accessorKey: "group_key", header: "กลุ่ม",
      meta: { group: "การแสดงผล", filterType: "select" },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <select value={d.group_key} disabled={d.is_sensitive}
            onChange={e => updateField(d.field_key, { group_key: e.target.value })}
            onClick={e => e.stopPropagation()}
            className="h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400">
            {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      },
    },
    { id: "is_visible", accessorKey: "is_visible", header: "แสดง",
      meta: { group: "พฤติกรรม", filterType: "select" },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <input type="checkbox" checked={d.is_visible} disabled={d.is_sensitive}
            onChange={e => updateField(d.field_key, { is_visible: e.target.checked })}
            onClick={e => e.stopPropagation()}
            className="rounded border-slate-300 text-blue-600 disabled:opacity-30" />
        );
      },
    },
    { id: "is_filterable", accessorKey: "is_filterable", header: "กรอง",
      meta: { group: "พฤติกรรม", filterType: "select" },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <input type="checkbox" checked={d.is_filterable} disabled={d.is_sensitive}
            onChange={e => updateField(d.field_key, { is_filterable: e.target.checked })}
            onClick={e => e.stopPropagation()}
            className="rounded border-slate-300 text-blue-600 disabled:opacity-30" />
        );
      },
    },
    { id: "is_sortable", accessorKey: "is_sortable", header: "เรียง",
      meta: { group: "พฤติกรรม", filterType: "select" },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <input type="checkbox" checked={d.is_sortable} disabled={d.is_sensitive}
            onChange={e => updateField(d.field_key, { is_sortable: e.target.checked })}
            onClick={e => e.stopPropagation()}
            className="rounded border-slate-300 text-blue-600 disabled:opacity-30" />
        );
      },
    },
    { id: "col_width", accessorKey: "col_width", header: "กว้าง (px)",
      meta: { group: "พฤติกรรม", filterType: "number" },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <input type="number" value={d.col_width} disabled={d.is_sensitive}
            onChange={e => updateField(d.field_key, { col_width: Number(e.target.value) })}
            onClick={e => e.stopPropagation()}
            className="w-20 h-7 px-1 text-xs text-center border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400" />
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [draft]);

  // ============================================================
  // Built-in views — filter ตามกลุ่ม
  // ============================================================
  const builtInViews = useMemo(() => [
    { id: "all", label: "ทุกกลุ่ม", predicate: () => true },
    { id: "changed", label: `🟡 ยังไม่บันทึก (${changedKeys.length})`,
      predicate: (r: Record<string, unknown>) => Boolean((r as EditableField).__dirty) },
    { id: "visible", label: "✓ ที่แสดงอยู่",
      predicate: (r: Record<string, unknown>) => (r as EditableField).is_visible === true },
    { id: "hidden", label: "✗ ซ่อนอยู่",
      predicate: (r: Record<string, unknown>) => (r as EditableField).is_visible === false },
    { id: "sensitive", label: "🔒 sensitive",
      predicate: (r: Record<string, unknown>) => (r as EditableField).is_sensitive === true },
    ...GROUP_OPTIONS.map(g => ({
      id: g.value, label: g.label,
      predicate: (r: Record<string, unknown>) => (r as EditableField).group_key === g.value,
    })),
  ], [changedKeys.length]);

  if (!allowed) {
    return <PlaygroundShell><AccessDenied message="หน้าจัดการทะเบียน Field ต้องเป็นผู้ดูแลระบบ (Admin) เท่านั้น" /></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          🗂️ Field Registry Admin
        </div>
        <h1 className="text-2xl font-bold text-slate-900">ทะเบียน Field กลาง — product_skus</h1>
        <p className="text-slate-500 mt-1">
          ตั้งค่าว่าแต่ละ field แสดงชื่ออะไร อยู่กลุ่มไหน โชว์/กรอง/เรียงได้ไหม — แก้ที่นี่ที่เดียว ทุกหน้าที่ใช้ตารางสินค้าจะเปลี่ยนตาม
        </p>
      </div>

      <div className="px-8 py-6 space-y-5">

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">💡</span>
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">นี่คือ &quot;สมองกลาง&quot; ของตารางสินค้า</p>
            <p className="text-blue-700 text-xs leading-relaxed">
              เปลี่ยนชื่อ field / ย้ายกลุ่ม / ติ๊กให้โชว์หรือซ่อน แล้วกด &quot;บันทึก&quot; →
              หน้า Products และทุกหน้าที่ใช้ตารางสินค้าจะอัปเดตทันที โดยไม่ต้องแก้โค้ด
              <br />
              <span className="text-blue-500">หมายเหตุ: field ที่เป็นข้อมูลละเอียดอ่อน (ราคาต้นทุน) จะล็อกไว้ แก้ไม่ได้จากที่นี่</span>
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="sticky top-0 z-10 bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{order.length} fields</span>
            {changedKeys.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                แก้ไข {changedKeys.length} รายการ (ยังไม่บันทึก)
              </span>
            )}
            {savedAt && changedKeys.length === 0 && (
              <span className="text-xs text-emerald-600">✓ บันทึกแล้ว {savedAt}</span>
            )}
          </div>
          <div className="flex-1" />
          {changedKeys.length > 0 && (
            <button onClick={reset} disabled={saving}
              className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50">
              ยกเลิก
            </button>
          )}
          <button onClick={save} disabled={changedKeys.length === 0 || saving}
            className="h-8 px-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
          </button>
          <button onClick={load} disabled={saving}
            className="h-8 px-3 text-sm text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50">
            🔄
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        <DataTable<EditableField>
          tableId="admin-field-registry"
          data={tableData}
          columns={columns}
          loading={loading}
          searchPlaceholder="ค้นหา field key, ชื่อ, หรือกลุ่ม..."
          searchableKeys={["field_key", "field_label", "group_key"]}
          views={builtInViews}
          pageSize={50}
          exportFilename="field-registry"
          exportEntityType="field_registry"
        />

        <p className="text-xs text-slate-400 text-center">
          แก้ไขผ่าน <code className="font-mono bg-slate-100 px-1 rounded">erp_playground_update_product_field()</code> —
          SECURITY DEFINER function ที่แก้ได้เฉพาะ metadata ไม่แตะข้อมูลสินค้าจริง
        </p>

      </div>
    </PlaygroundShell>
  );
}
