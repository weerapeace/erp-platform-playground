"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  ProductPicker, SupplierPicker, EmployeePicker,
  CustomerPicker, WarehousePicker, DepartmentPicker, UnitPicker, TaxPicker,
  type ProductPickerValue, type SupplierPickerValue, type EmployeePickerValue,
  type CustomerPickerValue, type WarehousePickerValue,
  type DepartmentPickerValue, type UnitPickerValue, type TaxPickerValue,
} from "@/components/pickers";

export default function PickerPlaygroundPage() {
  // Individual picker states
  const [product, setProduct] = useState<ProductPickerValue | null>(null);
  const [supplier, setSupplier] = useState<SupplierPickerValue | null>(null);
  const [employee, setEmployee] = useState<EmployeePickerValue | null>(null);
  const [customer,   setCustomer]   = useState<CustomerPickerValue | null>(null);
  const [warehouse,  setWarehouse]  = useState<WarehousePickerValue | null>(null);
  const [department, setDepartment] = useState<DepartmentPickerValue | null>(null);
  const [unit,       setUnit]       = useState<UnitPickerValue | null>(null);
  const [tax,        setTax]        = useState<TaxPickerValue | null>(null);

  // Form simulation states
  const [formProduct, setFormProduct] = useState<ProductPickerValue | null>(null);
  const [formSupplier, setFormSupplier] = useState<SupplierPickerValue | null>(null);
  const [formEmployee, setFormEmployee] = useState<EmployeePickerValue | null>(null);
  const [formErrors, setFormErrors] = useState<{ product?: string; supplier?: string }>({});
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Demo flags
  const [disabledDemo, setDisabledDemo] = useState(false);

  const validateForm = () => {
    const errs: typeof formErrors = {};
    if (!formProduct) errs.product = "กรุณาเลือกสินค้า";
    if (!formSupplier) errs.supplier = "กรุณาเลือกผู้จำหน่าย";
    setFormErrors(errs);
    if (Object.keys(errs).length === 0) setFormSubmitted(true);
    return Object.keys(errs).length === 0;
  };

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 6 — Picker System
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🔍 Picker Playground</h1>
        <p className="text-slate-500 mt-1">ตัวเลือกข้อมูลกลาง — ค้นหาและเลือก Product, Supplier, Employee</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* What are pickers */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-2">💡 Picker คืออะไร?</h2>
          <p className="text-sm text-blue-700">
            แทนที่จะพิมพ์ชื่อหรือรหัสสินค้าเอง Picker ให้ผู้ใช้ค้นหาและเลือกข้อมูลจากระบบได้โดยตรง
            ทุกฟอร์มใน ERP ที่ต้องเลือก Product, Supplier, หรือ Employee จะใช้ Picker กลางนี้ร่วมกัน
          </p>
        </div>

        {/* Demo toggle */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setDisabledDemo(!disabledDemo)}
            className={`h-8 px-4 text-sm font-medium rounded-lg border transition-colors ${
              disabledDemo
                ? "bg-slate-600 text-white border-slate-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {disabledDemo ? "🔒 Disabled Mode" : "🔓 Active Mode"}
          </button>
        </div>

        {/* ===== 1. ProductPicker ===== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">📦 ProductPicker</h2>
            <p className="text-xs text-slate-500 mt-0.5">ค้นหาสินค้าด้วย SKU หรือชื่อ — แสดง Stock และ Status</p>
          </div>
          <div className="px-6 py-5">
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">เลือกสินค้า</label>
              <ProductPicker value={product} onChange={setProduct} disabled={disabledDemo} />
            </div>

            {product ? (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-semibold text-emerald-700 mb-2">✅ สินค้าที่เลือก</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><p className="text-xs text-slate-500">SKU</p><p className="text-sm font-mono font-semibold text-slate-800">{product.sku}</p></div>
                  <div><p className="text-xs text-slate-500">ชื่อสินค้า</p><p className="text-sm text-slate-800">{product.name}</p></div>
                  <div><p className="text-xs text-slate-500">หน่วย</p><p className="text-sm text-slate-800">{product.uom_name ?? "—"}</p></div>
                  <div><p className="text-xs text-slate-500">ราคาขาย</p><p className="text-sm text-slate-800">{product.list_price != null ? `฿${Number(product.list_price).toLocaleString("th-TH")}` : "—"}</p></div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">← กดที่ dropdown แล้วค้นหา เช่น &quot;SKU-001&quot; หรือ &quot;กระดาษ&quot;</p>
            )}
          </div>
        </div>

        {/* ===== 2. SupplierPicker ===== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">🏭 SupplierPicker</h2>
            <p className="text-xs text-slate-500 mt-0.5">ค้นหาผู้จำหน่ายด้วยรหัสหรือชื่อบริษัท</p>
          </div>
          <div className="px-6 py-5">
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">เลือกผู้จำหน่าย</label>
              <SupplierPicker value={supplier} onChange={setSupplier} disabled={disabledDemo} />
            </div>

            {supplier ? (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-semibold text-emerald-700 mb-2">✅ ผู้จำหน่ายที่เลือก</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><p className="text-xs text-slate-500">รหัส</p><p className="text-sm font-mono font-semibold text-slate-800">{supplier.code ?? "—"}</p></div>
                  <div><p className="text-xs text-slate-500">ชื่อบริษัท</p><p className="text-sm text-slate-800">{supplier.name}</p></div>
                  <div><p className="text-xs text-slate-500">เบอร์ติดต่อ</p><p className="text-sm text-slate-800">{supplier.contact_phone ?? "—"}</p></div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">← ลองค้นหา &quot;SUP-001&quot; หรือ &quot;ออฟฟิศ&quot;</p>
            )}
          </div>
        </div>

        {/* ===== 3. EmployeePicker ===== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">👤 EmployeePicker</h2>
            <p className="text-xs text-slate-500 mt-0.5">ค้นหาพนักงานด้วยชื่อ, รหัส หรือแผนก</p>
          </div>
          <div className="px-6 py-5">
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">เลือกพนักงาน</label>
              <EmployeePicker value={employee} onChange={setEmployee} disabled={disabledDemo} />
            </div>

            {employee ? (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-semibold text-emerald-700 mb-2">✅ พนักงานที่เลือก</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                    {employee.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{employee.name}</p>
                    <p className="text-sm text-slate-500">{employee.position ?? "—"}</p>
                    <p className="text-xs text-slate-400">{employee.department ?? "—"} · {employee.code ?? "—"}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">← ลองค้นหา &quot;สมชาย&quot; หรือ &quot;ไอที&quot;</p>
            )}
          </div>
        </div>

        {/* ===== Master Data Pickers (ใหม่) ===== */}
        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">🎯 Master Data Pickers</h2>
          <p className="text-xs text-slate-600">ครบ 6 ตัวจาก factory pattern — ค้นหา + recently used + สร้างใหม่ (ถ้ามี permission)</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CustomerPicker */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">🧑‍💼 CustomerPicker</h3>
            <CustomerPicker value={customer} onChange={setCustomer} disabled={disabledDemo} />
            {customer && (
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <code>{customer.code}</code> · {customer.name}
                {customer.payment_terms && <> · 💳 {customer.payment_terms}</>}
              </div>
            )}
          </div>

          {/* WarehousePicker */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">🏭 WarehousePicker</h3>
            <WarehousePicker value={warehouse} onChange={setWarehouse} disabled={disabledDemo} />
            {warehouse && (
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <code>{warehouse.code}</code> · {warehouse.name}
                {warehouse.branch && <> · 📍 {warehouse.branch}</>}
              </div>
            )}
          </div>

          {/* DepartmentPicker */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">🏢 DepartmentPicker</h3>
            <DepartmentPicker value={department} onChange={setDepartment} disabled={disabledDemo} />
            {department && (
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <code>{department.code}</code> · {department.name}
                {department.manager_name && <> · 👤 {department.manager_name}</>}
              </div>
            )}
          </div>

          {/* UnitPicker */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">📏 UnitPicker (UoM)</h3>
            <UnitPicker value={unit} onChange={setUnit} disabled={disabledDemo} />
            {unit && (
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <code>{unit.code}</code> · {unit.name} <span className="text-slate-400">({unit.symbol})</span>
              </div>
            )}
          </div>

          {/* TaxPicker */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 md:col-span-2">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">💰 TaxPicker</h3>
            <TaxPicker value={tax} onChange={setTax} disabled={disabledDemo} />
            {tax && (
              <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                <code>{tax.code}</code> · {tax.tax_type} {tax.name}
                {tax.rate != null && <> · อัตรา {Number(tax.rate)}%</>}
                {tax.included && <> · 🟢 รวมภาษี</>}
              </div>
            )}
          </div>
        </div>

        {/* ===== 4. Form Integration Demo ===== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">🔗 ตัวอย่าง Picker ใน Form</h2>
            <p className="text-xs text-slate-500 mt-0.5">แสดงการใช้งาน Picker ร่วมกับ Validation — กด &ldquo;ทดสอบ Validate&rdquo; โดยไม่เลือกข้อมูล</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  สินค้า <span className="text-red-500">*</span>
                </label>
                <ProductPicker
                  value={formProduct}
                  onChange={(v) => {
                    setFormProduct(v);
                    setFormSubmitted(false);
                    if (formErrors.product) setFormErrors((p) => ({ ...p, product: undefined }));
                  }}
                  error={!!formErrors.product}
                  disabled={disabledDemo}
                />
                {formErrors.product && (
                  <p className="text-xs text-red-600 mt-1">⚠ {formErrors.product}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ผู้จำหน่าย <span className="text-red-500">*</span>
                </label>
                <SupplierPicker
                  value={formSupplier}
                  onChange={(v) => {
                    setFormSupplier(v);
                    setFormSubmitted(false);
                    if (formErrors.supplier) setFormErrors((p) => ({ ...p, supplier: undefined }));
                  }}
                  error={!!formErrors.supplier}
                  disabled={disabledDemo}
                />
                {formErrors.supplier && (
                  <p className="text-xs text-red-600 mt-1">⚠ {formErrors.supplier}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ผู้รับผิดชอบ <span className="text-xs text-slate-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <EmployeePicker value={formEmployee} onChange={(v) => { setFormEmployee(v); setFormSubmitted(false); }} disabled={disabledDemo} />
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={validateForm}
                className="h-9 px-5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                ทดสอบ Validate
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormProduct(null); setFormSupplier(null); setFormEmployee(null);
                  setFormErrors({}); setFormSubmitted(false);
                }}
                className="h-9 px-5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                ล้างฟอร์ม
              </button>
            </div>

            {formSubmitted && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                ✅ ข้อมูลถูกต้องครบถ้วน — พร้อม Submit แล้ว
              </div>
            )}
          </div>
        </div>

        {/* Feature Checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "ProductPicker — ค้นหา + เลือก" },
              { done: true,  label: "SupplierPicker — ค้นหา + เลือก" },
              { done: true,  label: "EmployeePicker — ค้นหา + เลือก" },
              { done: true,  label: "Real-time search filter" },
              { done: true,  label: "Clear selection (กด X)" },
              { done: true,  label: "Close on outside click" },
              { done: true,  label: "Disabled state" },
              { done: true,  label: "Error state (validation)" },
              { done: true,  label: "Empty state (ไม่พบข้อมูล)" },
              { done: true,  label: "Form integration" },
              { done: true,  label: "Loading from Supabase (ProductPicker)" },
              { done: true,  label: "Recently used items" },
              { done: true,  label: "Create new (quick add)" },
              { done: false, label: "CustomerPicker (ยังไม่มีตารางลูกค้า)" },
              { done: false, label: "WarehousePicker (ยังไม่มีตารางคลัง)" },
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
