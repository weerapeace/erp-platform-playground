"use client";

import React from "react";

// ---- Types ----

export type Role = "admin" | "manager" | "staff" | "viewer";

export type Permission =
  // Products
  | "products.view" | "products.create" | "products.edit" | "products.delete"
  | "products.export" | "products.import" | "products.cost.view" | "products.bulk_edit"
  // Purchase
  | "purchase.view" | "purchase.create" | "purchase.submit"
  | "purchase.approve" | "purchase.reject" | "purchase.cancel" | "purchase.export"
  // HR / Payroll (sensitive)
  | "hr.view" | "hr.create" | "hr.edit" | "hr.salary.view" | "hr.salary.edit"
  // Settings
  | "settings.view" | "settings.edit" | "settings.users.manage";

// ---- Role → Permission mapping ----

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "products.view", "products.create", "products.edit", "products.delete",
    "products.export", "products.import", "products.cost.view", "products.bulk_edit",
    "purchase.view", "purchase.create", "purchase.submit",
    "purchase.approve", "purchase.reject", "purchase.cancel", "purchase.export",
    "hr.view", "hr.create", "hr.edit", "hr.salary.view", "hr.salary.edit",
    "settings.view", "settings.edit", "settings.users.manage",
  ],
  manager: [
    "products.view", "products.create", "products.edit",
    "products.export", "products.cost.view", "products.bulk_edit",
    "purchase.view", "purchase.create", "purchase.submit",
    "purchase.approve", "purchase.reject", "purchase.cancel", "purchase.export",
    "hr.view",
    "settings.view",
  ],
  staff: [
    "products.view",
    "products.export",
    "purchase.view", "purchase.create", "purchase.submit", "purchase.cancel",
    "hr.view",
  ],
  viewer: [
    "products.view",
    "purchase.view",
    "hr.view",
  ],
};

// ---- Field-level permissions ----

export const FIELD_PERMISSIONS: Record<string, Permission> = {
  "products.cost_price": "products.cost.view",
  "products.margin":     "products.cost.view",
  "hr.salary":           "hr.salary.view",
  "hr.bank_account":     "hr.salary.view",
};

// ---- Utility functions ----

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canViewField(role: Role, fieldKey: string): boolean {
  const requiredPermission = FIELD_PERMISSIONS[fieldKey];
  if (!requiredPermission) return true; // no restriction
  return can(role, requiredPermission);
}

// ---- Role config ----

export const ROLE_CONFIG: Record<Role, { label: string; labelTH: string; color: string; bg: string; border: string; description: string }> = {
  admin: {
    label: "Admin", labelTH: "ผู้ดูแลระบบ",
    color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200",
    description: "เข้าถึงได้ทุกอย่าง รวมถึงข้อมูลต้นทุน เงินเดือน และการตั้งค่า",
  },
  manager: {
    label: "Manager", labelTH: "ผู้จัดการ",
    color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
    description: "อนุมัติได้ เห็นราคาต้นทุน แต่ไม่เห็นเงินเดือนพนักงาน",
  },
  staff: {
    label: "Staff", labelTH: "พนักงาน",
    color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200",
    description: "สร้างใบขอซื้อได้ แต่ไม่เห็นราคาต้นทุนและไม่อนุมัติได้",
  },
  viewer: {
    label: "Viewer", labelTH: "ผู้ดู",
    color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200",
    description: "ดูข้อมูลได้อย่างเดียว ไม่สามารถสร้างหรือแก้ไขได้",
  },
};

// ---- Components ----

export function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      {cfg.labelTH}
    </span>
  );
}

interface PermissionTagProps {
  allowed: boolean;
  label: string;
}

export function PermissionTag({ allowed, label }: PermissionTagProps) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
      allowed
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-red-50 text-red-500 border-red-200 line-through opacity-60"
    }`}>
      <span>{allowed ? "✅" : "🚫"}</span>
      {label}
    </div>
  );
}

interface PermissionGateProps {
  role: Role;
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ role, permission, children, fallback }: PermissionGateProps) {
  if (!can(role, permission)) {
    return fallback ? <>{fallback}</> : null;
  }
  return <>{children}</>;
}
