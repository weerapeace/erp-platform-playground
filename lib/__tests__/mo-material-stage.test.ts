import { describe, it, expect } from "vitest";
import { matStage, matSteps, countStages } from "@/lib/mo-material-stage";
import type { MatPurchaseLink } from "@/lib/mo-material-status";

const link = (o: Partial<MatPurchaseLink> = {}): MatPurchaseLink => ({
  pr_no: "PR-2026-00118", pr_status: "approved", qty: 10, po_id: null, po_no: null, po_status: null, expected_date: null, seller_name: null,
  po_line_id: null, line_qty: 0, qty_received: 0, qty_defective: 0, line_status: null, line_closed: false, pr_date: "2026-11-02", po_date: null, ...o,
});
const po = (o: Partial<MatPurchaseLink> = {}) => link({ po_id: "p1", po_no: "PO-202611-00042", po_line_id: "l1", line_qty: 10, expected_date: "2026-11-08", ...o });

describe("ขั้นสถานะ 6 ขั้น", () => {
  it("ต้องซื้อ / ขอซื้อแล้ว / สั่งซื้อแล้ว", () => {
    expect(matStage({ status: "buy", links: [] })).toBe("buy");
    expect(matStage({ status: "requested", links: [link()] })).toBe("requested");
    expect(matStage({ status: "ordered", links: [po()] })).toBe("ordered");
  });
  it("สั่งแล้วและรับของมาบางส่วน = รับของแล้ว (บางส่วน)", () => {
    expect(matStage({ status: "ordered", links: [po({ qty_received: 6 })] })).toBe("receiving");
  });
  it("ปิดงานแบบ A: รับครบ/ปิดยอด · จ่ายงานแล้ว · ไม่ต้องซื้อ · ข้ามขั้นซื้อของ", () => {
    expect(matStage({ status: "received", links: [po({ qty_received: 10, line_closed: true })] })).toBe("closed");
    expect(matStage({ status: "have", links: [], dispatched: true })).toBe("closed");
    expect(matStage({ status: "skip", links: [] })).toBe("closed");
    expect(matStage({ status: "buy", links: [] }, { skippedBuy: true })).toBe("closed");
  });
  it("กดมีของแล้วเอง / เตรียมแล้ว = มีของแล้ว (ยังไม่ปิดงาน)", () => {
    expect(matStage({ status: "have", links: [] })).toBe("have");
    expect(matStage({ status: "ready", links: [] })).toBe("have");
  });
  it("นับต่อขั้นเรียงตามแถบสี", () => {
    expect(countStages(["buy", "buy", "closed", "have"])).toEqual([2, 0, 0, 0, 1, 1]);
  });
});

describe("ขั้นตอนย่อยบนการ์ด", () => {
  it("ยังไม่ได้ขอซื้อ = ไม่มีขั้นตอน", () => {
    expect(matSteps({ status: "buy", links: [] })).toEqual([]);
  });
  it("ขอซื้อแล้ว รออนุมัติ", () => {
    const s = matSteps({ status: "requested", links: [link()] });
    expect(s.map((x) => x.state)).toEqual(["now", "todo", "todo", "todo"]);
    expect(s[0].detail).toContain("PR-2026-00118");
  });
  it("สั่งแล้ว รับบางส่วน → บอกยอดค้าง", () => {
    const s = matSteps({ status: "ordered", links: [po({ qty_received: 6 })] });
    expect(s.map((x) => x.state)).toEqual(["done", "done", "now", "todo"]);
    expect(s[2].detail).toBe("รับแล้ว 6/10 · ค้าง 4");
    expect(s[1].detail).toContain("PO-202611-00042");
  });
  it("รับครบ → ปิดงาน", () => {
    const s = matSteps({ status: "received", links: [po({ qty_received: 10, line_closed: true })] });
    expect(s.every((x) => x.state === "done")).toBe(true);
  });
  it("กดมีของเอง → มีของแล้ว + รอปิดงาน · จ่ายงานแล้ว → ปิดงาน", () => {
    expect(matSteps({ status: "have", links: [] }).map((x) => [x.key, x.state])).toEqual([["have", "done"], ["close", "todo"]]);
    expect(matSteps({ status: "have", links: [], usedStock: true })[0].detail).toBe("ใช้ของในสต๊อก");
    const d = matSteps({ status: "have", links: [], dispatched: true, dispatchedAt: "2026-11-03" });
    expect(d[1]).toMatchObject({ state: "done" });
    expect(d[1].detail).toContain("จ่ายงานแล้ว");
  });
});
