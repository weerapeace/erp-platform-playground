import type { MasterCRUDConfig } from "@/components/master-crud";
import { DepartmentEmployeesPanel } from "@/components/payroll/department-employees-panel";

const STATUS = ["active", "inactive"];

export const ADMIN_DEPARTMENT_MASTER_CONFIG: MasterCRUDConfig = {
  apiBase: "/api/payroll/master/",
  apiPath: "departments",
  tableId: "departments",
  moduleKey: "payroll-departments",
  title: "แผนก",
  icon: "🏢",
  description: "Department master กลาง ใช้ในบอร์ดจ่ายงาน / Payroll / Approval Rules",
  uniqueKey: "code",
  activeField: "active",
  exportEntityType: "payroll_department",
  searchKeys: ["code", "name"],
  permissions: { view: "employees.view", create: "employees.create", edit: "employees.edit" },
  defaultShowAllColumns: true,
  fields: [
    { key: "code", label: "รหัส", type: "text", colSize: 100, groupKey: "core", order: 10, placeholder: "ASM" },
    { key: "name", label: "ชื่อแผนก", type: "text", colSize: 200, required: true, formSpan: 2, groupKey: "core", order: 20 },
    { key: "display_order", label: "ลำดับ", type: "number", colSize: 80, groupKey: "core", order: 30 },
    { key: "status", label: "สถานะ", type: "select", colSize: 100, options: STATUS, filterable: true, groupKey: "core", order: 40 },
    { key: "note", label: "หมายเหตุ", type: "textarea", formSpan: 2, groupKey: "core", order: 50 },
    {
      key: "department_employees",
      label: "พนักงานในแผนก",
      type: "computed",
      hideInForm: true,
      formSpan: 2,
      groupKey: "relations",
      order: 60,
      renderDetail: ({ recordId, editable, form }) => (
        <DepartmentEmployeesPanel
          departmentId={recordId}
          departmentName={String(form.name ?? "")}
          editable={editable}
        />
      ),
    },
  ],
};
