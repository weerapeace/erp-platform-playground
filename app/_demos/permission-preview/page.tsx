"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  type Role, type Permission,
  ROLE_CONFIG, can, canViewField,
  RoleBadge, PermissionTag, PermissionGate,
} from "@/components/permission";

const MOCK_PRODUCTS = [
  { id: "1", sku: "SKU-001", name: "กระดาษ A4 80gsm",       category: "เครื่องเขียน", stock: 240, cost_price: 85,  selling_price: 120, status: "active" },
  { id: "2", sku: "SKU-005", name: "หมึกปริ้นเตอร์ HP 680", category: "ไอที",         stock: 8,   cost_price: 450, selling_price: 650, status: "low_stock" },
  { id: "3", sku: "SKU-009", name: "เมาส์ USB Optical",      category: "ไอที",         stock: 22,  cost_price: 120, selling_price: 199, status: "active" },
];

const PRODUCT_PERMS: { key: Permission; label: string }[] = [
  { key: "products.view",       label: "ดูสินค้า" },
  { key: "products.create",     label: "สร้างสินค้า" },
  { key: "products.edit",       label: "แก้ไขสินค้า" },
  { key: "products.delete",     label: "ลบสินค้า" },
  { key: "products.export",     label: "Export" },
  { key: "products.cost.view",  label: "ดูราคาต้นทุน" },
  { key: "products.bulk_edit",  label: "Bulk Edit" },
];

const PURCHASE_PERMS: { key: Permission; label: string }[] = [
  { key: "purchase.view",    label: "ดูใบขอซื้อ" },
  { key: "purchase.create",  label: "สร้างใบขอซื้อ" },
  { key: "purchase.submit",  label: "ส่งใบขอซื้อ" },
  { key: "purchase.approve", label: "อนุมัติ" },
  { key: "purchase.reject",  label: "ปฏิเสธ" },
  { key: "purchase.cancel",  label: "ยกเลิก" },
  { key: "purchase.export",  label: "Export" },
];

const ROLES: Role[] = ["admin", "manager", "staff", "viewer"];

