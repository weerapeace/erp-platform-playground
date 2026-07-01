"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ============================================================
// Auth — Supabase Auth จริง (email/password)
// role/permission อ่านจาก user_profiles
// ============================================================

export type Permission =
  | "products.view" | "products.create" | "products.edit" | "products.delete"
  | "products.cost.view"
  | "pr.view" | "pr.create" | "pr.edit" | "pr.submit" | "pr.approve" | "pr.reject" | "pr.cancel"
  | "suppliers.view" | "suppliers.create" | "suppliers.edit"
  | "fields.view" | "admin.field_registry.edit" | "admin.field_registry.bulk_edit"
  | "admin.schema.view" | "admin.schema.create_table" | "admin.schema.add_field" | "admin.schema.delete_field"
  | "admin.module_layout.edit"
  | "numbering.view" | "admin.numbering"
  | "approval.view" | "admin.approval_rules"
  | "notifications.view"
  | "goals.view" | "goals.edit"
  | "saved_views.share" | "admin.saved_views"
  | "workflow.view" | "admin.workflow"
  | "reports.view" | "admin.reports"
  | "plugins.view" | "admin.plugins"
  | "table_layouts.view" | "admin.table_layouts"
  | "customers.view" | "customers.create" | "customers.edit"
  | "employees.view" | "employees.create" | "employees.edit" | "payroll.calculate"
  | "warehouses.view" | "warehouses.create" | "warehouses.edit"
  | "departments.view" | "departments.create" | "departments.edit"
  | "units.view" | "units.create"
  | "taxes.view" | "taxes.create"
  | "validation.view" | "admin.validation"
  | "roles.view" | "admin.roles"
  | "comments.view" | "comments.create" | "comments.edit"
  | "notification_rules.view" | "admin.notification_rules"
  | "so.view" | "so.create" | "so.edit" | "so.confirm" | "so.ship" | "so.complete" | "so.cancel"
  | "qt.view" | "qt.create" | "qt.edit" | "qt.send" | "qt.accept" | "qt.reject" | "qt.cancel"
  | "stock.view" | "stock.create" | "stock.adjust"
  | "po.view" | "po.create" | "po.edit" | "po.confirm" | "po.receive" | "po.complete" | "po.cancel"
  | "attachments.view" | "attachments.upload" | "attachments.delete"
  | "files.upload" | "files.delete"
  | "accounting.view" | "accounting.manage" | "accounting.post"
  | "admin.users" | "admin.audit_log";

export type Role = "admin" | "manager" | "staff" | "viewer";

// role → permissions (ตรงกับ backend erp_can — แก้แล้วต้อง sync ทั้ง 2 ที่)
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "products.view", "products.create", "products.edit", "products.delete", "products.cost.view",
    "pr.view", "pr.create", "pr.edit", "pr.submit", "pr.approve", "pr.reject", "pr.cancel",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "fields.view", "admin.field_registry.edit", "admin.field_registry.bulk_edit",
    "admin.schema.view", "admin.schema.create_table", "admin.schema.add_field", "admin.schema.delete_field",
    "admin.module_layout.edit",
    "numbering.view", "admin.numbering",
    "approval.view", "admin.approval_rules",
    "notifications.view", "saved_views.share", "admin.saved_views",
    "goals.view", "goals.edit",
    "workflow.view", "admin.workflow",
    "reports.view", "admin.reports",
    "plugins.view", "admin.plugins",
    "table_layouts.view", "admin.table_layouts",
    "customers.view", "customers.create", "customers.edit",
    "employees.view", "employees.create", "employees.edit", "payroll.calculate",
    "warehouses.view", "warehouses.create", "warehouses.edit",
    "departments.view", "departments.create", "departments.edit",
    "units.view", "units.create",
    "taxes.view", "taxes.create",
    "validation.view", "admin.validation",
    "roles.view", "admin.roles",
    "comments.view", "comments.create", "comments.edit",
    "notification_rules.view", "admin.notification_rules",
    "so.view", "so.create", "so.edit", "so.confirm", "so.ship", "so.complete", "so.cancel",
    "qt.view", "qt.create", "qt.edit", "qt.send", "qt.accept", "qt.reject", "qt.cancel",
    "stock.view", "stock.create", "stock.adjust",
    "po.view", "po.create", "po.edit", "po.confirm", "po.receive", "po.complete", "po.cancel",
    "attachments.view", "attachments.upload", "attachments.delete",
    "files.upload", "files.delete",
    "accounting.view", "accounting.manage", "accounting.post",
    "admin.users", "admin.audit_log",
  ],
  manager: [
    "products.view", "products.create", "products.edit", "products.cost.view",
    "pr.view", "pr.create", "pr.edit", "pr.submit", "pr.approve", "pr.reject", "pr.cancel",
    "suppliers.view", "suppliers.create", "suppliers.edit",
    "fields.view", "numbering.view", "approval.view", "notifications.view", "saved_views.share",
    "goals.view", "goals.edit",
    "workflow.view", "reports.view", "plugins.view", "table_layouts.view",
    "customers.view", "customers.create", "customers.edit",
    "employees.view", "employees.create", "employees.edit",
    "warehouses.view", "warehouses.create", "warehouses.edit",
    "departments.view", "departments.create", "departments.edit",
    "units.view", "units.create", "taxes.view", "taxes.create",
    "attachments.view", "attachments.upload", "attachments.delete",
    "accounting.view", "accounting.manage", "accounting.post",
    "admin.audit_log",
  ],
  staff: [
    "products.view", "products.create", "products.edit",
    "pr.view", "pr.create", "pr.edit", "pr.submit", "pr.cancel",
    "suppliers.view", "suppliers.create",
    "fields.view", "numbering.view", "approval.view", "notifications.view", "workflow.view", "reports.view", "plugins.view", "table_layouts.view",
    "goals.view", "goals.edit",
    "customers.view", "customers.create", "employees.view", "employees.create",
    "warehouses.view", "departments.view", "units.view", "taxes.view", "validation.view", "roles.view",
    "comments.view", "comments.create", "comments.edit",
    "notification_rules.view",
    "so.view", "so.create", "so.edit", "so.confirm", "so.ship", "so.cancel",
    "qt.view", "qt.create", "qt.edit", "qt.send", "qt.accept", "qt.reject", "qt.cancel",
    "stock.view", "stock.create",
    "po.view", "po.create", "po.edit", "po.receive", "po.cancel",
    "attachments.view", "attachments.upload",
  ],
  viewer: ["goals.view", "products.view", "pr.view", "suppliers.view", "fields.view", "numbering.view", "approval.view", "notifications.view", "workflow.view", "reports.view", "plugins.view", "table_layouts.view",
    "customers.view", "employees.view", "warehouses.view", "departments.view", "units.view", "taxes.view", "validation.view", "roles.view",
    "comments.view", "notification_rules.view",
    "so.view", "qt.view", "stock.view", "po.view",
    "attachments.view"],
};

