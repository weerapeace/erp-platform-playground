import { describe, expect, it, vi } from "vitest";

// ผู้ดูทั่วไป: ไม่มีสิทธิ์ใด ๆ (ไม่เห็นต้นทุน / ไม่เห็นเงินเดือน)
vi.mock("@/lib/api-auth", () => ({ apiCan: async () => false }));
vi.mock("@/lib/field-permissions", () => ({ getUserRole: async () => "staff" }));

import { enrichAuditRows } from "@/lib/audit-view-server";
import { auditLinesDiff } from "@/lib/audit";

/** แอดมิน DB ปลอม — ทุกคำขอได้ผลว่าง (ทดสอบเฉพาะกติกาซ่อนค่า ไม่แตะฐานข้อมูล) */
function fakeAdmin() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "limit", "order", "not", "or"]) chain[m] = () => chain;
  chain.then = (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve(res({ data: [], error: null }));
  return { from: () => chain } as never;
}
const row = (entity_type: string, metadata: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2), action: "update", entity_type, entity_id: null, actor_user_id: null, created_at: "2026-11-07T00:00:00Z", metadata,
});

describe("audit-view-server — ซ่อนตัวเลขต้นทุนในใบออกแบบ", () => {
  it("ราคาเสนอ/ยอดตีราคา/บรรทัดต้นทุน ถูกซ่อนและตัดออกจาก metadata · ช่องอื่นยังเห็น", async () => {
    const lines = auditLinesDiff([{ item_sku_code: "L1", item_name: "หนัง", qty: 1, uom: "หลา" }], [{ item_sku_code: "L1", item_name: "หนัง", qty: 2, uom: "หลา" }],
      { key: "item_sku_code", name: "item_name", qty: "qty", uom: "uom", prefix: "cost_line" });
    expect(lines[0].field).toBe("cost_line:L1");
    const out = await enrichAuditRows({} as never, fakeAdmin(), [
      row("design_sheet", { round: 3, changes: [{ field: "price", old: 120, new: 135 }, { field: "qty", old: 300, new: 500 }] }),
      row("design_sheet", { lines: 28, total: 109.53, changes: [{ field: "cost_total", old: 100, new: 109.53 }, ...lines] }),
      row("skus_v2", { changes: [{ field: "list_price", old: 590, new: 650 }] }),
    ]);
    const [q, c, sku] = out;
    expect(q.view.changes.find((x) => x.field === "price")?.hidden).toBe(true);
    expect(q.view.changes.find((x) => x.field === "qty")).toMatchObject({ old: "300", new: "500" });
    expect(JSON.stringify(q.metadata)).not.toMatch(/135/);
    expect(c.view.changes.every((x) => x.hidden)).toBe(true);
    expect(JSON.stringify(c.metadata)).not.toMatch(/109\.53/);
    expect(c.view.extras.find((x) => x.label === "จำนวนบรรทัด")?.value).toBe("28");
    // กฎนี้ใช้เฉพาะใบออกแบบ — สินค้าทั่วไปไม่โดน (ราคาขายไม่ใช่ต้นทุน)
    expect(sku.view.changes[0]).toMatchObject({ old: "590", new: "650" });
  });
});
