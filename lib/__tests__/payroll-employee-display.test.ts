import { describe, expect, it } from "vitest";
import { buildPayrollEmployeeSelectOption, payrollEmployeeSearchText } from "@/lib/payroll-employee-display";

describe("payroll-employee-display", () => {
  const employee = {
    id: "emp-1",
    employee_code: "E001",
    first_name: "สมชาย",
    last_name: "ใจดี",
    nickname: "ชาย",
    current_contract_no: "CON-001",
    current_contract_type: "permanent",
    current_wage_type: "monthly",
  };

  it("shows code, full name, nickname, and contract type in employee dropdown options", () => {
    expect(buildPayrollEmployeeSelectOption(employee)).toEqual({
      value: "emp-1",
      label: "E001 · สมชาย ใจดี (ชาย)",
      badge: "ประจำ",
      sub: "สัญญา CON-001 · ประจำ · รายเดือน",
    });
  });

  it("lets users search by nickname and contract type", () => {
    const searchText = payrollEmployeeSearchText(employee);

    expect(searchText).toContain("ชาย");
    expect(searchText).toContain("permanent");
    expect(searchText).toContain("ประจำ");
    expect(searchText).toContain("รายเดือน");
  });
});
