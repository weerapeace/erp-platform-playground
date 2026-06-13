"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { RolesPermissionsResponse, RoleDef } from "@/app/api/admin/roles/route";

// ---- Color map ----
const ROLE_COLOR: Record<string, string> = {
  purple:  "bg-purple-100 text-purple-700 border-purple-300",
  blue:    "bg-blue-100 text-blue-700 border-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-300",
  slate:   "bg-slate-100 text-slate-700 border-slate-300",
  amber:   "bg-amber-100 text-amber-700 border-amber-300",
  red:     "bg-red-100 text-red-700 border-red-300",
};

const CATEGORY_LABEL: Record<string, string> = {
  products:    "📦 Products",
  pr:          "🛒 PR",
  suppliers:   "🏢 Suppliers",
  customers:   "🧑‍💼 Customers",
  employees:   "👥 Employees",
  master:      "🗃 Master Data",
  production:  "🏭 การผลิต",
  attachments: "🖼 Attachments",
  core:        "⚙ Core",
  admin:       "🔐 Admin",
};

export default function AdminRolesPermissionsPage() {
  const canView = usePermission("roles.view");
  const canEdit = usePermission("admin.roles");
  const { user } = useAuth();

  const [data, setData] = useState<RolesPermissionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);   // "role:perm"
  const [toast, setToast] = useState<string | null>(null);

  // edit role modal
  const [roleModal, setRoleModal] = useState<RoleDef | "new" | null>(null);
  const [roleDraft, setRoleDraft] = useState<Partial<RoleDef>>({});
  const [deleteTarget, setDeleteTarget] = useState<RoleDef | null>(null);

  // collapse category
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/roles");
      const json: RolesPermissionsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  // Map: roleKey → Set(permKeys)
  const grantedMap = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    data?.matrix.forEach(({ role_key, permission_key }) => {
      (m[role_key] ??= new Set()).add(permission_key);
    });
    return m;
  }, [data]);

  // Group permissions by category
  const grouped = useMemo(() => {
    const g: Record<string, RolesPermissionsResponse["permissions"]> = {};
    data?.permissions.forEach(p => { (g[p.category] ??= []).push(p); });
    return g;
  }, [data]);

  const togglePerm = async (roleKey: string, permKey: string, currentlyGranted: boolean) => {
    if (!canEdit) return;
    const cellKey = `${roleKey}:${permKey}`;
    setBusyCell(cellKey);
    // optimistic update
    setData(d => {
      if (!d) return d;
      const newMatrix = currentlyGranted
        ? d.matrix.filter(m => !(m.role_key === roleKey && m.permission_key === permKey))
        : [...d.matrix, { role_key: roleKey, permission_key: permKey }];
      return { ...d, matrix: newMatrix };
    });
    try {
      const res = await apiFetch("/api/admin/roles", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "toggle", role_key: roleKey, permission_key: permKey,
          granted: !currentlyGranted, actor: user?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      await load(); // revert
    } finally { setBusyCell(null); }
  };

  const toggleCategory = (cat: string) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat); else n.add(cat);
      return n;
    });
  };

  const openCreateRole = () => {
    setRoleDraft({ key: "", label: "", description: "", color: "slate", active: true, sort_order: 100 });
    setRoleModal("new");
  };
  const openEditRole = (r: RoleDef) => {
    setRoleDraft({ ...r });
    setRoleModal(r);
  };

  const saveRole = async () => {
    if (!roleDraft.key || !roleDraft.label) { setError("key + label จำเป็น"); return; }
    try {
      const res = await apiFetch("/api/admin/roles", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "role", role: roleDraft, actor: user?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("บันทึกแล้ว");
      setRoleModal(null);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
  };

  const removeRole = async (r: RoleDef) => {
    try {
      const res = await apiFetch(`/api/admin/roles?role_key=${r.key}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      flash("ลบ role แล้ว");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ"); }
    finally { setDeleteTarget(null); }
  };

  return (
    <PlaygroundShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">🔐 Roles & Permissions</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              จัดการ role + สิทธิ์การใช้งานในตาราง — admin override อยู่เสมอ
            </p>
          </div>
          {canEdit && (
            <button onClick={openCreateRole}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              + Role ใหม่
            </button>
          )}
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading || !data ? (
          <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[280px] border-b border-r border-slate-200">
                      Permission
                    </th>
                    {data.roles.map(r => (
                      <th key={r.key} className="px-3 py-2 border-b border-slate-200 text-center min-w-[120px]">
                        <button onClick={() => canEdit && !r.is_builtin && openEditRole(r)}
                          className="group inline-flex flex-col items-center gap-1"
                          disabled={!canEdit || r.is_builtin}>
                          <span className={`text-xs px-2 py-0.5 rounded border ${ROLE_COLOR[r.color] ?? ROLE_COLOR.slate} ${canEdit && !r.is_builtin ? "group-hover:underline cursor-pointer" : ""}`}>
                            {r.label}
                          </span>
                          <code className="text-[9px] text-slate-400">{r.key}</code>
                          <span className="text-[9px] text-slate-400">{r.permission_count} perm · {r.user_count} user{r.user_count !== 1 ? "s" : ""}</span>
                          {r.is_builtin && <span className="text-[9px] text-blue-500">built-in</span>}
                          {!r.is_builtin && canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                              className="text-[9px] text-red-500 hover:underline">ลบ</button>
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(grouped).sort().map(cat => {
                    const isCollapsed = collapsed.has(cat);
                    const perms = grouped[cat];
                    return (
                      <>
                        <tr key={`cat-${cat}`} className="bg-slate-100 cursor-pointer hover:bg-slate-200" onClick={() => toggleCategory(cat)}>
                          <td colSpan={data.roles.length + 1} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border-b border-slate-200">
                            <span className="mr-2">{isCollapsed ? "▶" : "▼"}</span>
                            {CATEGORY_LABEL[cat] ?? cat}
                            <span className="ml-2 text-slate-400 font-normal">({perms.length})</span>
                          </td>
                        </tr>
                        {!isCollapsed && perms.map(p => (
                          <tr key={p.key} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 sticky left-0 bg-white hover:bg-slate-50 border-r border-slate-100">
                              <div className="flex items-center gap-2">
                                {p.is_dangerous && <span className="text-red-500 text-xs">⚠</span>}
                                <span className="text-sm text-slate-700">{p.label}</span>
                              </div>
                              <code className="text-[10px] text-slate-400">{p.key}</code>
                            </td>
                            {data.roles.map(r => {
                              const cellKey = `${r.key}:${p.key}`;
                              const granted = r.key === "admin" || grantedMap[r.key]?.has(p.key);
                              const adminOverride = r.key === "admin";
                              const busy = busyCell === cellKey;
                              return (
                                <td key={r.key} className="px-3 py-1.5 text-center">
                                  {adminOverride ? (
                                    <span className="text-emerald-500" title="admin override (ทุก permission)">✓</span>
                                  ) : (
                                    <button onClick={() => togglePerm(r.key, p.key, !!granted)}
                                      disabled={!canEdit || busy}
                                      className={`w-5 h-5 rounded transition-colors disabled:opacity-50 ${
                                        granted
                                          ? "bg-emerald-500 text-white"
                                          : "bg-slate-100 hover:bg-slate-200"
                                      } ${p.is_dangerous && granted ? "ring-2 ring-amber-300" : ""}`}>
                                      {granted ? "✓" : ""}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
              💡 ✓ = สิทธิ์เปิด · ⚠ = sensitive permission · admin = override ทุกอย่าง
            </div>
          </div>
        )}

        {toast && <div className="fixed bottom-6 right-6 px-4 py-3 bg-emerald-600 text-white rounded-lg shadow-lg text-sm">✓ {toast}</div>}
      </div>

      {/* Role edit modal */}
      {roleModal !== null && (
        <ERPModal open onClose={() => setRoleModal(null)} size="md"
          title={roleModal === "new" ? "Role ใหม่" : `แก้ role: ${(roleModal as RoleDef).label}`}
          footer={
            <>
              <button onClick={() => setRoleModal(null)}
                className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">ยกเลิก</button>
              <button onClick={saveRole}
                className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึก</button>
            </>
          }>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Key (อังกฤษ, ไม่มี space)</span>
              <input value={roleDraft.key ?? ""} onChange={e => setRoleDraft({ ...roleDraft, key: e.target.value })}
                disabled={roleModal !== "new"}
                placeholder="manager_finance"
                className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded disabled:bg-slate-50" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ป้ายชื่อ</span>
              <input value={roleDraft.label ?? ""} onChange={e => setRoleDraft({ ...roleDraft, label: e.target.value })}
                placeholder="ผู้จัดการฝ่ายบัญชี"
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">คำอธิบาย</span>
              <input value={roleDraft.description ?? ""} onChange={e => setRoleDraft({ ...roleDraft, description: e.target.value })}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">สี</span>
                <select value={roleDraft.color ?? "slate"} onChange={e => setRoleDraft({ ...roleDraft, color: e.target.value })}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
                  {Object.keys(ROLE_COLOR).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">ลำดับ</span>
                <input type="number" value={roleDraft.sort_order ?? 100} onChange={e => setRoleDraft({ ...roleDraft, sort_order: parseInt(e.target.value) || 100 })}
                  className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={roleDraft.active ?? true}
                onChange={e => setRoleDraft({ ...roleDraft, active: e.target.checked })}
                className="rounded border-slate-300" />
              <span>เปิดใช้งาน</span>
            </label>
          </div>
        </ERPModal>
      )}

      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}
        title="ลบ Role"
        message={`ลบ role "${deleteTarget?.label}" ใช่ไหม? — กัน rolepointer ของ user ที่ใช้อยู่ก่อน`}
        confirmText="ลบ" cancelText="ยกเลิก" variant="danger"
        onConfirm={() => { if (deleteTarget) removeRole(deleteTarget); }} />
    </PlaygroundShell>
  );
}
