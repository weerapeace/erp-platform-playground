import { describe, expect, it } from "vitest";
import { planTiktokDelivery, sameDelivery, tiktokDeliveryOf, tiktokDeliveryValue, ttsDeliveryOptionsOf } from "@/lib/tiktok-delivery";

const options = ttsDeliveryOptionsOf({ delivery_options: [
  { id: "D1", name: "Standard", type: "STANDARD", platform: "TIKTOK_SHOP" },
  { id: "D2", name: "Express", type: "EXPRESS", platform: "TIKTOK_SHOP" },
  { id: "D3", name: "Same day", type: "SAMEDAY", weight_limit: { max_weight: 5000, unit: "GRAM" }, platform: "TIKTOK_SHOP" },
  { id: "T1", name: "Toko", type: "STANDARD", platform: "TOKOPEDIA" },
] });

describe("ตัวเลือกการจัดส่ง", () => {
  it("อ่านรายการ (เฉพาะ TikTok Shop · แปลงน้ำหนักเป็น กก.)", () => {
    expect(options.map((o) => [o.id, o.typeLabel, o.maxWeightKg])).toEqual([["D1", "ส่งแบบมาตรฐาน", null], ["D2", "ส่งด่วน", null], ["D3", "ส่งภายในวัน", 5]]);
  });
  it("ค่าบนร้าน: ว่าง = ใช้ค่าของร้าน", () => {
    expect(tiktokDeliveryValue(tiktokDeliveryOf({ delivery_options: [] }).ids)).toBeNull();
    expect(tiktokDeliveryOf({ delivery_options: [{ id: "D1", name: "Standard", is_available: true }] })).toEqual({ ids: ["D1"], names: { D1: "Standard" } });
    expect(sameDelivery(["D1", "D2"], ["D2", "D1"])).toBe(true);
  });
  it("กำหนดเอง: เปลี่ยน · ว่าง = error · id ที่ไม่มี = error · น้ำหนักเกิน = เตือน", () => {
    const p = planTiktokDelivery(null, ["D1", "D3"], options, { weightKg: 6, limits: options });
    expect(p.changed).toBe(true);
    expect(p.errors).toEqual([]);
    expect(p.ids).toEqual(["D1", "D3"]);
    expect(p.change).toEqual({ label: "ตัวเลือกการจัดส่ง", before: "ใช้ค่าเริ่มต้นของร้าน", after: "Standard, Same day" });
    expect(p.warnings.join()).toContain("เกิน");
    expect(planTiktokDelivery(null, [], options).errors[0]).toContain("อย่างน้อย 1");
    expect(planTiktokDelivery(null, ["ZZ"], options).errors[0]).toContain("ใช้ไม่ได้");
    expect(planTiktokDelivery(["D1"], ["D1"], options).changed).toBe(false);
  });
  it("กลับไปใช้ค่าร้าน = ส่งรายการว่าง", () => {
    const p = planTiktokDelivery(["D1"], null, options);
    expect(p).toMatchObject({ changed: true, ids: [], errors: [] });
  });
});
