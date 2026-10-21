import { describe, expect, it } from "vitest";

import { auditLogPermissionFor, isSensitiveAuditEntityType } from "@/lib/audit-log-access";

describe("audit log access", () => {
  it("requires admin.audit_log for the company-wide log", () => {
    expect(auditLogPermissionFor({})).toBe("admin.audit_log");
    expect(auditLogPermissionFor({ entityType: "", entityId: " " })).toBe("admin.audit_log");
  });

  it("lets staff read the history of one record", () => {
    expect(auditLogPermissionFor({ entityId: "6f1c2c3e-0000-4000-8000-000000000001" })).toBe("products.view");
  });

  it("lets staff read everyday entity types", () => {
    for (const t of ["design_sheet", "erp_playground_product", "purchase_request", "sku", "work_order"]) {
      expect(auditLogPermissionFor({ entityType: t })).toBe("products.view");
    }
  });

  it("keeps sensitive entity types admin-only, even with a record id", () => {
    const sensitive = [
      "payroll_periods", "attendance_entries", "leave_entries", "employees", "employee_bank_accounts",
      "employee_contracts", "loan_contracts", "loan_payments", "od_facilities", "cashflow_manual_items",
      "banks", "china_transfers", "user_profiles", "erp_role_permission", "partners_v2", "store_customer",
    ];
    for (const t of sensitive) {
      expect(isSensitiveAuditEntityType(t)).toBe(true);
      expect(auditLogPermissionFor({ entityType: t, entityId: "6f1c2c3e-0000-4000-8000-000000000001" })).toBe("admin.audit_log");
    }
  });
});
