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

describe("จ่ายช่างเหมาหลายคน — แบ่งเท่ากัน + เตือนเหลือ/เกิน", () => {
  it("splitEven: เศษให้คนที่เลือกก่อน · รวมเท่าเดิมเสมอ", async () => {
    const { splitEven } = await import("@/lib/work-entry-rules");
    expect(splitEven(1500, 3)).toEqual([500, 500, 500]);
    expect(splitEven(800, 3)).toEqual([267, 267, 266]);
    expect(splitEven(10, 1)).toEqual([10]);
    expect(splitEven(2, 3)).toEqual([1, 1, 0]);
    expect(splitEven(12.5, 2)).toEqual([6.5, 6]);
    expect(splitEven(0, 2)).toEqual([0, 0]);
    expect(splitEven(10, 0)).toEqual([]);
  });
  it("splitIssues: เกิน = ห้ามบันทึก · เหลือ = เตือนแต่จ่ายได้ · ครบ = ผ่าน", async () => {
    const { splitIssues } = await import("@/lib/work-entry-rules");
    expect(splitIssues({ parts: [500, 500, 500], remaining: 1500 })).toEqual([]);
    expect(splitIssues({ parts: [500, 500, 300], remaining: 1500 })[0]).toMatchObject({ level: "warn", msg: expect.stringContaining("เหลือ 200 ชิ้น") });
    expect(splitIssues({ parts: [800, 900], remaining: 1500 })[0]).toMatchObject({ level: "error", msg: expect.stringContaining("เกิน 200 ชิ้น") });
    expect(splitIssues({ parts: [0, 0], remaining: 1500 })[0].level).toBe("error");
    expect(splitIssues({ parts: [-1, 5], remaining: 10 })[0].level).toBe("error");
  });
});

describe("deskKindOf — ชนิดโต๊ะของป๊อปจ่ายด่วน (โหมดผู้บริหาร)", () => {
  it("ชื่อมี เหมา = hire · มี กลุ่ม = group · อื่น = normal", async () => {
    const { deskKindOf, isGroupDesk } = await import("@/lib/work-entry-rules");
    expect(deskKindOf("ช่างเหมา")).toBe("hire");
    expect(deskKindOf("จับกลุ่ม")).toBe("group");
    expect(deskKindOf("โต๊ะเสถียร")).toBe("normal");
    expect(deskKindOf(null)).toBe("normal");
    expect(isGroupDesk("โต๊ะขาล")).toBe(false);
  });
});
