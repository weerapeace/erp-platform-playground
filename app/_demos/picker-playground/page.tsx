"use client";

// หน้าทดลองตัวเลือกข้อมูล (ไม่ได้ขึ้นเว็บจริง — โฟลเดอร์ _demos เป็น private)
// 2026-11-07 เขียนใหม่: เอาตัวเลือกเก่าที่อ่านตารางทดลองออก (ProductPicker · SupplierPicker ชุด pickers ·
// EmployeePicker · DepartmentPicker · UnitPicker · TaxPicker) เหลือเฉพาะตัวที่ใช้จริง — ดูทะเบียน /admin/plugins

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  SkuPicker, CustomerPicker, WarehousePicker, UserPicker,
  type SkuPickerValue, type CustomerPickerValue, type WarehousePickerValue, type UserPickerValue,
} from "@/components/pickers";
import { SupplierPicker, usePartnerSuppliers } from "@/components/supplier-picker";
import { UomPicker } from "@/components/uom-picker";

function Box({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">{note}</p>
      {children}
    </div>
  );
}

export default function PickerPlaygroundPage() {
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [suppliers] = usePartnerSuppliers();
  const [supplierId, setSupplierId] = useState("");
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [warehouse, setWarehouse] = useState<WarehousePickerValue | null>(null);
  const [user, setUser] = useState<UserPickerValue | null>(null);
  const [uom, setUom] = useState<string | null>(null);

  return (
    <PlaygroundShell>
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <h1 className="text-xl font-semibold text-slate-800">ตัวเลือกข้อมูลกลาง</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Box title="เลือกสินค้า (SkuPicker)" note="ค้นจาก SKU จริง (skus_v2)">
            <SkuPicker value={sku} onChange={setSku} />
          </Box>
          <Box title="เลือกร้าน (SupplierPicker)" note="ทะเบียนคู่ค้าจริง (partners_v2) + ปุ่มกรองร้านไทย/จีน">
            <SupplierPicker value={supplierId} suppliers={suppliers} onChange={(id) => setSupplierId(id)} />
          </Box>
          <Box title="เลือกลูกค้า (CustomerPicker)" note="ค้นหา + เคยใช้ล่าสุด">
            <CustomerPicker value={customer} onChange={setCustomer} />
          </Box>
          <Box title="เลือกคลัง (WarehousePicker)" note="ค้นหา + เคยใช้ล่าสุด">
            <WarehousePicker value={warehouse} onChange={setWarehouse} />
          </Box>
          <Box title="เลือกผู้ใช้ (UserPicker)" note="คนที่ล็อกอินได้ — เซลส์ คนรับงาน ผู้อนุมัติ">
            <UserPicker value={user} onChange={setUser} />
          </Box>
          <Box title="เลือกหน่วยนับ (UomPicker)" note="ทะเบียนหน่วยจริง (uoms) เก็บเป็นชื่อหน่วย">
            <UomPicker value={uom} onChange={setUom} />
          </Box>
        </div>
      </div>
    </PlaygroundShell>
  );
}
