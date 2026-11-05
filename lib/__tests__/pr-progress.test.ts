import { describe, it, expect } from "vitest";
import { prProgress, PR_STAGE_STEPS } from "@/lib/pr-progress";

const line = (qty: number, rec: number, st = "pending") => ({ qty, qty_received: rec, line_status: st });

describe("ใบขอซื้อไปถึงไหนแล้ว (ประวัติการขอซื้อ)", () => {
  it("ยังไม่มีใบสั่งซื้อ = รออนุมัติ/รอสั่ง (ช่อง 1)", () => {
    expect(prProgress({ pr_status: "waiting" })).toMatchObject({ stage: "requested", step: 0 });
  });
  it("ไม่อนุมัติ / ยกเลิก = นอกเส้น", () => {
    expect(prProgress({ pr_status: "rejected", line: line(5, 0) })).toMatchObject({ stage: "rejected", step: -1 });
    expect(prProgress({ pr_status: "cancelled" })).toMatchObject({ stage: "cancelled", step: -1 });
  });
  it("ใบสั่งซื้อยังเป็นร่าง = ออกใบแล้ว ยังไม่สั่งร้าน", () => {
    expect(prProgress({ pr_status: "rfq_created", line: line(5, 0), po_status: "draft" })).toMatchObject({ stage: "po_draft", step: 1 });
  });
  it("สั่งแล้ว ยังไม่ได้ของ", () => {
    expect(prProgress({ pr_status: "rfq_created", line: line(5, 0), po_status: "purchase" }).stage).toBe("ordered");
    expect(prProgress({ pr_status: "rfq_created", line: line(5, 0), po_status: "partial" }).stage).toBe("ordered");
  });
  it("ได้ของบางส่วน / ครบ (เผื่อทศนิยม)", () => {
    expect(prProgress({ pr_status: "rfq_created", line: line(5, 2), po_status: "partial" }).stage).toBe("receiving");
    expect(prProgress({ pr_status: "rfq_created", line: line(7.34, 7.33995), po_status: "partial" })).toMatchObject({ stage: "received", step: 4, short: false });
  });
  it("ปิดยอดทั้งที่ได้ไม่ครบ = จบ แต่บอกว่าได้ไม่ครบ", () => {
    const p = prProgress({ pr_status: "rfq_created", line: line(10, 6, "short_closed"), po_status: "partial" });
    expect(p).toMatchObject({ stage: "received", short: true });
    expect(p.label).toContain("ได้ไม่ครบ");
  });
  it("ยกเลิกบรรทัดโดยไม่ได้ของเลย = ยกเลิก", () => {
    expect(prProgress({ pr_status: "rfq_created", line: line(10, 0, "cancelled"), po_status: "purchase" }).stage).toBe("cancelled");
  });
  it("ลำดับช่องบนแถบ", () => {
    expect(PR_STAGE_STEPS).toEqual(["requested", "po_draft", "ordered", "receiving", "received"]);
  });
});
