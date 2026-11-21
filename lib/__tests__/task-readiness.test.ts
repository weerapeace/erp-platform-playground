import { describe, expect, it } from "vitest";
import { cleanReadinessRules, readinessKeysFor, readinessSummary, taskReadiness, DEFAULT_READINESS, type ReadinessParent } from "../task-readiness";

const full: ReadinessParent = {
  id: "p1", code: "LY22", name: "LY22",
  introduction: null, description: "หนังแท้\nขนาด 20 ซม.", english_description: "Genuine leather\nSize 20 cm",
  size: { length: 20, height: 15, thickness: 8 }, parent_images: 3, description_images: 0,
  skus: [{ code: "LY22-BK", color_th: "ดำ", color_en: "Black", list_price: 590, fake_price: 990, images: 2 }],
  warranty: "1 ปี", weight_g: 400, platform_category_id: "c1",
};

describe("taskReadiness", () => {
  it("ผ่านครบเมื่อข้อมูลครบ", () => {
    const items = taskReadiness([full], DEFAULT_READINESS, { platforms: ["shopee"], listed: { shopee: true } });
    expect(items.every((i) => i.ok)).toBe(true);
    expect(readinessSummary(items)).toEqual({ done: 9, total: 9, missing: 0 });
  });
  it("จับข้อที่ขาด + บอก Parent ที่ต้องแก้", () => {
    const p: ReadinessParent = { ...full, warranty: null, weight_g: null, skus: [{ ...full.skus[0], fake_price: null }], platform_category_id: null };
    const items = taskReadiness([p], DEFAULT_READINESS, { platforms: ["shopee", "line"], listed: { shopee: true, line: false } });
    const bad = items.filter((i) => !i.ok).map((i) => i.key).sort();
    expect(bad).toEqual(["category", "platform", "price", "size", "warranty"]);
    expect(items.find((i) => i.key === "warranty")?.parentIds).toEqual(["p1"]);
  });
  it("สถานะลงร้านยังไม่มา = pending ไม่นับ", () => {
    const items = taskReadiness([full], ["platform"], { platforms: ["shopee"], listed: null });
    expect(items[0].pending).toBe(true);
    expect(readinessSummary(items).total).toBe(0);
  });
  it("ไม่มี Parent = แจ้งยังไม่ผูก", () => {
    const items = taskReadiness([], ["desc"], {});
    expect(items[0].ok).toBe(false);
    expect(items[0].issues[0]).toContain("Parent");
  });
});

describe("rules", () => {
  it("ตั้งเฉพาะประเภท > ค่ากลาง > ค่าเริ่มต้น", () => {
    const r = cleanReadinessRules({ default: ["img", "bogus"], byType: { cover: ["img"], x: "bad" } });
    expect(r.default).toEqual(["img"]);
    expect(readinessKeysFor(r, "cover")).toEqual(["img"]);
    expect(readinessKeysFor(r, "other")).toEqual(["img"]);
    expect(readinessKeysFor(null, "other")).toEqual(DEFAULT_READINESS);
  });
});
