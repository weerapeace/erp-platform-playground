"use client";

/**
 * Admin Table Layouts — เก็บ raw <table> ไว้โดยตั้งใจ (K2.6 audit decision)
 *
 * เหตุผล:
 *  - หน้านี้เป็น Master-Detail Editor ไม่ใช่ list view
 *  - `<table>` ที่ใช้คือ "column ordering editor" — แก้ key/label/width/pinned/visible แบบ inline
 *    + ปุ่ม ↑↓ ย้ายลำดับ ที่ผูกกับ rendering order โดยตรง
 *  - ใช้ DataTable ที่นี่จะ:
 *    1. ขัดกับ logic ของ ↑↓ move (DataTable เรียงตาม sort state ไม่ใช่ array order)
 *    2. column manager ของ DataTable จะซ้อนกับการ "edit columns" ของ layout
 *    3. ไม่มี filter / search ที่มีประโยชน์ (layout มีไม่กี่ column)
 *
 * Sidebar (list ของ layouts ทางซ้าย) ก็เก็บไว้เป็น list navigation ไม่ต้องใช้ DataTable
 * เพราะปกติมี layout 3-10 อัน + ใช้เป็น master-detail picker
 *
 * 🟡 status: "เก็บไว้แต่มีเหตุผล" — review เฉพาะถ้า layout count > 30 หรือเริ่มมี filtering need
 */

import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { TableLayout, TableLayoutColumn } from "@/app/api/table-layouts/route";
import type { AdminTableLayoutsResponse } from "@/app/api/admin/table-layouts/route";

const TABLE_ICON: Record<string, string> = {
  products:           "📦",
  "admin-suppliers":  "🏢",
  "purchase-requests":"🛒",
  "audit-logs":       "📜",
};

// ============================================================
// Page
// ============================================================

