import { describe, expect, it } from "vitest";
import { describeLineHistory, isLineHistoryRow, lineSetupSteps } from "@/lib/line-history";

const row = (action: string, entity_type: string, metadata: Record<string, unknown> = {}) => ({ id: "1", action, entity_type, created_at: "2026-11-22T10:00:00Z", actor: null, metadata });

describe("ประวัติเรื่อง LINE (lib/line-history)", () => {
  it("เลือกเฉพาะแถวเรื่อง LINE · ไม่เอาการเปิดดู", () => {
    expect(isLineHistoryRow("update", "line_config")).toBe(true);
    expect(isLineHistoryRow("payroll_line_payslip_open", "payroll_periods")).toBe(true);
    expect(isLineHistoryRow("update", "payroll_periods")).toBe(false);
    expect(isLineHistoryRow("line_self_view", "employees")).toBe(false);
    expect(isLineHistoryRow("line_customer_view", "partners_v2")).toBe(false);
  });

  it("แปลเป็นภาษาคน + สีตามความเสี่ยง", () => {
    expect(describeLineHistory(row("rotate_line_company_qr", "line_config", { kind: "customer", actor: "a@x" }))).toMatchObject({ text: expect.stringContaining("QR ลูกค้า"), tone: "warn", who: "a@x" });
    expect(describeLineHistory(row("update", "line_config", { field: "company_layout", op: "revert" })).text).toContain("ย้อนปุ่มเมนู");
    expect(describeLineHistory(row("confirm_line_member", "line_memberships")).text).toBe("HR ยืนยันตัวตนพนักงาน");
    expect(describeLineHistory(row("block_line_member", "line_memberships")).tone).toBe("danger");
    expect(describeLineHistory(row("approve_line_customer_request", "line_customer_links")).text).toBe("ยืนยันร้านให้ลูกค้า");
    expect(describeLineHistory(row("payroll_line_payslip_open", "payroll_periods", { period_name: "ต.ค." })).text).toContain("ต.ค.");
    expect(describeLineHistory(row("line_register_failed", "line_memberships")).tone).toBe("danger");
    expect(describeLineHistory(row("update", "line_config", { field: "groups", slot: "po" })).text).toContain("กลุ่มแจ้งเตือน");
    expect(describeLineHistory(row("weird", "line_config")).who).toBe("ระบบ");
  });

  it("เช็กลิสต์ตั้งค่าครั้งแรก 4 ขั้น", () => {
    const s = lineSetupSteps({ hasToken: true, companyBot: true, companyReady: false, companyQrUsed: false, menusPublished: false });
    expect(s.map((x) => x.done)).toEqual([true, false, false, false]);
    expect(lineSetupSteps({ hasToken: true, companyBot: true, companyReady: true, companyQrUsed: true, menusPublished: true }).every((x) => x.done)).toBe(true);
  });
});