export default function PermissionPreviewPage() {
  const [role, setRole] = useState<Role>("staff");

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 7 — Permission System
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🔒 Permission Preview</h1>
        <p className="text-slate-500 mt-1">เลือก Role แล้วดูว่าผู้ใช้คนนั้นเห็นและทำอะไรได้บ้าง</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Concept box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">💡 ระบบสิทธิ์คืออะไร?</h2>
          <p className="text-sm text-blue-700">
            ระบบสิทธิ์ควบคุมว่าใครทำอะไรได้บ้าง — ตั้งแต่ระดับ Module (ดูสินค้าได้ไหม)
            ไปจนถึงระดับ Field (เห็นราคาต้นทุนได้ไหม) ทุก Module ใช้ระบบกลางนี้ร่วมกัน
          </p>
        </div>

        {/* Role selector */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">เลือก Role เพื่อดูสิทธิ์</h2>
            <p className="text-xs text-slate-500 mt-0.5">ตาราง, ปุ่ม, และข้อมูลด้านล่างจะเปลี่ยนตาม Role ที่เลือก</p>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {ROLES.map((r) => {
              const cfg = ROLE_CONFIG[r];
              const isSelected = role === r;
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-2 ${cfg.color}`
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className={`text-sm font-bold ${isSelected ? cfg.color : "text-slate-700"}`}>
                    {cfg.labelTH}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 leading-relaxed">{cfg.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Permission matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <span>📦</span>
              <h3 className="font-semibold text-slate-800 text-sm">Module: สินค้า</h3>
            </div>
            <div className="p-5 flex flex-wrap gap-2">
              {PRODUCT_PERMS.map(({ key, label }) => (
                <PermissionTag key={key} allowed={can(role, key)} label={label} />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <span>📋</span>
              <h3 className="font-semibold text-slate-800 text-sm">Module: ใบขอซื้อ</h3>
            </div>
            <div className="p-5 flex flex-wrap gap-2">
              {PURCHASE_PERMS.map(({ key, label }) => (
                <PermissionTag key={key} allowed={can(role, key)} label={label} />
              ))}
            </div>
          </div>
        </div>

        {/* Live table demo */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">📊 ตัวอย่างตารางสินค้า — มองผ่านสายตาของ Role นี้</h2>
              <p className="text-xs text-slate-500 mt-0.5">Role ปัจจุบัน: <strong>{ROLE_CONFIG[role].labelTH}</strong></p>
            </div>
            <RoleBadge role={role} />
          </div>
          <div className="px-6 py-4">
            {/* Action bar */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <PermissionGate role={role} permission="products.create">
                <button className="h-8 px-3 text-xs font-medium text-white bg-blue-600 rounded-lg">+ สร้างสินค้า</button>
              </PermissionGate>
              <PermissionGate role={role} permission="products.export">
                <button className="h-8 px-3 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📥 Export</button>
              </PermissionGate>
              <PermissionGate role={role} permission="products.import">
                <button className="h-8 px-3 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📤 Import</button>
              </PermissionGate>
              {!can(role, "products.create") && !can(role, "products.export") && (
                <span className="text-xs text-slate-400 italic">
                  🔒 Role &ldquo;{ROLE_CONFIG[role].labelTH}&rdquo; ไม่มีสิทธิ์สร้าง / Export
                </span>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">SKU</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">ชื่อสินค้า</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">หมวดหมู่</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">Stock</th>
                    {canViewField(role, "products.cost_price") && (
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-purple-600">
                        ต้นทุน 🔒
                      </th>
                    )}
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">ราคาขาย</th>
                    {can(role, "products.edit") && (
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-16">จัดการ</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {MOCK_PRODUCTS.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{p.sku}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">{p.name}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{p.category}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-sm font-medium ${p.stock < 15 ? "text-amber-600" : "text-slate-700"}`}>{p.stock}</span>
                      </td>
                      {canViewField(role, "products.cost_price") && (
                        <td className="px-3 py-2.5 text-right text-sm text-purple-700 font-medium">
                          ฿{p.cost_price.toLocaleString("th-TH")}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right text-sm text-slate-700">
                        ฿{p.selling_price.toLocaleString("th-TH")}
                      </td>
                      {can(role, "products.edit") && (
                        <td className="px-3 py-2.5 text-center">
                          <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">แก้ไข</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!canViewField(role, "products.cost_price") && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                🔒 คอลัมน์ &ldquo;ต้นทุน&rdquo; ถูกซ่อน — Role &ldquo;{ROLE_CONFIG[role].labelTH}&rdquo; ต้องการสิทธิ์{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">products.cost.view</code>
              </div>
            )}
          </div>
        </div>

        {/* Live code results */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">🔧 ผลลัพธ์จาก Utility Functions</h2>
            <p className="text-xs text-slate-500 mt-0.5">ผลลัพธ์เปลี่ยนแบบ real-time ตาม Role ที่เลือก</p>
          </div>
          <div className="px-6 py-4 space-y-2">
            {[
              { fn: `can(role, "products.edit")`,                result: can(role, "products.edit"),                label: "แก้ไขสินค้าได้ไหม" },
              { fn: `can(role, "products.cost.view")`,           result: can(role, "products.cost.view"),           label: "เห็นราคาต้นทุนได้ไหม" },
              { fn: `can(role, "purchase.approve")`,             result: can(role, "purchase.approve"),             label: "อนุมัติใบขอซื้อได้ไหม" },
              { fn: `canViewField(role, "products.cost_price")`, result: canViewField(role, "products.cost_price"), label: "แสดง column ต้นทุนไหม" },
              { fn: `can(role, "settings.users.manage")`,        result: can(role, "settings.users.manage"),        label: "จัดการ User ในระบบได้ไหม" },
            ].map((ex) => (
              <div key={ex.fn} className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50 rounded-lg">
                <div>
                  <code className="text-xs font-mono text-slate-700">{ex.fn}</code>
                  <p className="text-xs text-slate-400 mt-0.5">{ex.label}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex-shrink-0 ${
                  ex.result ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"
                }`}>
                  {ex.result ? "✅ true" : "❌ false"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "Role-based permissions (4 roles)" },
              { done: true,  label: "Module-level permissions" },
              { done: true,  label: "Action-level permissions" },
              { done: true,  label: "Field-level permissions" },
              { done: true,  label: "PermissionGate component" },
              { done: true,  label: "Live table demo by role" },
              { done: true,  label: "Utility: can() + canViewField()" },
              { done: false, label: "ต่อ Supabase RLS" },
              { done: false, label: "Role management UI" },
              { done: false, label: "Custom role builder" },
              { done: false, label: "Record-level permissions" },
              { done: false, label: "Approval limit by amount" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

      </div>
    </PlaygroundShell>
  );
}
