import { describe, it, expect } from "vitest";
import { dispatchRowIssues, notReadyIssue, wageIssues, defectNote, returnRowIssues, qcReceiveIssues, dateIssues, parentKeyOf, isHireDesk } from "../work-entry-rules";

describe("กฎกลางการลงงานผลิต", () => {
  it("จ่ายงาน: โต๊ะ · จำนวน · โต๊ะเหมาต้องมีช่าง", () => {
    expect(dispatchRowIssues({ qty: 5, remaining: 10, deskName: "โต๊ะแต๋ว", crewCount: 0 })).toEqual([]);
    expect(dispatchRowIssues({ qty: 0, remaining: 10, deskName: null, crewCount: 0 }).map((x) => x.field)).toEqual(["disp:dept", "disp:qty"]);
    expect(dispatchRowIssues({ qty: 12, remaining: 10, deskName: "โต๊ะ", crewCount: 1 })[0].msg).toMatch(/เกินที่เหลือให้จ่าย 10/);
    expect(dispatchRowIssues({ qty: 5, remaining: 10, deskName: "ช่างเหมา", crewCount: 0 })[0].field).toBe("disp:crew");
    expect(isHireDesk("ช่างเหมา")).toBe(true);
  });
  it("ยังไม่พร้อมจ่าย = เตือน", () => {
    expect(notReadyIssue(true, true)).toBeNull();
    expect(notReadyIssue(false, false)).toMatchObject({ level: "warn", msg: expect.stringContaining("เตรียม/ตัด") });
  });
  it("ค่าแรง/ชิ้น: ติดลบ = ผิด · เกิน 2 เท่าราคากลาง = เตือน", () => {
    expect(wageIssues(-1, 20, "w")[0].level).toBe("error");
    expect(wageIssues(50, 20, "w")[0].level).toBe("warn");
    expect(wageIssues(30, 20, "w")).toEqual([]);
    expect(wageIssues(null, 20, "w")).toEqual([]);
  });
  it("ประวัติงานเสียนับเฉพาะรุ่นเดียวกัน", () => {
    expect(parentKeyOf("TTM094-02")).toBe("TTM094");
    expect(defectNote([{ sku: "TTM094-01" }, { sku: "TTM094-03" }, { sku: "ABC1-01" }], "TTM094-02")).toBe("เคยทำรุ่นนี้เสีย 2 ครั้ง");
    expect(defectNote([{ sku: "ABC1-01" }], "TTM094-02")).toBeNull();
  });
  it("ส่งคืน / QC / วันที่", () => {
    expect(returnRowIssues({ qty: 11, outstanding: 10 })[0].msg).toMatch(/เกินที่ค้างช่าง 10/);
    expect(qcReceiveIssues({ good: 3, bad: 1, available: 4, shelfChosen: false, reasonChosen: false }).map((x) => x.field)).toEqual(["qc:shelf", "qc:reason"]);
    expect(dateIssues("2026-11-01", "d", { today: "2026-10-28" })[0].msg).toMatch(/อนาคต/);
    expect(dateIssues("2026-10-01", "d", { today: "2026-10-28", notBefore: "2026-10-05", notBeforeLabel: "วันที่จ่าย" })[0].msg).toMatch(/ก่อนวันที่จ่าย/);
    expect(dateIssues(null, "d", { today: "2026-10-28" })).toEqual([]);
  });
});
