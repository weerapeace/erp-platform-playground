import type { MasterCRUDConfig } from "@/components/master-crud";

const EMPLOYEE_STATUS = ["active", "inactive", "resigned", "terminated"];
const EMPLOYEE_TITLES = ["นาย", "นาง", "นางสาว", "Mr.", "Ms.", "Mrs."];

const relationText = (labelKey: string) => (_value: unknown, row?: Record<string, unknown>) => {
  const label = row?.[labelKey];
  return label ? String(label) : "-";
};

export const ADMIN_EMPLOYEE_MASTER_CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/core/",
  apiPath: "employees",
  tableId: "admin-employees",
  moduleKey: "admin-employees",
  title: "พนักงาน",
  icon: "👥",
  description: "Employee master กลาง ใช้ร่วมกับ HR / PR / Approval / Payroll",
  uniqueKey: "employee_code",
  activeField: "active",
  exportEntityType: "employee",
  searchKeys: [
    "employee_code",
    "first_name",
    "last_name",
    "nickname",
    "full_name",
    "department_name",
    "position_name",
    "email",
    "phone",
  ],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  allowPermanentDelete: false,
  fields: [
    { key: "employee_code", label: "รหัสพนักงาน", type: "text", colSize: 120, required: true, placeholder: "ISG-001", groupKey: "core", order: 10 },
    { key: "title", label: "คำนำหน้า", type: "select", colSize: 90, options: EMPLOYEE_TITLES, bulkEditable: true, groupKey: "core", order: 20 },
    { key: "first_name", label: "ชื่อ", type: "text", colSize: 150, required: true, bulkEditable: true, groupKey: "core", order: 30 },
    { key: "last_name", label: "นามสกุล", type: "text", colSize: 150, bulkEditable: true, groupKey: "core", order: 40 },
    { key: "nickname", label: "ชื่อเล่น", type: "text", colSize: 110, bulkEditable: true, groupKey: "core", order: 50 },
    { key: "full_name", label: "ชื่อเต็ม", type: "text", colSize: 200, readonly: true, hideInForm: true, groupKey: "core", order: 60 },
    {
      key: "department_id",
      label: "แผนก",
      type: "relation",
      colSize: 160,
      bulkEditable: true,
      groupKey: "org",
      order: 70,
      cellRender: relationText("department_name"),
      relationConfig: {
        target_table: "departments",
        target_label_field: "name",
        target_search_fields: ["code", "name"],
        secondary_label_field: "code",
      },
    },
    {
      key: "position_id",
      label: "ตำแหน่ง",
      type: "relation",
      colSize: 160,
      bulkEditable: true,
      groupKey: "org",
      order: 80,
      cellRender: relationText("position_name"),
      relationConfig: {
        target_table: "positions",
        target_label_field: "name",
        target_search_fields: ["code", "name"],
        secondary_label_field: "code",
      },
    },
    { key: "employment_status", label: "สถานะงาน", type: "select", colSize: 120, options: EMPLOYEE_STATUS, filterable: true, bulkEditable: true, groupKey: "org", order: 90 },
    { key: "start_date", label: "เริ่มงาน", type: "date", colSize: 120, groupKey: "org", order: 100 },
    { key: "resign_date", label: "ออกงาน", type: "date", colSize: 120, groupKey: "org", order: 110 },
    { key: "phone", label: "เบอร์โทร", type: "text", colSize: 140, validations: ["phone_th"], bulkEditable: true, groupKey: "contact", order: 120 },
    { key: "email", label: "อีเมล", type: "text", colSize: 200, formSpan: 2, validations: ["email"], bulkEditable: true, groupKey: "contact", order: 130 },
    { key: "notes", label: "หมายเหตุ", type: "textarea", formSpan: 2, groupKey: "contact", order: 140 },
  ],
};
