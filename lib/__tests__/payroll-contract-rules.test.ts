import { describe, expect, it } from "vitest";
import { contractValidationError, isValidDateString } from "@/lib/payroll-contract-rules";

describe("payroll-contract-rules", () => {
  it("รู้จักวันที่จริง / ค่าว่าง", () => {
    expect(isValidDateString("2026-06-08")).toBe(true);
    expect(isValidDateString("2026-06-08T00:00:00Z")).toBe(true);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString(null)).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
  });

  it("สถานะสิ้นสุดแต่ไม่มีวันสิ้นสุด → เตือนเป็นภาษาคน (ไม่ใช่ error ดิบจาก DB)", () => {
    const msg = contractValidationError({ status: "ended", end_date: "" });
    expect(msg).toContain("สิ้นสุด");
    expect(contractValidationError({ status: "ended", end_date: null })).not.toBeNull();
    expect(contractValidationError({ status: "ended" })).not.toBeNull();
  });

  it("สถานะสิ้นสุด + มีวันสิ้นสุด / สถานะอื่น → ผ่าน", () => {
    expect(contractValidationError({ status: "ended", end_date: "2026-09-30" })).toBeNull();
    expect(contractValidationError({ status: "active", end_date: "" })).toBeNull();
    expect(contractValidationError({ status: "cancelled" })).toBeNull();
  });
});
