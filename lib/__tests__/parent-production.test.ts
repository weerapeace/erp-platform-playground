import { describe, expect, it } from "vitest";
import { pickDefaultSku, productionHistoryStatus, sortBomVersions, summarizeWorkOrders, versionNumber } from "@/lib/parent-production";

describe("parent-production", () => {
  it("เลขเวอร์ชัน", () => {
    expect(versionNumber("v12")).toBe(12);
    expect(versionNumber("V2")).toBe(2);
    expect(versionNumber(null)).toBe(0);
  });

  it("เรียงเวอร์ชันล่าสุดก่อน (v10 มาก่อน v2) · เลขเท่ากัน = แก้ล่าสุดก่อน", () => {
    const r = sortBomVersions([
      { bom_code: "a", product_sku: "X", version: "v2", updated_at: "2026-01-01" },
      { bom_code: "b", product_sku: "X", version: "v10", updated_at: "2025-01-01" },
      { bom_code: "c", product_sku: "X", version: "v2", updated_at: "2026-05-01" },
    ]);
    expect(r.map((x) => x.bom_code)).toEqual(["b", "c", "a"]);
  });

  it("SKU ที่เปิดก่อน = สูตรแก้ล่าสุด · ไม่มีสูตร = ตัวแรก", () => {
    const skus = ["WK46-01", "WK46-02", "WK46-05"];
    expect(pickDefaultSku(skus, [
      { bom_code: "1", product_sku: "WK46-01", version: "v1", updated_at: "2026-08-01" },
      { bom_code: "2", product_sku: "WK46-02", version: "v1", updated_at: "2026-09-01" },
      { bom_code: "3", product_sku: "OTHER", version: "v1", updated_at: "2026-12-01" },
    ])).toBe("WK46-02");
    expect(pickDefaultSku(skus, [])).toBe("WK46-01");
    expect(pickDefaultSku([], [])).toBeNull();
  });

  it("รวมใบจ่ายงาน: ไม่นับที่ยกเลิก · ชื่อจาก assignees ก่อน assignee_name · ไม่ซ้ำ", () => {
    const s = summarizeWorkOrders([
      { status: "done", qty: "50", received_qty: "50", assignee_name: "เลน", department_name: "ช่างเหมา", assignees: [{ name: "สุพัฒ (เลน)" }] },
      { status: "dispatched", qty: 20, received_qty: 0, assignee_name: "โด่ง", department_name: "ช่างเหมา" },
      { status: "cancelled", qty: 99, received_qty: 0, assignee_name: "พิว", department_name: "โต๊ะขาล" },
    ]);
    expect(s).toEqual({ dispatched: 70, received: 50, people: ["สุพัฒ (เลน)", "โด่ง"], departments: ["ช่างเหมา"] });
  });

  it("สถานะในประวัติ", () => {
    expect(productionHistoryStatus({ status: "draft", qty: 10, dispatched: 0, received: 0 })).toEqual({ label: "ยังไม่เริ่ม", tone: "gray" });
    expect(productionHistoryStatus({ status: "draft", qty: 10, dispatched: 10, received: 0 }).label).toBe("กำลังผลิต");
    expect(productionHistoryStatus({ status: "draft", qty: 10, dispatched: 10, received: 4 }).label).toBe("ส่งแล้ว 4/10");
    expect(productionHistoryStatus({ status: "draft", qty: 10, dispatched: 10, received: 10 }).label).toBe("ส่งครบ");
    expect(productionHistoryStatus({ status: "done", qty: 10, dispatched: 0, received: 0 }).label).toBe("ปิดใบแล้ว");
    expect(productionHistoryStatus({ status: "cancelled", qty: 10, dispatched: 0, received: 0 }).label).toBe("ยกเลิก");
  });
});
