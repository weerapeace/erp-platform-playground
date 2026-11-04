import { describe, it, expect } from "vitest";
import { fakeDb, type Row } from "./fake-db";
import { taobaoCnName, fillSkuCnNames } from "@/lib/sku-cn-name";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("ชื่อจีนของสินค้า (ของกลาง)", () => {
  it("การ์ด Taobao: ชื่อสินค้า + ตัวเลือกแรก · ไม่มีตัวจีน = null", () => {
    expect(taobaoCnName({ original_name: "彩色拉链头 5号", variants: [{ originalName: "黄色 [5个装]" }] })).toBe("彩色拉链头 5号 黄色 [5个装]");
    expect(taobaoCnName({ original_name: "彩色拉链头", variants: [] })).toBe("彩色拉链头");
    expect(taobaoCnName({ original_name: "Zipper", variants: null })).toBeNull();
  });
  it("เติมเฉพาะตัวที่ยังว่าง · ไม่ทับของเดิม · สินค้าซ้ำใช้ชื่อแรก · ลงประวัติ", async () => {
    const tables: Record<string, Row[]> = { skus_v2: [{ id: "a", name_cn: null }, { id: "b", name_cn: "原有" }, { id: "c", name_cn: "" }], audit_logs: [] };
    const db = fakeDb(tables) as unknown as SupabaseClient;
    const n = await fillSkuCnNames(db, [
      { sku_id: "a", name_cn: "狗扣 9mm" }, { sku_id: "a", name_cn: "第二个" }, { sku_id: "b", name_cn: "新名字" }, { sku_id: "c", name_cn: "D扣" }, { sku_id: "c", name_cn: null },
    ], { id: null, name: "test" }, "seller_bill", "bill-1");
    expect(n).toBe(2);
    expect(tables.skus_v2.map((s) => s.name_cn)).toEqual(["狗扣 9mm", "原有", "D扣"]);
    expect(tables.audit_logs).toHaveLength(2);
    expect((tables.audit_logs[0].metadata as Row).source).toBe("seller_bill");
  });
});
