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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied, roleLabel, roleColor } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { DataTable } from "@/components/data-table";
import { apiFetch } from "@/lib/api";
import { internalEmail, isValidUsername, isValidPin } from "@/lib/internal-users";
import { RealEmployeePicker, type EmployeePickerValue } from "@/components/real-employee-picker";
import type { AdminUser, AdminUsersResponse } from "@/app/api/admin/users/route";
import type { PermCatalogItem, UserOverride } from "@/app/api/admin/user-permissions/route";

type Role = "admin" | "manager" | "staff" | "viewer";
const ROLES: { v: Role; label: string }[] = [
  { v: "admin",   label: "ผู้ดูแลระบบ" },
  { v: "manager", label: "ผู้จัดการ" },
  { v: "staff",   label: "พนักงาน" },
  { v: "viewer",  label: "ผู้ชม (ดูอย่างเดียว)" },
];

// สร้าง URL รูปโปรไฟล์จากค่าที่เก็บ (r2_key → ผ่าน proxy กลาง / ถ้าเป็น http ใช้ตรง)
function avatarSrc(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.startsWith("http") ? v : `/api/r2-image?key=${encodeURIComponent(v)}`;
}

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

  // edit drawer (row click) — เปลี่ยน role / toggle active / ชื่อ / รูป
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  // เชื่อมพนักงาน + ตั้งรหัสผ่านใหม่ (ในแถบแก้ผู้ใช้)
  const [linkEmp, setLinkEmp] = useState<EmployeePickerValue | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [rpw, setRpw] = useState("");
  const [rpwBusy, setRpwBusy] = useState(false);
  const [rpwNote, setRpwNote] = useState<string | null>(null);

  // โหลด "พนักงานที่ผูกไว้" เมื่อเปิดแถบแก้ผู้ใช้
  useEffect(() => {
    setLinkEmp(null); setRpw(""); setRpwNote(null);
    if (!editUser) return;
    let alive = true;
    apiFetch(`/api/admin/users/link-employee?user_id=${editUser.id}`).then((r) => r.json()).then((j) => {
      if (alive && j.employee_id) setLinkEmp({ id: j.employee_id, name: j.employee_label ?? "", code: "" } as EmployeePickerValue);
    }).catch(() => {});
    return () => { alive = false; };
  }, [editUser]);

  const saveLink = async (emp: EmployeePickerValue | null) => {
    if (!editUser) return;
    setLinkEmp(emp); setLinkBusy(true);
    const j = await apiFetch("/api/admin/users/link-employee", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: editUser.id, employee_id: emp?.id ?? null }),
    }).then((r) => r.json());
    setLinkBusy(false);
    if (j.error) setRpwNote(`❌ เชื่อมพนักงานไม่สำเร็จ: ${j.error}`);
  };
  const resetPw = async () => {
    if (!editUser) return;
    const pw = rpw.trim();
    if (pw.length < 6) { setRpwNote("รหัสผ่าน/PIN อย่างน้อย 6 ตัว"); return; }
    setRpwBusy(true); setRpwNote(null);
    const j = await apiFetch("/api/admin/users/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: editUser.id, password: pw }),
    }).then((r) => r.json());
    setRpwBusy(false);
    if (j.error) setRpwNote(`❌ ${j.error}`); else { setRpwNote("✓ ตั้งรหัสผ่านใหม่ให้แล้ว"); setRpw(""); }
  };
  const [editName, setEditName]     = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const prevEditId = useRef<string | null>(null);

  // สิทธิ์เฉพาะคน (เฟส 3) — เปิด/ปิดสิทธิ์ทับตำแหน่งรายคน
  const [permUser, setPermUser] = useState<AdminUser | null>(null);
  const [permCatalog, setPermCatalog] = useState<PermCatalogItem[]>([]);
  const [permRolePerms, setPermRolePerms] = useState<Set<string>>(new Set());
  const [permOverrides, setPermOverrides] = useState<Map<string, "grant" | "revoke">>(new Map());
  const [permLoading, setPermLoading] = useState(false);

  const openPerms = useCallback(async (u: AdminUser) => {
    setPermUser(u); setPermLoading(true);
    setPermCatalog([]); setPermRolePerms(new Set()); setPermOverrides(new Map());
    try {
      const res = await apiFetch(`/api/admin/user-permissions?user_id=${u.id}`);
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setPermCatalog((j.permissions ?? []) as PermCatalogItem[]);
      setPermRolePerms(new Set((j.role_perms ?? []) as string[]));
      setPermOverrides(new Map(((j.overrides ?? []) as UserOverride[]).map((o) => [o.permission_key, o.mode])));
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดสิทธิ์ไม่สำเร็จ"); }
    finally { setPermLoading(false); }
  }, []);

  const setOverride = async (permKey: string, mode: "grant" | "revoke" | "default") => {
    if (!permUser) return;
    setPermOverrides((prev) => { const n = new Map(prev); if (mode === "default") n.delete(permKey); else n.set(permKey, mode); return n; });
    try {
      const res = await apiFetch("/api/admin/user-permissions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: permUser.id, permission_key: permKey, mode }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void openPerms(permUser); }
  };

  // จัดกลุ่ม catalog ตามหมวด (เรียงตามลำดับที่เจอครั้งแรก)
  const permGroups = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, PermCatalogItem[]>();
    for (const p of permCatalog) {
      const c = p.category || "อื่น ๆ";
      if (!by.has(c)) { by.set(c, []); order.push(c); }
      by.get(c)!.push(p);
    }
    return order.map((c) => ({ category: c, items: by.get(c)! }));
  }, [permCatalog]);
  const overrideCount = permOverrides.size;

  // เปิดผู้ใช้คนใหม่ → seed ชื่อ/รูป (ไม่ reset ตอน role/active เปลี่ยนของคนเดิม)
  useEffect(() => {
    if (editUser?.id !== prevEditId.current) {
      prevEditId.current = editUser?.id ?? null;
      setEditName(editUser?.display_name ?? "");
      setEditAvatar(editUser?.avatar_url ?? null);
    }
  }, [editUser]);

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("ไฟล์ต้องเป็นรูปภาพ"); return; }
    setUploadBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "avatars");
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setEditAvatar(json.r2_key);
    } catch (err) { setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ"); }
    finally { setUploadBusy(false); }
  };

  const saveProfile = async () => {
    if (!editUser) return;
    setEditBusy(true); setError(null);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editUser.id,
          display_name: editName.trim(),
          avatar_url: editAvatar ?? "",
          actor: me?.name,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
      setEditUser(prev => prev ? { ...prev, display_name: editName.trim() || null, avatar_url: editAvatar } : null);
    } catch (err) { setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"); }
    finally { setEditBusy(false); }
  };

  // สร้างผู้ใช้ภายใน (username + PIN)
  const [intOpen, setIntOpen] = useState(false);
  const [intUser, setIntUser] = useState("");
  const [intName, setIntName] = useState("");
  const [intPin,  setIntPin]  = useState("");
  const [intPin2, setIntPin2] = useState("");
  const [intRole, setIntRole] = useState<Role>("staff");
  const [intBusy, setIntBusy] = useState(false);
  const [intErr,  setIntErr]  = useState<string | null>(null);

  const submitInternal = async () => {
    const u = intUser.trim().toLowerCase();
    if (!isValidUsername(u)) { setIntErr("username: a-z, 0-9, _ ความยาว 3-32"); return; }
    if (!isValidPin(intPin)) { setIntErr("PIN ต้องเป็นตัวเลข 6 หลัก"); return; }
    if (intPin !== intPin2) { setIntErr("PIN สองช่องไม่ตรงกัน"); return; }
    setIntBusy(true); setIntErr(null);
    try {
      const res = await apiFetch("/api/admin/users/create-internal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, display_name: intName.trim() || undefined, pin: intPin, role: intRole, actor: me?.name }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setIntOpen(false);
      setIntUser(""); setIntName(""); setIntPin(""); setIntPin2(""); setIntRole("staff");
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
    } catch (err) { setIntErr(err instanceof Error ? err.message : "สร้างไม่สำเร็จ"); }
    finally { setIntBusy(false); }
  };

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
        const src = avatarSrc(u.avatar_url);
        return (
          <div className="flex items-center gap-3">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={display} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                {display.charAt(0).toUpperCase()}
              </div>
            )}
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
            <button onClick={() => setIntOpen(true)}
              className="h-9 px-4 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
              ＋ ผู้ใช้ภายใน (PIN)
            </button>
            <button onClick={() => setInviteOpen(true)}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              ＋ เชิญผู้ใช้ (อีเมล)
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

      {/* Internal user (username + PIN) Modal */}
      <ERPModal open={intOpen} onClose={() => !intBusy && setIntOpen(false)} title="สร้างผู้ใช้ภายใน (username + PIN)" size="md"
        footer={
          <>
            <button onClick={() => setIntOpen(false)} disabled={intBusy}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            <button onClick={submitInternal} disabled={intBusy}
              className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {intBusy ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
            </button>
          </>
        }>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            สำหรับพนักงานที่ไม่มีอีเมล — เข้าระบบด้วย <strong>username + PIN</strong> (เมนู &quot;เข้าด้วยรหัสพนักงาน&quot; ที่หน้า login)
          </p>
          {intErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {intErr}</div>}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ชื่อผู้ใช้ (username) *</span>
            <input value={intUser} onChange={e => setIntUser(e.target.value.toLowerCase())}
              placeholder="เช่น somchai" autoFocus autoCapitalize="none"
              className="w-full h-9 mt-0.5 px-3 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            {intUser && <span className="text-[10px] text-slate-400 mt-0.5 block">login id: {internalEmail(intUser)}</span>}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
            <input value={intName} onChange={e => setIntName(e.target.value)} placeholder="(ไม่บังคับ)"
              className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">PIN (6 หลัก) *</span>
              <input type="password" inputMode="numeric" maxLength={6} value={intPin}
                onChange={e => setIntPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••"
                className="w-full h-9 mt-0.5 px-3 text-sm text-center tracking-[0.3em] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ยืนยัน PIN *</span>
              <input type="password" inputMode="numeric" maxLength={6} value={intPin2}
                onChange={e => setIntPin2(e.target.value.replace(/\D/g, ""))} placeholder="••••••"
                className="w-full h-9 mt-0.5 px-3 text-sm text-center tracking-[0.3em] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">สิทธิ์</span>
            <select value={intRole} onChange={e => setIntRole(e.target.value as Role)}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-md bg-white">
              {ROLES.filter(r => r.v !== "admin").map(r => <option key={r.v} value={r.v}>{roleLabel(r.v)} — {r.label}</option>)}
            </select>
            <span className="text-[10px] text-amber-600 mt-1 block">ผู้ใช้ PIN กำหนดเป็น admin ไม่ได้ (ความปลอดภัย) · PIN รีเซ็ตได้โดยแอดมินเท่านั้น</span>
          </label>
        </div>
      </ERPModal>

      {/* Edit drawer (row click) */}
      <ERPModal open={!!editUser} onClose={() => !editBusy && setEditUser(null)}
        title={editUser ? `แก้ไข: ${editUser.display_name ?? editUser.email}` : ""} size="md">
        {editUser && (
          <div className="space-y-4">
            {/* รูปโปรไฟล์ + ชื่อ */}
            <div className="flex items-center gap-4 pb-1">
              <div className="relative shrink-0">
                {avatarSrc(editAvatar) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc(editAvatar)!} alt="" className="w-16 h-16 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-semibold">
                    {(editName || editUser.email).charAt(0).toUpperCase()}
                  </div>
                )}
                {uploadBusy && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center text-white text-[10px]">กำลังโหลด</div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadBusy || editBusy}
                  className="h-8 px-3 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {uploadBusy ? "กำลังอัปโหลด..." : avatarSrc(editAvatar) ? "เปลี่ยนรูป" : "＋ อัปโหลดรูป"}
                </button>
                {avatarSrc(editAvatar) && (
                  <button type="button" onClick={() => setEditAvatar(null)} disabled={uploadBusy || editBusy}
                    className="h-7 px-3 text-xs text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50">ลบรูป</button>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">ชื่อแสดงผล</span>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={editBusy}
                placeholder={editUser.email.split("@")[0]}
                className="w-full h-9 mt-0.5 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
            </label>

            <div className="text-xs text-slate-500">
              <div>อีเมล: <span className="text-slate-700">{editUser.email}</span></div>
              <div>เข้าระบบล่าสุด: <span className="text-slate-700">{relTime(editUser.last_sign_in_at)}</span></div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">ตำแหน่ง (สิทธิ์หลัก)</span>
              <select value={editUser.role} disabled={editBusy || !editUser.active}
                onChange={(e) => updateRole(editUser, e.target.value as Role)}
                className={`w-full h-9 mt-0.5 px-2 text-sm rounded border ${roleColor(editUser.role)} disabled:opacity-60`}>
                {ROLES.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </label>

            {/* สิทธิ์เฉพาะคน (เฟส 3) — เปิด/ปิดทับตำแหน่ง */}
            <button type="button" onClick={() => void openPerms(editUser)} disabled={editBusy}
              className="w-full h-9 text-sm font-medium border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-50 disabled:opacity-50">
              🔑 จัดการสิทธิ์เฉพาะคน (ยกเว้นจากตำแหน่ง)
            </button>

            {/* เชื่อมพนักงาน (HR) */}
            <label className="block">
              <span className="text-xs font-medium text-slate-600">🔗 เชื่อมพนักงาน</span>
              <div className="mt-0.5"><RealEmployeePicker value={linkEmp} onChange={(v) => void saveLink(v)} disabled={linkBusy} disableCreate placeholder="เลือกพนักงาน (เว้นว่าง = ไม่เชื่อม)" /></div>
            </label>

            {/* ตั้งรหัสผ่าน/PIN ใหม่ */}
            <div>
              <span className="text-xs font-medium text-slate-600">🔑 ตั้งรหัสผ่าน/PIN ใหม่ให้ผู้ใช้นี้</span>
              <div className="flex gap-2 mt-0.5">
                <input type="text" value={rpw} onChange={(e) => setRpw(e.target.value)} disabled={rpwBusy}
                  placeholder={editUser.email?.endsWith("@pin.local") ? "PIN ใหม่ (6 หลัก)" : "รหัสผ่านใหม่ (≥ 6 ตัว)"}
                  className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60" />
                <button type="button" onClick={() => void resetPw()} disabled={rpwBusy || !rpw.trim()}
                  className="h-9 px-3 text-sm font-medium bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">{rpwBusy ? "..." : "ตั้ง"}</button>
              </div>
              {rpwNote && <span className={`block text-[11px] mt-0.5 ${rpwNote.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{rpwNote}</span>}
            </div>

            {/* บันทึกชื่อ/รูป */}
            <button onClick={saveProfile} disabled={editBusy || uploadBusy}
              className="w-full h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {editBusy ? "กำลังบันทึก..." : "💾 บันทึกชื่อ/รูป"}
            </button>

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

      {/* สิทธิ์เฉพาะคน (เฟส 3) */}
      <ERPModal open={!!permUser} onClose={() => setPermUser(null)} size="lg"
        title={permUser ? `สิทธิ์เฉพาะคน: ${permUser.display_name ?? permUser.email}` : ""}>
        {permUser && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              ค่าเริ่มต้น = สิทธิ์ตาม <b>ตำแหน่ง ({roleLabel(permUser.role)})</b> · ตรงนี้ใช้ <b>เปิด/ปิดเฉพาะคนนี้</b> ทับตำแหน่ง
              {overrideCount > 0 && <> · มีรายการยกเว้น <b className="text-violet-700">{overrideCount}</b></>}
            </div>
            {permUser.role === "admin" && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ ผู้ดูแลระบบมีทุกสิทธิ์เสมอ (กันล็อกออก) — การตั้งค่าตรงนี้จะไม่มีผลกับ admin
              </div>
            )}
            {permLoading ? <div className="py-10 text-center text-slate-400">กำลังโหลด...</div> : (
              <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
                {permGroups.map((g) => (
                  <div key={g.category}>
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 sticky top-0 bg-white py-0.5">{g.category}</div>
                    <div className="space-y-1">
                      {g.items.map((p) => {
                        const roleHas = permRolePerms.has(p.key);
                        const ov = permOverrides.get(p.key);
                        const effective = ov ? ov === "grant" : roleHas;
                        const Btn = ({ m, label, cls }: { m: "default" | "grant" | "revoke"; label: string; cls: string }) => {
                          const active = m === "default" ? !ov : ov === m;
                          return (
                            <button type="button" onClick={() => void setOverride(p.key, m)}
                              className={`h-7 px-2 text-[11px] rounded border transition-colors ${active ? cls : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}>
                              {label}</button>
                          );
                        };
                        return (
                          <div key={p.key} className="flex items-center gap-2 py-0.5">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-700 truncate flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${effective ? "bg-emerald-500" : "bg-slate-300"}`} />
                                {p.label}{p.is_dangerous && <span className="text-rose-400" title="สิทธิ์อันตราย">⚠</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate pl-3">
                                <code>{p.key}</code> · ตำแหน่ง: {roleHas ? "มี" : "ไม่มี"}
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Btn m="default" label="ตามตำแหน่ง" cls="border-slate-300 bg-slate-100 text-slate-700" />
                              <Btn m="grant" label="เปิด" cls="border-emerald-300 bg-emerald-50 text-emerald-700" />
                              <Btn m="revoke" label="ปิด" cls="border-rose-300 bg-rose-50 text-rose-700" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">บันทึกอัตโนมัติ · ผู้ใช้ต้อง login ใหม่เพื่อเห็นผลเต็มที่</span>
              <button onClick={() => setPermUser(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ปิด</button>
            </div>
          </div>
        )}
      </ERPModal>
    </PlaygroundShell>
  );
}
