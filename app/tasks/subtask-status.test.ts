import { describe, it, expect } from "vitest";
import { normalizeSubStatus, subStatusLabel, subStatusDot, subStatusRank, isSubDone, SUBTASK_STATUS_STEPS } from "./subtask-status";

describe("subtask-status · สถานะงานย่อยกลาง", () => {
  it("แปลงค่าเก่า doing/done/posted เป็นค่าปัจจุบัน", () => {
    expect(normalizeSubStatus("doing")).toBe("in_progress");
    expect(normalizeSubStatus("done")).toBe("approved");
    expect(normalizeSubStatus("posted")).toBe("approved");
    expect(normalizeSubStatus(null)).toBe("todo");
    expect(normalizeSubStatus("weird")).toBe("todo");
  });
  it("ขอแก้/ยกเลิก มีป้ายของตัวเอง (เดิมหน้าคิวงานโชว์ ยังไม่เริ่ม)", () => {
    expect(subStatusLabel("revision_requested")).toBe("ขอแก้");
    expect(subStatusLabel("canceled")).toBe("ยกเลิก");
    expect(subStatusDot("revision_requested")).toBe("bg-orange-500");
  });
  it("ลำดับเรียง: กำลังทำ → ยังไม่เริ่ม → รออนุมัติ → ขอแก้ → อนุมัติ → ยกเลิก", () => {
    const order = ["canceled", "approved", "revision_requested", "submitted", "todo", "in_progress"].sort((a, b) => subStatusRank(a) - subStatusRank(b));
    expect(order).toEqual(["in_progress", "todo", "submitted", "revision_requested", "approved", "canceled"]);
  });
  it("isSubDone รวมค่าเก่า", () => {
    expect(isSubDone("approved")).toBe(true);
    expect(isSubDone("posted")).toBe(true);
    expect(isSubDone("submitted")).toBe(false);
  });
  it("ขั้นในตัวเลือกครบ 6", () => {
    expect(SUBTASK_STATUS_STEPS).toHaveLength(6);
  });
});
