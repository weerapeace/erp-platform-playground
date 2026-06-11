import { describe, expect, it } from "vitest";
import {
  buildResignationRequestInsert,
  buildResignationApprovalUpdates,
  canTransitionResignation,
  getResignationTransitionCopy,
  normalizeResignationPayload,
  validateResignationDraft,
} from "@/lib/payroll-resignations-db";

describe("payroll-resignations", () => {
  it("keeps resignation details in the request payload", () => {
    const payload = normalizeResignationPayload({
      notice_date: "2026-06-01",
      last_working_date: "2026-06-30",
      reason: "ย้ายที่อยู่",
      handover_note: "ส่งมอบงานให้หัวหน้าแล้ว",
    });

    expect(payload).toEqual({
      notice_date: "2026-06-01",
      last_working_date: "2026-06-30",
      reason: "ย้ายที่อยู่",
      handover_note: "ส่งมอบงานให้หัวหน้าแล้ว",
    });
  });

  it("uses the existing employee portal request type allowed by the database", () => {
    const insert = buildResignationRequestInsert({
      employee_id: "emp-1",
      notice_date: "2026-06-01",
      last_working_date: "2026-06-30",
      reason: "แจ้งลาออก",
      handover_note: "ส่งมอบงานแล้ว",
    });

    expect(insert.request_type).toBe("profile_update");
    expect(insert.target_field).toBeNull();
    expect(insert.payload).toMatchObject({
      request_kind: "resignation",
      last_working_date: "2026-06-30",
    });
  });

  it("requires employee and last working date before creating a request", () => {
    expect(validateResignationDraft({ employee_id: "", last_working_date: "2026-06-30" })).toBe("ต้องเลือกพนักงาน");
    expect(validateResignationDraft({ employee_id: "emp-1", last_working_date: "" })).toBe("ต้องระบุวันทำงานวันสุดท้าย");
  });

  it("does not allow approving finished requests again", () => {
    expect(canTransitionResignation("pending", "approved")).toBe(true);
    expect(canTransitionResignation("approved", "rejected")).toBe(false);
    expect(canTransitionResignation("cancelled", "approved")).toBe(false);
  });

  it("builds employee and contract updates only when approving", () => {
    expect(buildResignationApprovalUpdates("2026-06-30")).toEqual({
      employee: { employment_status: "resigned", resign_date: "2026-06-30" },
      currentContract: { end_date: "2026-06-30", status: "ended", is_current: false },
    });
  });

  it("explains that approving updates the employee and current contract", () => {
    const copy = getResignationTransitionCopy("approve");

    expect(copy.title).toBe("อนุมัติการลาออก");
    expect(copy.impactItems).toContain("เปลี่ยนสถานะพนักงานเป็นลาออก");
    expect(copy.impactItems).toContain("ปิดสัญญาจ้างปัจจุบันด้วยวันทำงานวันสุดท้าย");
  });

  it("explains that rejecting or cancelling does not touch employee master data", () => {
    expect(getResignationTransitionCopy("reject").impactItems).toContain("ไม่เปลี่ยนสถานะพนักงานหรือสัญญาจ้าง");
    expect(getResignationTransitionCopy("cancel").impactItems).toContain("ไม่เปลี่ยนสถานะพนักงานหรือสัญญาจ้าง");
  });
});
