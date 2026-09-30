import { describe, expect, it } from "vitest";
import {
  capContractByResignDate,
  contractMapForPeriod,
  contractOverlapsPeriod,
  employeeInPeriod,
  pickContractForPeriod,
} from "@/lib/payroll-period-contracts";

const sep = { start_date: "2026-09-01", end_date: "2026-09-30" };

describe("payroll-period-contracts: ใครอยู่ในงวด", () => {
  it("ลาออกกลางเดือน (สัญญา ended 15/09) ยังอยู่ในงวดกันยายน", () => {
    expect(contractOverlapsPeriod({ status: "ended", start_date: "2026-08-06", end_date: "2026-09-15" }, sep)).toBe(true);
  });

  it("สัญญาจบก่อนงวดเริ่ม / เริ่มหลังงวดจบ → ไม่อยู่", () => {
    expect(contractOverlapsPeriod({ status: "ended", start_date: "2026-01-01", end_date: "2026-08-31" }, sep)).toBe(false);
    expect(contractOverlapsPeriod({ status: "active", start_date: "2026-10-01", end_date: null }, sep)).toBe(false);
  });

  it("เข้ากลางเดือน / ไม่มีวันสิ้นสุด → อยู่", () => {
    expect(contractOverlapsPeriod({ status: "active", start_date: "2026-09-20", end_date: null }, sep)).toBe(true);
    expect(contractOverlapsPeriod({ status: "active", start_date: "2026-01-01" }, sep)).toBe(true);
  });

  it("สัญญายกเลิก → ไม่นับ", () => {
    expect(contractOverlapsPeriod({ status: "cancelled", start_date: "2026-01-01", end_date: null }, sep)).toBe(false);
  });

  it("ต่อสัญญากลางเดือน: เลือกฉบับปัจจุบันก่อน ไม่งั้นฉบับเริ่มล่าสุด", () => {
    const old = { id: "old", status: "ended", is_current: false, start_date: "2026-01-01", end_date: "2026-09-15" };
    const renew = { id: "new", status: "active", is_current: true, start_date: "2026-09-16", end_date: null };
    expect(pickContractForPeriod([old, renew], sep)?.id).toBe("new");
    const a = { id: "a", status: "ended", start_date: "2026-09-01", end_date: "2026-09-10" };
    const b = { id: "b", status: "ended", start_date: "2026-09-11", end_date: "2026-09-20" };
    expect(pickContractForPeriod([a, b], sep)?.id).toBe("b");
    expect(pickContractForPeriod([{ status: "ended", start_date: "2026-01-01", end_date: "2026-05-01" }], sep)).toBeNull();
  });

  it("จัดกลุ่มต่อคน", () => {
    const m = contractMapForPeriod([
      { employee_id: "e1", status: "ended", start_date: "2026-08-06", end_date: "2026-09-15" },
      { employee_id: "e2", status: "ended", start_date: "2026-01-01", end_date: "2026-03-31" },
      { employee_id: "e3", status: "active", start_date: "2026-01-01", end_date: null },
    ], sep);
    expect([...m.keys()].sort()).toEqual(["e1", "e3"]);
  });

  it("พนักงานลาออกก่อนงวดเริ่ม → ไม่อยู่ · ลาออกในงวด → อยู่ · ทำงานอยู่ → อยู่", () => {
    expect(employeeInPeriod({ employment_status: "resigned", resign_date: "2026-08-31" }, sep)).toBe(false);
    expect(employeeInPeriod({ employment_status: "resigned", resign_date: "2026-09-15" }, sep)).toBe(true);
    expect(employeeInPeriod({ employment_status: "active", resign_date: null }, sep)).toBe(true);
    expect(employeeInPeriod({ employment_status: "inactive", resign_date: null }, sep)).toBe(true);
  });

  it("วันลาออกมาก่อนวันสิ้นสุดสัญญา → ตัดสัญญาที่วันลาออก", () => {
    const c = { start_date: "2026-01-01", end_date: null };
    expect(capContractByResignDate(c, { employment_status: "resigned", resign_date: "2026-09-15" }).end_date).toBe("2026-09-15");
    expect(capContractByResignDate({ ...c, end_date: "2026-09-10" }, { employment_status: "resigned", resign_date: "2026-09-15" }).end_date).toBe("2026-09-10");
    expect(capContractByResignDate(c, { employment_status: "active", resign_date: "2026-09-15" }).end_date).toBeNull();
  });
});
