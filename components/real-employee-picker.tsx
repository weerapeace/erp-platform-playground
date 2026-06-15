"use client";

/**
 * RealEmployeePicker — เลือก "พนักงานจริง" จากตาราง employees (HR/payroll)
 * ต่างจาก EmployeePicker (ของกลาง) ที่ดึง erp_playground_employees (ข้อมูลตัวอย่าง)
 * ใช้กับการเชื่อมบัญชี↔พนักงาน · ส่ง disableCreate (ห้ามสร้างใหม่จาก picker)
 */
import { createMasterPicker, type EmployeePickerValue } from "@/components/pickers/master";

export type { EmployeePickerValue };

export const RealEmployeePicker = createMasterPicker<EmployeePickerValue>({
  apiPath:      "employees",
  listEndpoint: "/api/pickers/real-employees",   // ← ตาราง employees จริง
  storageKey:   "erp-recent-real-employees",
  label:        "พนักงาน",
  emptyLabel:   "ไม่พบพนักงาน",
  searchPlaceholder: "ค้นหา รหัส / ชื่อ / อีเมล / แผนก...",
  createPermission: "employees.create",
  secondaryRender: (v) => (
    <>
      {v.position && <span>{v.position}</span>}
      {v.department && <span> · {v.department}</span>}
      {v.email && <span> · {v.email}</span>}
    </>
  ),
});
