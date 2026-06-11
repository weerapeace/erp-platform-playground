import { describe, expect, it } from "vitest";
import {
  isAttendanceScanExempt,
  isPayrollContractor,
  isPayrollDailyLike,
  shouldReceivePaidPeriodHoliday,
  shouldRequireAttendanceScan,
  shouldShowInAttendanceGrid,
} from "@/lib/payroll-attendance-rules";

describe("payroll-attendance-rules", () => {
  it("keeps piecework and contractor employees out of attendance flows", () => {
    expect(isPayrollContractor({ contract_type: "contractor" })).toBe(true);
    expect(isPayrollContractor({ employment_type: "contractor" })).toBe(true);
    expect(isPayrollContractor({ wage_type: "piecework" })).toBe(true);
    expect(shouldShowInAttendanceGrid({ wage_type: "piecework" })).toBe(false);
  });

  it("does not give automatic paid period holidays to daily-like contracts", () => {
    expect(isPayrollDailyLike({ contract_type: "daily" })).toBe(true);
    expect(isPayrollDailyLike({ wage_type: "hourly" })).toBe(true);
    expect(shouldReceivePaidPeriodHoliday({ wage_type: "monthly" })).toBe(true);
    expect(shouldReceivePaidPeriodHoliday({ wage_type: "daily" })).toBe(false);
    expect(shouldReceivePaidPeriodHoliday({ contract_type: "contractor" })).toBe(false);
  });

  it("allows scan-exempt contracts to skip scanner warnings without blocking manual absence", () => {
    expect(isAttendanceScanExempt({ attendance_scan_exempt: true })).toBe(true);
    expect(shouldRequireAttendanceScan({ attendance_scan_exempt: true })).toBe(false);
    expect(shouldShowInAttendanceGrid({ attendance_scan_exempt: true, wage_type: "monthly" })).toBe(true);
  });
});
