import { describe, expect, it } from "vitest";
import {
  buildAttendanceImportPreview,
  buildAttendanceManualEntryPayloads,
  calculateAttendanceDay,
  normalizeScannerEmployeeCode,
  parseAttendanceImportText,
} from "@/lib/payroll-attendance-import";

describe("payroll attendance import", () => {
  it("keeps scanner codes as text and parses CSV scan rows", () => {
    const rows = parseAttendanceImportText("scanner_code,date,scans\n001,04/05/2026,07:41 12:51 17:04");

    expect(rows).toHaveLength(1);
    expect(rows[0].scannerCode).toBe("001");
    expect(rows[0].date).toBe("2026-05-04");
    expect(rows[0].rawScans).toEqual(["07:41", "12:51", "17:04"]);
    expect(normalizeScannerEmployeeCode(" 001 ")).toBe("001");
  });

  it("marks late and early checkout rows as ready with manual payloads", () => {
    const preview = buildAttendanceImportPreview({
      activePeriod: { id: "period-1", default_hours_per_day: 8 },
      employees: [{ id: "emp-1", employee_code: "ISG-001", first_name: "Som", scanner_employee_code: "1" }],
      text: "1 04/05/2026 07:55 12:51 16:40",
      scheduleStatusFor: () => "workday",
    });

    expect(preview.summary.ready).toBe(1);
    expect(preview.rows[0].readyToCommit).toBe(true);
    expect(buildAttendanceManualEntryPayloads(preview.rows[0], { default_hours_per_day: 8 }).map((row) => row.entry_type)).toEqual([
      "late",
      "early_leave",
    ]);
  });

  it("creates review rows for scheduled employees missing scans", () => {
    const preview = buildAttendanceImportPreview({
      activePeriod: { id: "period-1", default_hours_per_day: 8 },
      employees: [
        { id: "emp-1", employee_code: "ISG-001", scanner_employee_code: "1" },
        { id: "emp-2", employee_code: "ISG-002", scanner_employee_code: "2" },
      ],
      text: "1 04/05/2026 07:50 12:50 17:00",
      contractForEmployee: () => ({ work_schedule_id: "factory_6d" }),
      scheduleStatusFor: () => "workday",
    });

    const missingRow = preview.rows.find((row) => row.employee?.id === "emp-2");

    expect(missingRow?.importStatus).toBe("needs_review");
    expect(missingRow?.result.absent).toBe(true);
    expect(missingRow?.rowKey).toBe("absence::emp-2::2026-05-04");
  });

  it("skips holidays and scanner exempt contracts", () => {
    expect(calculateAttendanceDay({ scheduleStatus: "holiday", rawScans: [] }).importStatus).toBe("skipped");

    const preview = buildAttendanceImportPreview({
      employees: [{ id: "emp-1", employee_code: "ISG-001", scanner_employee_code: "1" }],
      text: "1 04/05/2026 07:50 12:50 17:00",
      contractForEmployee: () => ({ attendance_scan_exempt: true }),
      scheduleStatusFor: () => "workday",
    });

    expect(preview.rows[0].importStatus).toBe("skipped");
    expect(preview.rows[0].result.flags).toContain("attendance_scan_exempt");
  });

  it("skips piecework contracts instead of creating scan errors", () => {
    const preview = buildAttendanceImportPreview({
      employees: [{ id: "emp-1", employee_code: "ISG-001", scanner_employee_code: "1" }],
      text: "1 04/05/2026 07:50 12:50 17:00",
      contractForEmployee: () => ({ wage_type: "piecework" }),
      scheduleStatusFor: () => "workday",
    });

    expect(preview.rows[0].importStatus).toBe("skipped");
    expect(preview.rows[0].result.flags).toContain("piecework_contract_skipped");
    expect(buildAttendanceManualEntryPayloads(preview.rows[0], { default_hours_per_day: 8 })).toEqual([]);
  });
});