const ROLE_LABELS: Record<Role, string> = {
  admin: "ผู้ดูแลระบบ", manager: "ผู้จัดการ", staff: "พนักงาน", viewer: "ผู้ชม (ดูอย่างเดียว)",
};
const ROLE_COLORS: Record<Role, string> = {
  admin:   "bg-purple-100 text-purple-700 border-purple-200",
  manager: "bg-blue-100 text-blue-700 border-blue-200",
  staff:   "bg-emerald-100 text-emerald-700 border-emerald-200",
  viewer:  "bg-slate-100 text-slate-600 border-slate-200",
};
export function roleLabel(role: string) { return ROLE_LABELS[role as Role] ?? role; }
export function roleColor(role: string) { return ROLE_COLORS[role as Role] ?? ROLE_COLORS.viewer; }

// user ที่ login (name = display_name เพื่อ compat กับโค้ดเดิม)
export type AuthUser = {
  id:    string;
  email: string;
  name:  string;
  role:  Role;
  avatar: string | null;
};

type AuthState = {
  user: AuthUser | null;
  ready: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithMagicLink: (email: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  /** ส่งอีเมล "ลืมรหัสผ่าน" → ผู้ใช้คลิกแล้วไปหน้า /auth/set-password เพื่อตั้งรหัสใหม่ */
  resetPassword: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  can: (perm: Permission) => boolean;
  /** โหลดโปรไฟล์ใหม่ (หลังแก้ชื่อ/รูปของตัวเอง) */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // โหลด profile (role) ผ่าน erp_current_user() — SECURITY DEFINER เลี่ยง RLS
  const loadProfile = useCallback(async (fallbackEmail: string) => {
    const { data } = await supabaseBrowser.rpc("erp_current_user");
    const p = data as { id: string; email: string; display_name: string | null; role: string | null; active: boolean | null; avatar_url: string | null } | null;
    if (p && p.active !== false) {
      setUser({ id: p.id, email: p.email ?? fallbackEmail, name: p.display_name ?? p.email ?? fallbackEmail, role: (p.role ?? "viewer") as Role, avatar: p.avatar_url ?? null });
    } else {
      setUser(null);
    }
  }, []);

  // โหลดโปรไฟล์ตัวเองใหม่ (หลังแก้ชื่อ/รูป)
  const refreshProfile = useCallback(async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    const s = data.session;
    if (s?.user) await loadProfile(s.user.email ?? "");
  }, [loadProfile]);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (s?.user) loadProfile(s.user.email ?? "").finally(() => setReady(true));
      else setReady(true);
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, session) => {
      if (session?.user) loadProfile(session.user.email ?? "");
      else setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : error.message);
      return false;
    }
    return true;
  }, []);

  // Magic Link — ส่ง link เข้า email, user คลิก → login เสร็จ
  const loginWithMagicLink = useCallback(async (email: string) => {
    setLoginError(null);
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;
    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setLoginError(error.message);
      return false;
    }
    return true;
  }, []);

  // Google OAuth — redirect ไป Google login → กลับมาที่ /auth/callback
  const loginWithGoogle = useCallback(async () => {
    setLoginError(null);
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;
    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setLoginError(error.message);
      return false;
    }
    return true;
  }, []);

  // ลืมรหัสผ่าน — ส่งลิงก์ไปอีเมล, ปลายทาง = /auth/set-password (ตั้งรหัสใหม่)
  const resetPassword = useCallback(async (email: string) => {
    setLoginError(null);
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}/auth/set-password`
      : undefined;
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setLoginError(error.message);
      return false;
    }
    return true;
  }, []);

  const logout = useCallback(async () => {
    await supabaseBrowser.auth.signOut();
    setUser(null);
  }, []);

  const can = useCallback((perm: Permission) => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.includes(perm) ?? false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, ready, loginError, login, loginWithMagicLink, loginWithGoogle, resetPassword, logout, can, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function usePermission(perm: Permission): boolean {
  return useAuth().can(perm);
}

// ---- PermissionGate ----
export function PermissionGate({
  perm, children, fallback = null,
}: { perm: Permission; children: React.ReactNode; fallback?: React.ReactNode }) {
  return <>{usePermission(perm) ? children : fallback}</>;
}

// ---- AccessDenied ----
export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-400 mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-800">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
      <p className="text-sm text-slate-500 mt-1">{message ?? "กรุณาติดต่อผู้ดูแลระบบ"}</p>
    </div>
  );
}
