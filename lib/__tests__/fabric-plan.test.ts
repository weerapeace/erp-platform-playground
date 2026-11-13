import { describe, expect, it } from "vitest";
import { blocksFromLayout, planGroup, planTotals, type PlanGroupInput } from "../fabric-plan";

const g = (blocks: PlanGroupInput["blocks"], on_hand: number | null = null): PlanGroupInput => ({
  key: "CANVAS|150|", sku: "CANVAS", name: "แคนวาส", uom: "หลา", face_width_cm: 150, sheet_length_cm: null, divisor: 90, blocks, on_hand,
});

describe("วางแผนตัดผ้า (fabric-plan)", () => {
  it("ตัดรวมไม่มากกว่าตัดแยก · แบ่งคืนต่อใบรวมได้เท่าตัดรวม", () => {
    // ชิ้น 100 กว้าง บนหน้า 150 → ตัดแยกเหลือเศษข้างละ 50 · ชิ้นเล็ก 45 จากอีกใบยัดลงช่องได้
    const r = planGroup(g([
      { mo_no: "MO-1", label: "100×40", width_cm: 100, length_cm: 40, total_pieces: 10, no_rotate: true },
      { mo_no: "MO-2", label: "45×40", width_cm: 45, length_cm: 40, total_pieces: 10, no_rotate: true },
    ]));
    expect(r.ok).toBe(true);
    expect(r.mos).toEqual(["MO-1", "MO-2"]);
    expect(r.need).toBeLessThanOrEqual(r.separate + 1e-9);
    expect(r.best).toBe("combined");
    expect(r.saved).toBeGreaterThan(0);
    const sum = r.per_mo.reduce((a, m) => a + m.combined, 0);
    expect(Math.abs(sum - r.combined.qty)).toBeLessThan(0.05);
    expect(r.per_mo.find((m) => m.mo_no === "MO-1")!.share_pct).toBeGreaterThan(50);
  });

  it("ไม่มีวันแนะนำทางที่เปลืองกว่า: need ≤ ตัดแยก · alloc รวม = need", () => {
    const r = planGroup(g([
      { mo_no: "MO-1", label: "74×40", width_cm: 74, length_cm: 40, total_pieces: 9, no_rotate: true },
      { mo_no: "MO-2", label: "76×41", width_cm: 76, length_cm: 41, total_pieces: 7, no_rotate: true },
      { mo_no: "MO-3", label: "70×33", width_cm: 70, length_cm: 33, total_pieces: 5, no_rotate: false },
    ]));
    expect(r.need).toBeLessThanOrEqual(r.separate + 1e-9);
    expect(r.need).toBeLessThanOrEqual(r.combined.qty + 0.005);   // ปัดทศนิยม 2 ตำแหน่ง
    expect(Math.abs(r.per_mo.reduce((a, m) => a + m.alloc, 0) - r.need)).toBeLessThan(0.05);
  });

  it("ใบเดียว = ตัดแยกเท่าตัดรวม ไม่มีประหยัด", () => {
    const r = planGroup(g([{ mo_no: "MO-1", label: "50×50", width_cm: 50, length_cm: 50, total_pieces: 6, no_rotate: false }]));
    expect(r.saved).toBe(0);
    expect(r.separate).toBeCloseTo(r.combined.qty, 2);
  });

  it("เทียบสต็อก: ขาดเท่าไหร่ / ไม่รู้สต็อก = null", () => {
    const blocks = [{ mo_no: "MO-1", label: "150×90", width_cm: 150, length_cm: 90, total_pieces: 10, no_rotate: false }];
    expect(planGroup(g(blocks, 4)).short).toBeCloseTo(6, 1);   // ต้องใช้ ~10 หลา มี 4
    expect(planGroup(g(blocks, 50)).short).toBe(0);
    expect(planGroup(g(blocks)).short).toBeNull();
  });

  it("ไม่มีชิ้น = วางไม่ได้", () => {
    const r = planGroup(g([]));
    expect(r.ok).toBe(false);
    expect(planTotals([r]).mos).toBe(0);
  });

  it("แปลงผังที่เก็บต่อใบเป็นบล็อก", () => {
    expect(blocksFromLayout("MO-9", { blocks: [{ label: "30×20", width_cm: 30, length_cm: 20, total_pieces: 12.7, no_rotate: true }] }))
      .toEqual([{ mo_no: "MO-9", label: "30×20", width_cm: 30, length_cm: 20, total_pieces: 12, no_rotate: true }]);
    expect(blocksFromLayout("MO-9", null)).toEqual([]);
  });
});

describe("ใบตัดผ้า (พิมพ์)", () => {
  it("มีหัวใบ · ผัง SVG · ตารางต่อใบ · ช่องเซ็น", async () => {
    const { renderFabricPlanHtml } = await import("../fabric-plan-print");
    const r = planGroup(g([
      { mo_no: "MO-1", label: "100×40", width_cm: 100, length_cm: 40, total_pieces: 10, no_rotate: true },
      { mo_no: "MO-2", label: "45×40", width_cm: 45, length_cm: 40, total_pieces: 10, no_rotate: true },
    ], 2));
    const html = renderFabricPlanHtml([r], { "MO-1": { mo_no: "MO-1", product_sku: "BAG-1", product_name: "กระเป๋า", qty: 10 } }, { title: "ใบตัดผ้า", date: "13 พ.ย. 69" });
    expect(html).toContain("ใบตัดผ้า");
    expect(html).toContain("<svg");
    expect(html).toContain("BAG-1");
    expect(html).toContain("ผู้ตัด");
    expect(html).not.toContain("undefined");
  });
});
