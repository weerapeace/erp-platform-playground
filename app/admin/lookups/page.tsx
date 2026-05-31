"use client";

/**
 * Lookups Admin — F9
 *
 * URL: /admin/lookups
 *
 * - dropdown เลือก lookup_type (มาจาก erp_lookup_types)
 * - list values ของ type นั้น (name + code + sort_order + active)
 * - +/-/edit ค่า + ปุ่มสร้าง type ใหม่
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import type { LookupRow } from "@/app/api/lookups/route";
import type { LookupType } from "@/app/api/lookups/types/route";

export default function LookupsAdminPage() {
  const [types,    setTypes]    = useState<LookupType[]>([]);
  const [active,   setActive]   = useState<string>("");          // current lookup_type
  const [rows,     setRows]     = useState<LookupRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("");
  const [toast,    setToast]    = useState<string | null>(null);

  // create/edit form state
  const [editing, setEditing] = useState<LookupRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [newCode,  setNewCode]  = useState("");

  // new-type modal
  const [newTypeOpen, setNewTypeOpen] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // ---- Load types ----
  const loadTypes = useCallback(async () => {
    const res = await apiFetch("/api/lookups/types");
    const json = await res.json();
    const list = (json.data ?? []) as LookupType[];
    setTypes(list);
    // auto-select first ถ้ายังไม่มี
    if (!active && list.length > 0) setActive(list[0].lookup_type);
  }, [active]);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  // ---- Load values of active type ----
  const loadRows = useCallback(async () => {
    if (!active) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/lookups?type=${active}&include_inactive=true&limit=500`);
      const json = await res.json();
      setRows((json.data ?? []) as LookupRow[]);
    } finally { setLoading(false); }
  }, [active]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ---- Filter ----
  const filtered = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.code ?? "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  // ---- Actions ----
  const create = async () => {
    if (!newName.trim() || !active) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookup_type: active,
          name:        newName.trim(),
          code:        newCode.trim() || null,
          sort_order:  rows.length * 10 + 10,
        }),
      });
      const json = await res.json();
      if (json.error) { flash("❌ " + json.error); return; }
      setNewName(""); setNewCode("");
      flash("✓ สร้างสำเร็จ");
      await loadRows();
    } finally { setCreating(false); }
  };

  const update = async (id: string, patch: Partial<LookupRow>) => {
    const res = await apiFetch(`/api/lookups/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (json.error) { flash("❌ " + json.error); return; }
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } as LookupRow : r));
    flash("✓ บันทึก");
  };

  const remove = async (id: string) => {
    if (!confirm("ลบรายการนี้? (soft delete — กดสลับ active กลับมาได้)")) return;
    await apiFetch(`/api/lookups/${id}`, { method: "DELETE" });
    await loadRows();
    flash("✓ ลบแล้ว");
  };

  const activeType = types.find((t) => t.lookup_type === active);

  return (
    <PlaygroundShell>
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-[1400px] mx-auto px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">🗂️ Lookups Manager</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  จัดการค่าตัวเลือกของ relation field (หมวด/ขนาด/หน่วยนับ ฯลฯ) — เพิ่มได้ไม่ต้อง dev สร้าง table
                </p>
              </div>
              <button
                onClick={() => setNewTypeOpen(true)}
                className="h-9 px-4 text-sm text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50"
              >＋ สร้าง type ใหม่</button>
            </div>

            {/* Type tabs */}
            <div className="mt-4 flex flex-wrap gap-1">
              {types.map((t) => (
                <button
                  key={t.lookup_type}
                  onClick={() => setActive(t.lookup_type)}
                  className={`h-9 px-3 text-sm rounded-lg flex items-center gap-1.5 transition-colors ${
                    active === t.lookup_type
                      ? "bg-orange-500 text-white"
                      : "bg-white border border-slate-200 text-slate-700 hover:border-orange-300"
                  }`}
                >
                  <span>{t.icon ?? "📁"}</span>
                  <span className="font-medium">{t.label}</span>
                  <code className="text-[10px] opacity-60">{t.lookup_type}</code>
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="max-w-[1400px] mx-auto px-6 py-6">
          {!activeType ? (
            <div className="py-20 text-center text-slate-400">เลือก type จากด้านบน</div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeType.icon} {activeType.label}
                </h2>
                {activeType.description && (
                  <p className="text-xs text-slate-500">— {activeType.description}</p>
                )}
                <span className="text-xs text-slate-500">{rows.length} รายการ</span>
              </div>

              {/* Add row + filter */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_1fr] gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                  placeholder={`ชื่อ ${activeType.label} ใหม่...`}
                  className="h-9 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                  placeholder="รหัส (optional)"
                  className="h-9 px-3 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  onClick={create}
                  disabled={!newName.trim() || creating}
                  className="h-9 px-5 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
                >{creating ? "..." : "＋ เพิ่ม"}</button>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="ค้นหาในรายการ..."
                  className="h-9 px-3 text-sm border border-slate-300 rounded-md"
                />
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {loading ? (
                  <div className="py-12 text-center text-slate-400">กำลังโหลด...</div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">ยังไม่มีรายการ — เพิ่มด้านบน</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left w-24">รหัส</th>
                        <th className="px-3 py-2 text-left">ชื่อ</th>
                        <th className="px-3 py-2 text-center w-24">ลำดับ</th>
                        <th className="px-3 py-2 text-center w-24">เปิดใช้</th>
                        <th className="px-3 py-2 text-right w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((r) => (
                        <RowEditor key={r.id} row={r} onUpdate={update} onRemove={() => remove(r.id)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 px-4 py-3 bg-slate-900 text-white rounded-lg shadow-lg text-sm">
            {toast}
          </div>
        )}

        {/* New type modal */}
        {newTypeOpen && (
          <NewTypeModal
            onClose={() => setNewTypeOpen(false)}
            onCreated={async () => {
              setNewTypeOpen(false);
              await loadTypes();
              flash("✓ สร้าง type สำเร็จ");
            }}
          />
        )}

        {/* Hidden: ensure unused-var ไม่ warn */}
        {editing && null}
      </div>
    </PlaygroundShell>
  );
}

// ============================================================
// RowEditor
// ============================================================

function RowEditor({
  row, onUpdate, onRemove,
}: {
  row:      LookupRow;
  onUpdate: (id: string, patch: Partial<LookupRow>) => void | Promise<void>;
  onRemove: () => void;
}) {
  const [name,  setName]  = useState(row.name);
  const [code,  setCode]  = useState(row.code ?? "");
  const [order, setOrder] = useState(row.sort_order);
  useEffect(() => { setName(row.name); }, [row.name]);
  useEffect(() => { setCode(row.code ?? ""); }, [row.code]);
  useEffect(() => { setOrder(row.sort_order); }, [row.sort_order]);

  const flushName = () => { if (name !== row.name)  onUpdate(row.id, { name }); };
  const flushCode = () => { if (code !== (row.code ?? "")) onUpdate(row.id, { code: code || null } as Partial<LookupRow>); };
  const flushOrder = () => { if (order !== row.sort_order) onUpdate(row.id, { sort_order: order }); };

  return (
    <tr className={`hover:bg-slate-50 ${!row.is_active ? "opacity-50" : ""}`}>
      <td className="px-3 py-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={flushCode}
          placeholder="—"
          className="w-24 px-2 py-1 text-sm border border-transparent hover:border-slate-200 focus:border-orange-400 rounded outline-none"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={flushName}
          className="w-full px-2 py-1 text-sm border border-transparent hover:border-slate-200 focus:border-orange-400 rounded outline-none"
        />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          onBlur={flushOrder}
          className="w-16 text-xs px-1.5 py-1 border border-slate-200 rounded text-right tabular-nums"
        />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={row.is_active}
          onChange={(e) => onUpdate(row.id, { is_active: e.target.checked })}
          className="rounded"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          onClick={onRemove}
          className="text-xs text-slate-400 hover:text-red-600 px-2 py-1"
          title="ลบ (soft)"
        >🗑</button>
      </td>
    </tr>
  );
}

// ============================================================
// NewTypeModal
// ============================================================

function NewTypeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void | Promise<void> }) {
  const [key,  setKey]  = useState("");
  const [label, setLabel] = useState("");
  const [icon, setIcon]  = useState("📁");
  const [saving, setSaving] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/lookups/types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookup_type: key.toLowerCase().trim(), label: label.trim(), icon }),
      });
      const json = await res.json();
      if (json.error) { setErr(json.error); return; }
      await onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">＋ สร้าง Lookup Type ใหม่</h3>
        <p className="text-xs text-slate-500 mb-4">
          เช่น <code>color</code> / <code>warehouse_zone</code> — ใช้กับ relation field ใน Field Registry
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-600 block mb-1">Lookup Key (a-z, _)</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              placeholder="warehouse_zone"
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Label (ภาษาไทย)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="โซนคลังสินค้า"
              className="w-full h-9 px-3 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 block mb-1">Icon (emoji 1 ตัว)</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              className="w-16 h-9 px-3 text-lg text-center border border-slate-300 rounded-md"
            />
          </div>
          {err && <div className="text-xs text-red-600">⚠ {err}</div>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
          >ยกเลิก</button>
          <button onClick={save} disabled={!key || !label || saving}
            className="h-9 px-4 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >{saving ? "กำลังบันทึก..." : "สร้าง"}</button>
        </div>
      </div>
    </div>
  );
}
