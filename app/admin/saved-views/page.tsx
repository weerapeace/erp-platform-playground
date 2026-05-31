"use client";

/**
 * Admin Saved Views — ใช้ DataTable กลาง (K2.3)
 *
 * รวมเป็นตารางเดียว มี column "Table" แทนการ group แยก section
 * ผู้ใช้กรอง table_id ด้วย column filter + saved views ของหน้า admin เอง
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type { AdminSavedView, AdminSavedViewsResponse } from "@/app/api/admin/saved-views/route";

type Visibility = "personal" | "team" | "system";

const VIS: Record<Visibility, { label: string; icon: string; color: string }> = {
  personal: { label: "ส่วนตัว",   icon: "👤", color: "bg-slate-100 text-slate-600 border-slate-200" },
  team:     { label: "ทีม",        icon: "👥", color: "bg-blue-50 text-blue-700 border-blue-200" },
  system:   { label: "System",     icon: "⭐", color: "bg-purple-50 text-purple-700 border-purple-200" },
};

const TABLE_LABEL: Record<string, string> = {
  products:           "📦 สินค้า",
  "admin-suppliers":  "🏢 ผู้จำหน่าย",
  "purchase-requests":"🛒 ใบขอซื้อ",
  "audit-logs":       "📜 ประวัติการใช้งาน",
};

function relTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "เมื่อสักครู่";
  if (diff < 3600)  return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชม.ที่แล้ว`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric" });
}

export default function AdminSavedViewsPage() {
  const allowed = usePermission("admin.saved_views");
  const { user, can } = useAuth();

  const [views,   setViews]   = useState<AdminSavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSavedView | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(`/api/admin/saved-views`);
      const json: AdminSavedViewsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setViews(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const setVisibility = async (v: AdminSavedView, visibility: Visibility) => {
    if (v.visibility === visibility) return;
    try {
      const res = await apiFetch("/api/admin/saved-views", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, visibility, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(`เปลี่ยนเป็น ${VIS[visibility].label}`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
  };

  const toggleDefault = async (v: AdminSavedView) => {
    try {
      const res = await apiFetch("/api/admin/saved-views", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, is_default: !v.is_default, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash(v.is_default ? "ยกเลิก default แล้ว" : "ตั้งเป็น default แล้ว");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
  };

  const remove = async (v: AdminSavedView) => {
    try {
      const res = await apiFetch(`/api/admin/saved-views?id=${v.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ view แล้ว");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  // ============================================================
  // Columns
  // ============================================================
  const columns = useMemo<ColumnDef<AdminSavedView, unknown>[]>(() => [
    { id: "label", accessorKey: "label", header: "ชื่อ View",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-slate-800">{row.original.label}</div>
          {row.original.description && <div className="text-xs text-slate-400 mt-0.5">{row.original.description}</div>}
        </div>
      ),
    },
    { id: "table_id", accessorKey: "table_id", header: "Table",
      meta: { group: "ข้อมูลหลัก", filterType: "select" },
      cell: ({ getValue }) => {
        const tid = String(getValue() ?? "");
        return <span className="text-xs text-slate-700">{TABLE_LABEL[tid] ?? tid}</span>;
      },
    },
    { id: "owner_name", accessorKey: "owner_name", header: "เจ้าของ",
      meta: { group: "ผู้ใช้" },
      cell: ({ row }) => (
        <div>
          <div className="text-sm text-slate-700">{row.original.owner_name ?? "—"}</div>
          <div className="text-xs text-slate-400 truncate max-w-[180px]">{row.original.owner_email}</div>
        </div>
      ),
    },
    { id: "visibility", accessorKey: "visibility", header: "การมองเห็น",
      meta: { group: "สิทธิ์", filterType: "select" },
      cell: ({ row }) => {
        const v = row.original;
        return (
          <select value={v.visibility}
            onChange={e => setVisibility(v, e.target.value as Visibility)}
            onClick={e => e.stopPropagation()}
            className={`h-7 px-2 text-xs font-medium rounded border ${VIS[v.visibility].color}`}>
            <option value="personal">{VIS.personal.icon} {VIS.personal.label}</option>
            <option value="team">{VIS.team.icon} {VIS.team.label}</option>
            <option value="system">{VIS.system.icon} {VIS.system.label}</option>
          </select>
        );
      },
    },
    { id: "is_default", accessorKey: "is_default", header: "Default",
      meta: { group: "การตั้งค่า", filterType: "select" },
      cell: ({ row }) => {
        const v = row.original;
        if (v.visibility === "personal") return <span className="text-xs text-slate-300">— ไม่ได้</span>;
        return (
          <button onClick={(e) => { e.stopPropagation(); toggleDefault(v); }}
            className={`h-7 px-2.5 text-xs font-medium rounded border ${
              v.is_default ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}>
            {v.is_default ? "★ Default" : "ตั้งเป็น default"}
          </button>
        );
      },
    },
    { id: "updated_at", accessorKey: "updated_at", header: "อัพเดต",
      meta: { group: "ระบบ", filterType: "text" },
      cell: ({ getValue }) => {
        const v = String(getValue() ?? "");
        return <span className="text-xs text-slate-500" title={v}>{relTime(v)}</span>;
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  // ============================================================
  // Built-in views
  // ============================================================
  const builtInViews = useMemo(() => [
    { id: "all", label: "ทั้งหมด", predicate: () => true },
    { id: "personal", label: "👤 ส่วนตัว",
      predicate: (r: Record<string, unknown>) => (r as AdminSavedView).visibility === "personal" },
    { id: "team", label: "👥 ทีม",
      predicate: (r: Record<string, unknown>) => (r as AdminSavedView).visibility === "team" },
    { id: "system", label: "⭐ System",
      predicate: (r: Record<string, unknown>) => (r as AdminSavedView).visibility === "system" },
    { id: "defaults", label: "★ Default ทั้งหมด",
      predicate: (r: Record<string, unknown>) => (r as AdminSavedView).is_default === true },
  ], []);

  if (!allowed) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">Saved Views</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            จัดการมุมมองที่ user สร้างไว้ — promote เป็น Team/System, ตั้ง default, ลบที่ stale
          </p>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable<AdminSavedView>
          tableId="admin-saved-views"
          data={views}
          columns={columns}
          loading={loading}
          searchPlaceholder="ค้นหาชื่อ view, เจ้าของ, table..."
          searchableKeys={["label", "description", "owner_name", "owner_email", "table_id"]}
          views={builtInViews}
          rowActions={[
            { label: "ลบ", icon: "🗑", onClick: (v) => setDeleteTarget(v), variant: "danger" },
          ]}
          exportFilename="saved-views"
          exportEntityType="saved_views"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
        />

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ View"
        message={`ลบ "${deleteTarget?.label}" ใช่ไหม? — user คนอื่นจะหยุดเห็น view นี้`}
        confirmText="ลบ" cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) remove(deleteTarget); }} variant="danger" />
    </PlaygroundShell>
  );
}
