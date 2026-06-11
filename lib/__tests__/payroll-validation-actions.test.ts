import { describe, expect, it } from "vitest";
import { buildPayrollIssueFix } from "@/lib/payroll-validation-actions";

const PERIOD_ID = "11111111-1111-4111-8111-111111111111";

function decodeFixFilter(href: string): Record<string, { value?: string }> {
  const url = new URL(href, "http://localhost");
  const raw = url.searchParams.get("flt");
  if (!raw) throw new Error("missing flt");
  return JSON.parse(raw) as Record<string, { value?: string }>;
}

describe("payroll-validation-actions", () => {
  it("sends period setup issues to the selected payroll period drawer", () => {
    const fix = buildPayrollIssueFix("missing_work_days", PERIOD_ID, 1);

    expect(fix).toEqual({
      label: "ไปแก้งวดเงินเดือน",
      href: `/payroll/periods?open=${PERIOD_ID}`,
    });
  });

  it("sends bad wage contract issues to contracts with an issue filter", () => {
    const fix = buildPayrollIssueFix("invalid_contract_wage", PERIOD_ID, 9);
    expect(fix?.label).toBe("ไปแก้สัญญา 9 รายการ");
    expect(fix?.href.startsWith("/payroll/contracts?flt=")).toBe(true);

    const filter = decodeFixFilter(fix!.href);
    expect(filter.__payroll_issue.value).toBe("invalid_contract_wage");
    expect(filter.__period_id.value).toBe(PERIOD_ID);
  });

  it("sends recurring contract issues to recurring items with an issue filter", () => {
    const fix = buildPayrollIssueFix("recurring_missing_contract", PERIOD_ID, 14);
    expect(fix?.label).toBe("ไปแก้เงินประจำ 14 รายการ");
    expect(fix?.href.startsWith("/payroll/recurring?flt=")).toBe(true);

    const filter = decodeFixFilter(fix!.href);
    expect(filter.__payroll_issue.value).toBe("recurring_missing_contract");
    expect(filter.__period_id.value).toBe(PERIOD_ID);
  });
});
