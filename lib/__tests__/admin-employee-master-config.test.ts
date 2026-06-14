import { describe, expect, it, vi } from "vitest";
import { ADMIN_DEPARTMENT_MASTER_CONFIG } from "@/lib/admin-department-master-config";
import { ADMIN_EMPLOYEE_MASTER_CONFIG } from "@/lib/admin-employee-master-config";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("admin employee master config", () => {
  it("uses the real payroll employee API instead of the old demo employee master", () => {
    expect(ADMIN_EMPLOYEE_MASTER_CONFIG.apiBase).toBe("/api/payroll/core/");
    expect(ADMIN_EMPLOYEE_MASTER_CONFIG.apiPath).toBe("employees");
    expect(ADMIN_EMPLOYEE_MASTER_CONFIG.uniqueKey).toBe("employee_code");
    expect(ADMIN_EMPLOYEE_MASTER_CONFIG.searchKeys).toEqual(
      expect.arrayContaining(["employee_code", "full_name", "department_name"]),
    );
  });

  it("keeps sensitive payroll fields out of the admin employee list", () => {
    const keys = (ADMIN_EMPLOYEE_MASTER_CONFIG.fields ?? []).map((field) => field.key);

    expect(keys).toContain("employee_code");
    expect(keys).toContain("department_id");
    expect(keys).not.toEqual(expect.arrayContaining([
      "base_salary",
      "bank_account_no",
      "national_id",
      "passport_no",
    ]));
  });

  it("enables central bulk edit for safe admin employee fields", () => {
    const bulkEditableKeys = (ADMIN_EMPLOYEE_MASTER_CONFIG.fields ?? [])
      .filter((field) => field.bulkEditable)
      .map((field) => field.key);

    expect(bulkEditableKeys).toEqual(expect.arrayContaining([
      "title",
      "department_id",
      "position_id",
      "employment_status",
      "phone",
      "email",
    ]));
    expect(bulkEditableKeys).not.toContain("employee_code");
    expect(bulkEditableKeys).not.toContain("full_name");
  });

  it("shows employees from the same department in the department detail drawer", () => {
    const employeesField = (ADMIN_DEPARTMENT_MASTER_CONFIG.fields ?? []).find((field) => field.key === "department_employees");

    expect(employeesField?.type).toBe("computed");
    expect(employeesField?.hideInForm).toBe(true);
    expect(employeesField?.renderDetail).toBeTypeOf("function");
  });
});
