"use client";

/**
 * Admin Users — ใช้ DataTable กลาง (K2.1)
 *
 * ได้ใช้:
 *  - search (ชื่อ/อีเมล)
 *  - column manager + resize + reorder + pin
 *  - saved views (เช่น "เฉพาะ admin", "ยังไม่ยืนยันอีเมล")
 *  - export CSV/Excel (เคารพ permission field)
 *  - row action: เปิด/ปิดบัญชี + เปลี่ยน role (drawer)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied, roleLabel, roleColor } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import type { AdminUser, AdminUsersResponse } from "@/app/api/admin/users/route";

type Role = "admin" | "manager" | "staff" | "viewer";
const ROLES: { v: Role; label: string }[] = [
  { v: "admin",   label: "ผู้ดูแลระบบ" },
  { v: "manager", label: "ผู้จัดการ" },
  { v: "staff",   label: "พนักงาน" },
  { v: "viewer",  label: "ผู้ชม (ดูอย่างเดียว)" },
];

function relTime(iso: string | null) {
  if (!iso) return "ยังไม่เคยเข้าระบบ";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชม.ที่แล้ว`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day:"numeric", month:"short", year:"numeric" });
}

export default function AdminUsersPage() {
  const allowed = usePermission("admin.users");
  const { user: me, can } = useAuth();
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // invite modal
  const [inviteOpen,  setInviteOpen]  = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName,  setInviteName]  = useState("");
  const [inviteRole,  setInviteRole]  = useState<Role>("viewer");
  const [inviteBusy,  setInviteBusy]  = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // edit drawer (row click) — เปลี่ยน role / toggle active
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/users");
      const json: AdminUsersResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setUsers(json.data);
    } catch (err) { setError(err instanceof Error ? err.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const updateRole = async (u: AdminUser, role: Role) => {
    if (u.role === role) return;
    setEditBusy(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: u.id, role, actor: me?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
      setEditUser(prev => prev ? { ...prev, role } : null);
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setEditBusy(false); }
  };

  const toggleActive = async (u: AdminUser) => {
    const next = !u.active;
    if (!confirm(`${next ? "เปิดใช้งาน" : "ปิดบัญชี"} ${u.email}?`)) return;
    setEditBusy(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: u.id, active: next, actor: me?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
      setEditUser(prev => prev ? { ...prev, active: next } : null);
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setEditBusy(false); }
  };

  const submitInvite = async () => {
    if (!inviteEmail.trim()) { setInviteError("กรอกอีเมล"); return; }
    setInviteBusy(true); setInviteError(null);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(), display_name: inviteName.trim() || undefined,
          role: inviteRole, actor: me?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setInviteOpen(false);
      setInviteEmail(""); setInviteName(""); setInviteRole("viewer");
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
    } catch (err) { setInviteError(err instanceof Error ? err.message : "เชิญไม่สำเร็จ"); }
    finally { setInviteBusy(false); }
  };

  // ============================================================
  // Columns
  // ============================================================
  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(() => [
    {
      id: "display_name",
      accessorKey: "display_name",
      header: "ผู้ใช้",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ row }) => {
        const u = row.original;
        const isMe = u.id === me?.id;
        const display = u.display_name ?? u.email.split("@")[0];
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
              {display.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">
                {display}
                {isMe && <span className="ml-1.5 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">คุณ</span>}
              </div>
              <div className="text-xs text-slate-400 truncate">{u.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "email",
      accessorKey: "email",
      header: "อีเมล",
      meta: { group: "ข้อมูลหลัก" },
      cell: ({ getValue }) => <span className="text-sm text-slate-600">{String(getValue() ?? "")}</span>,
    },
    {
      id: "role",
      accessorKey: "role",
      header: "สิทธิ์",
      meta: { group: "สิทธิ์", filterType: "select" },
      cell: ({ row }) => {
        const u = row.original;
        return <span className={`text-xs px-2 py-0.5 rounded border ${roleColor(u.role)}`}>{roleLabel(u.role)}</span>;
      },
    },
    {
      id: "active",
      accessorKey: "active",
      header: "สถานะ",
      meta: { group: "สถานะ", filterType: "select" },
      cell: ({ row }) => {
        const u = row.original;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${u.active ? "bg-emerald-500" : "bg-slate-300"}`} />
            <span className={u.active ? "text-slate-700" : "text-slate-400"}>{u.active ? "เปิดอยู่" : "ปิดอยู่"}</span>
            {!u.email_confirmed_at && (
              <span className="ml-1 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">รอยืนยัน</span>
            )}
          </span>
        );
      },
    },
    {
      id: "last_sign_in_at",
      accessorKey: "last_sign_in_at",
      header: "เข้าระบบล่าสุด",
      meta: { group: "ระบบ", filterType: "text" },
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return <span className="text-xs text-slate-500" title={v ?? ""}>{relTime(v)}</span>;
      },
    },
  ], [me?.id]);

  // ============================================================
  // Saved views
  // ============================================================
  const views = useMemo(() => [
    { id: "all", label: "ทั้งหมด", predicate: () => true },
    { id: "active", label: "เปิดใช้งาน", predicate: (r: Record<string, unknown>) => (r as AdminUser).active === true },
    { id: "inactive", label: "ปิดบัญชี", predicate: (r: Record<string, unknown>) => (r as AdminUser).active === false },
    { id: "admin", label: "ผู้ดูแลระบบ", predicate: (r: Record<string, unknown>) => (r as AdminUser).role === "admin" },
    { id: "unconfirmed", label: "ยังไม่ยืนยันอีเมล",
      predicate: (r: Record<string, unknown>) => !(r as AdminUser).email_confirmed_at },
  ], []);

  if (!allowed) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">ผู้ใช้ระบบ</h1>
            <p className="text-sm text-slate-500 mt-0.5">เชิญสมาชิก, ปรับสิทธิ์, เปิด/ปิดบัญชี · คลิกแถวเพื่อแก้</p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-xs text-emerald-600">✓ บันทึกแล้วเมื่อ {savedAt}</span>}
            <button onClick={() => setInviteOpen(true)}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ เชิญผู้ใช้
            </button>
          </div>
        </div>

        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        <DataTable<AdminUser>
          tableId="admin-users"
          data={users}
          columns={columns}
          loading={loading}
          searchPlaceholder="ค้นหาชื่อหรืออีเมล..."
          searchableKeys={["display_name", "email"]}
          views={views}
          onRowClick={(u) => setEditUser(u)}
          rowActions={[
            { label: "แก้สิทธิ์", icon: "🔑", onClick: (u) => setEditUser(u) },
            { label: "เปิด/ปิดบัญชี", icon: "⏻", onClick: (u) => toggleActive(u) },
          ]}
          exportFilename="users"
          exportEntityType="users"
          canCheck={(p) => can(p as Parameters<typeof can>[0])}
        />

        <p className="mt-3 text-xs text-slate-400">
          🔢 ผู้ใช้ทั้งหมด: {users.length} ·
          🟢 ใช้งานอยู่: {users.filter(u => u.active).length} ·
          🔑 admin: {users.filter(u => u.active && u.role === "admin").length}
        </p>
      </div>

      {/* Invite Modal */}
      <ERPModal open={inviteOpen} onClose={() => !inviteBusy && setInviteOpen(false)} title="เชิญผู้ใช้ใหม่" size="md"
        footer={
          <>
            <button onClick={() => setInviteOpen(false)} disabled={inviteBusy}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={submitInvite} disabled={inviteBusy}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {inviteBusy ? "กำลังเชิญ..." : "ส่งคำเชิญ"}
            </button>
          </>
        }>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            ระบบจะส่งอีเมลคำเชิญให้ผู้ใช้ตั้งรหัสผ่านเอง — เราไม่เก็บรหัสผ่าน
          </p>
          {inviteError && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {inviteError}</div>}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">อีเมล *</span>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder="user@example.com" autoFocus
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
            <input value={inviteName} onChange={e => setInviteName(e.target.value)}
              placeholder="(ไม่บังคับ)"
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">สิทธิ์เริ่มต้น</span>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-md bg-white">
              {ROLES.map(r => <option key={r.v} value={r.v}>{roleLabel(r.v)} — {r.label}</option>)}
            </select>
            <span className="text-[10px] text-slate-400 mt-1 block">ปรับใหม่ได้ภายหลัง</span>
          </label>
        </div>
      </ERPModal>

      {/* Edit drawer (row click) */}
      <ERPModal open={!!editUser} onClose={() => !editBusy && setEditUser(null)}
        title={editUser ? `แก้ไข: ${editUser.display_name ?? editUser.email}` : ""} size="md">
        {editUser && (
          <div className="space-y-4">
            <div className="text-xs text-slate-500">
              <div>อีเมล: <span className="text-slate-700">{editUser.email}</span></div>
              <div>เข้าระบบล่าสุด: <span className="text-slate-700">{relTime(editUser.last_sign_in_at)}</span></div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">สิทธิ์</span>
              <select value={editUser.role} disabled={editBusy || !editUser.active}
                onChange={(e) => updateRole(editUser, e.target.value as Role)}
                className={`w-full h-9 mt-0.5 px-2 text-sm rounded border ${roleColor(editUser.role)} disabled:opacity-60`}>
                {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </label>
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => toggleActive(editUser)} disabled={editBusy}
                className={`flex-1 h-9 text-sm font-medium rounded border disabled:opacity-50 ${
                  editUser.active
                    ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                }`}>
                {editUser.active ? "ปิดบัญชี" : "เปิดบัญชี"}
              </button>
              <button onClick={() => setEditUser(null)} disabled={editBusy}
                className="flex-1 h-9 text-sm font-medium border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                ปิด
              </button>
            </div>
          </div>
        )}
      </ERPModal>
    </PlaygroundShell>
  );
}