export default function AdminTableLayoutsPage() {
  const canView = usePermission("table_layouts.view");
  const canEdit = usePermission("admin.table_layouts");
  const { user } = useAuth();

  const [layouts,  setLayouts]  = useState<TableLayout[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft,    setDraft]    = useState<TableLayout | null>(null);
  const [dirty,    setDirty]    = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TableLayout | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/table-layouts");
      const json: AdminTableLayoutsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setLayouts(json.data);
      if (!selected && json.data.length > 0) setSelected(json.data[0].table_id);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, [selected]);

  useEffect(() => { if (canView) load(); }, [canView, load]);
  useEffect(() => {
    const item = layouts.find(l => l.table_id === selected);
    setDraft(item ? { ...item, columns: [...item.columns] } : null);
    setDirty(false);
  }, [layouts, selected]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const update = (patch: Partial<TableLayout>) => {
    setDraft(d => d ? { ...d, ...patch } : d); setDirty(true);
  };
  const updateCol = (idx: number, patch: Partial<TableLayoutColumn>) => {
    setDraft(d => d ? { ...d, columns: d.columns.map((c, i) => i === idx ? { ...c, ...patch } : c) } : d);
    setDirty(true);
  };
  const moveCol = (idx: number, dir: -1 | 1) => {
    setDraft(d => {
      if (!d) return d;
      const newCols = [...d.columns];
      const target = idx + dir;
      if (target < 0 || target >= newCols.length) return d;
      [newCols[idx], newCols[target]] = [newCols[target], newCols[idx]];
      // re-number order
      newCols.forEach((c, i) => { c.order = (i + 1) * 10; });
      return { ...d, columns: newCols };
    });
    setDirty(true);
  };
  const removeCol = (idx: number) => {
    setDraft(d => d ? { ...d, columns: d.columns.filter((_, i) => i !== idx) } : d);
    setDirty(true);
  };
  const addCol = () => {
    setDraft(d => {
      if (!d) return d;
      const maxOrder = d.columns.reduce((m, c) => Math.max(m, c.order), 0);
      return { ...d, columns: [...d.columns, { key: "", label: "", visible: true, order: maxOrder + 10 }] };
    });
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/table-layouts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึก layout แล้ว");
      setDirty(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const remove = async (l: TableLayout) => {
    try {
      const res = await apiFetch(`/api/admin/table-layouts?table_id=${l.table_id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ layout แล้ว");
      if (selected === l.table_id) setSelected(layouts.find(x => x.table_id !== l.table_id)?.table_id ?? null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  const createNew = async () => {
    const tid = prompt("table_id ของ layout ใหม่ (เช่น admin-users):");
    if (!tid?.trim()) return;
    try {
      const res = await apiFetch("/api/admin/table-layouts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_id: tid.trim(), label: tid.trim(), columns: [],
          default_density: "normal", default_page_size: 20, default_view_mode: "table",
          actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("สร้าง layout ใหม่");
      await load();
      setSelected(tid.trim());
    } catch (err) { setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ"); }
  };

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Table Layouts</h1>
            <p className="text-sm text-slate-500 mt-0.5">ตั้ง default layout ของ DataTable แต่ละหน้า — user คนใหม่จะเห็นแบบนี้</p>
          </div>
          {canEdit && (
            <button onClick={createNew}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + Layout ใหม่
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <div className="grid grid-cols-12 gap-3">
          {/* Left list */}
          <aside className="col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">{[0,1,2].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
            ) : layouts.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">ยังไม่มี layout</div>
            ) : layouts.map(l => (
              <button key={l.table_id} onClick={() => {
                if (dirty && !confirm("มีข้อมูลยังไม่บันทึก ต้องการทิ้งหรือไม่?")) return;
                setSelected(l.table_id);
              }} className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                selected === l.table_id ? "bg-blue-50" : ""
              }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span>{TABLE_ICON[l.table_id] ?? "📋"}</span>
                  <span className="text-sm font-medium text-slate-800 flex-1 truncate">{l.label}</span>
                </div>
                <code className="text-[10px] text-slate-400">{l.table_id}</code>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {l.columns.length} cols · {l.columns.filter(c => c.visible).length} visible · {l.default_page_size}/หน้า
                </div>
              </button>
            ))}
          </aside>

          {/* Editor */}
          <section className="col-span-9 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {!draft ? (
              <div className="p-8 text-center text-sm text-slate-400">เลือก layout ทางซ้าย</div>
            ) : (
              <>
                {/* Header */}
                <div className="p-4 border-b border-slate-100 grid grid-cols-3 gap-2 items-end">
                  <label className="block col-span-2">
                    <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
                    <input value={draft.label} onChange={e => update({ label: e.target.value })} disabled={!canEdit}
                      className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded disabled:bg-slate-50" />
                  </label>
                  <code className="h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded font-mono flex items-center">{draft.table_id}</code>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Default Density</span>
                    <select value={draft.default_density} onChange={e => update({ default_density: e.target.value as TableLayout["default_density"] })} disabled={!canEdit}
                      className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                      <option value="normal">≣ ปกติ</option>
                      <option value="compact">≡ แน่น</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Page Size</span>
                    <select value={draft.default_page_size} onChange={e => update({ default_page_size: parseInt(e.target.value) })} disabled={!canEdit}
                      className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                      {[10,20,25,50,100,200].map(n => <option key={n} value={n}>{n}/หน้า</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">View Mode</span>
                    <select value={draft.default_view_mode} onChange={e => update({ default_view_mode: e.target.value as TableLayout["default_view_mode"] })} disabled={!canEdit}
                      className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                      <option value="table">📋 Table</option>
                      <option value="cards">🃏 Cards</option>
                    </select>
                  </label>

                  <label className="block col-span-3">
                    <span className="text-xs font-medium text-slate-600">หมายเหตุ</span>
                    <input value={draft.notes ?? ""} onChange={e => update({ notes: e.target.value })} disabled={!canEdit}
                      className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded disabled:bg-slate-50" />
                  </label>
                </div>

                {/* Columns table */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-700">คอลัมน์ ({draft.columns.length})</h3>
                    {canEdit && (
                      <button onClick={addCol}
                        className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 text-slate-700">
                        + เพิ่มคอลัมน์
                      </button>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-slate-500 bg-white border-b border-slate-100">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-10">#</th>
                          <th className="text-left px-3 py-2 font-medium">Key</th>
                          <th className="text-left px-3 py-2 font-medium">Label</th>
                          <th className="text-left px-3 py-2 font-medium w-20">Width</th>
                          <th className="text-left px-3 py-2 font-medium w-24">Pinned</th>
                          <th className="text-center px-3 py-2 font-medium w-20">แสดง</th>
                          <th className="text-right px-3 py-2 font-medium w-32">การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.columns.map((c, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0 bg-white">
                            <td className="px-3 py-1.5 font-mono text-xs text-slate-400">{c.order}</td>
                            <td className="px-3 py-1.5">
                              <input value={c.key} onChange={e => updateCol(i, { key: e.target.value })} disabled={!canEdit}
                                placeholder="field_key"
                                className="w-full h-7 px-2 text-xs font-mono border border-slate-200 rounded disabled:bg-slate-50" />
                            </td>
                            <td className="px-3 py-1.5">
                              <input value={c.label} onChange={e => updateCol(i, { label: e.target.value })} disabled={!canEdit}
                                placeholder="ชื่อแสดงผล"
                                className="w-full h-7 px-2 text-xs border border-slate-200 rounded disabled:bg-slate-50" />
                            </td>
                            <td className="px-3 py-1.5">
                              <input type="number" value={c.width ?? ""} onChange={e => updateCol(i, { width: e.target.value ? parseInt(e.target.value) : undefined })} disabled={!canEdit}
                                placeholder="auto"
                                className="w-full h-7 px-2 text-xs border border-slate-200 rounded disabled:bg-slate-50" />
                            </td>
                            <td className="px-3 py-1.5">
                              <select value={c.pinned ?? ""} onChange={e => updateCol(i, { pinned: (e.target.value || null) as TableLayoutColumn["pinned"] })} disabled={!canEdit}
                                className="w-full h-7 px-1 text-xs border border-slate-200 rounded bg-white">
                                <option value="">—</option>
                                <option value="left">📌 ซ้าย</option>
                                <option value="right">ขวา 📌</option>
                              </select>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="checkbox" checked={c.visible} onChange={e => updateCol(i, { visible: e.target.checked })} disabled={!canEdit}
                                className="rounded border-slate-300" />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {canEdit && (
                                <div className="flex justify-end gap-0.5">
                                  <button onClick={() => moveCol(i, -1)} disabled={i === 0}
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30">↑</button>
                                  <button onClick={() => moveCol(i, 1)} disabled={i === draft.columns.length - 1}
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30">↓</button>
                                  <button onClick={() => removeCol(i)}
                                    className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">×</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-100 flex items-center gap-2 bg-slate-50">
                  {canEdit && (
                    <button onClick={save} disabled={!dirty || saving}
                      className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "..." : dirty ? "บันทึก" : "บันทึกแล้ว ✓"}
                    </button>
                  )}
                  <div className="flex-1" />
                  {canEdit && (
                    <button onClick={() => setDeleteTarget(draft)}
                      className="h-9 px-3 text-xs text-red-600 hover:bg-red-50 rounded">ลบ layout นี้</button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ Layout"
        message={`ลบ layout "${deleteTarget?.label}" ใช่ไหม? — DataTable จะกลับไปใช้ค่าใน code`}
        confirmText="ลบ" cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget); }} variant="danger" />
    </PlaygroundShell>
  );
}
