import { describe, it, expect } from "vitest";
import { massEditPlan, applyCategoriesOp, sanitizeBulkPatch, BULK_FIELDS, BULK_PATCH_KEYS } from "../website-listing-fields";
import { listingPatchToRow } from "../website-listing-patch";
import { normalizeCardBadges, badgeRenames, badgeColorOf, DEFAULT_CARD_BADGES } from "../website-card-badges";
import { buildLinkedRows } from "../website-listing-linked";
import { normalizeFieldMap } from "../website-field-map";
import type { ProductDetailItem } from "../website-theme";

/** ✏️ แก้หลายรายการ (ทะเบียนช่องกลาง) · 🏷 ป้ายบนการ์ดของร้าน · 🔗 ข้อมูลที่เชื่อม */
describe("ทะเบียนช่องสินค้าบนเว็บ + แก้หลายรายการ", () => {
  it("ทุกช่องที่แก้หลายรายการได้ แปลงเป็นคอลัมน์ store_listings ได้จริง (กันลืมต่อ listingPatchToRow)", () => {
    const plan = massEditPlan({ published: "on", featured: "off", price: { mode: "set", value: 790 }, badge: "ขายดี", stockStatus: "low", unit: "ใบ", name: true, description: true });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const row = listingPatchToRow(sanitizeBulkPatch(plan.patch));
    expect(row).toEqual({ is_published: true, featured: false, web_price: 790, web_badge: "ขายดี", web_stock_status: "low", web_unit: "ใบ", web_name: null, web_description: null });
    expect(BULK_FIELDS.length).toBeGreaterThanOrEqual(9);
    expect(BULK_PATCH_KEYS).toContain("webPrice");
  });

  it("บอกว่าต้องแก้อะไร: ไม่ติ๊ก · ราคา 0 · เพิ่มหมวดแต่ไม่เลือก", () => {
    expect(massEditPlan({})).toMatchObject({ ok: false });
    expect(massEditPlan({ price: { mode: "set", value: 0 } })).toMatchObject({ ok: false });
    expect(massEditPlan({ categories: { mode: "add", keys: [] } })).toMatchObject({ ok: false });
    // แทนทั้งชุดด้วยว่าง = ไม่อยู่หมวดไหน (ทำได้)
    expect(massEditPlan({ categories: { mode: "replace", keys: [] } })).toMatchObject({ ok: true, categories: { mode: "replace", keys: [] } });
    expect(massEditPlan({ price: { mode: "clear" } })).toMatchObject({ ok: true, patch: { webPrice: null } });
  });

  it("หมวด: เพิ่มต่อท้าย (หมวดหลักเดิมไม่เปลี่ยน) · เอาออก · แทนทั้งชุด", () => {
    expect(applyCategoriesOp(["bag", "travel"], { mode: "add", keys: ["sale", "bag"] })).toEqual(["bag", "travel", "sale"]);
    expect(applyCategoriesOp(["bag", "travel"], { mode: "remove", keys: ["bag"] })).toEqual(["travel"]);
    expect(applyCategoriesOp(["bag"], { mode: "replace", keys: ["x", "y"] })).toEqual(["x", "y"]);
  });

  it("API กรองช่อง: ช่องนอกทะเบียน (รูป/แบนเนอร์) ทิ้ง · ชื่อ/คำอธิบายรับแค่ล้าง", () => {
    expect(sanitizeBulkPatch({ webImages: ["a.png"], webBanners: [], webName: "ชื่อเดียวกันหมด", webDescription: "", featured: true })).toEqual({ webDescription: "", featured: true });
  });
});

describe("ป้ายบนการ์ดของร้าน", () => {
  it("ยังไม่ตั้ง = ชุดตั้งต้น · ชื่อซ้ำ/ว่าง/สีผิด ทำความสะอาดให้", () => {
    expect(normalizeCardBadges(null)).toEqual(DEFAULT_CARD_BADGES);
    expect(normalizeCardBadges([{ id: "a", name: "ขายดี", color: "#ff0000" }, { id: "b", name: " ขายดี " }, { name: "" }, { id: "c", name: "ใหม่", color: "red" }])).toEqual([
      { id: "a", name: "ขายดี", color: "#FF0000" },
      { id: "c", name: "ใหม่", color: "#64748B" },
    ]);
  });
  it("เปลี่ยนชื่อป้าย (id เดิม) = รู้ว่าต้องเปลี่ยนในสินค้าจากชื่อไหนเป็นชื่อไหน · สีตามชื่อ ไม่สนตัวพิมพ์", () => {
    expect(badgeRenames([{ id: "a", name: "ขายดี", color: "#000000" }], [{ id: "a", name: "ขายดีมาก", color: "#000000" }])).toEqual([{ from: "ขายดี", to: "ขายดีมาก" }]);
    expect(badgeColorOf([{ id: "l", name: "Limited", color: "#7C3AED" }], "limited")).toBe("#7C3AED");
    expect(badgeColorOf(DEFAULT_CARD_BADGES, "พิมพ์เอง")).toBeNull();
  });
});

describe("ข้อมูลที่เชื่อม (ROAR02 จริง ณ วันทำ)", () => {
  const items: ProductDetailItem[] = [
    { id: "d1", label: "รายละเอียดสินค้า", source: "fields", fields: ["description"], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
    { id: "d2", label: "วัสดุและขนาด", source: "fields", fields: ["materials", "size_summary", "weight_g", "lining", "strap"], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
    { id: "d3", label: "จุดเด่น", source: "details", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
    { id: "d4", label: "เฉพาะหมวดเป้", source: "text", fields: [], text: "x", applyTo: "categories", categories: ["backpack"], products: [], enabled: true, defaultOpen: "auto" },
    { id: "d5", label: "การจัดส่งและชำระเงิน", source: "shipping", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" },
  ];
  const labels: Record<string, string> = { materials: "วัสดุ", size_summary: "ขนาด", weight_g: "น้ำหนัก", lining: "ซับใน", strap: "สายสะพาย", description: "คำอธิบาย" };
  const rows = buildLinkedRows({
    fieldMap: normalizeFieldMap({ name: { source: "name_th", removeBrand: true, removeCode: true }, price: { source: "sku_max" }, description: { source: "platform_description" } }),
    parent: { description: "ยาว…", materials: null, size_summary: "25.5 x 20 x 7 cm.", weight_g: 275, lining: null, strap: "" },
    code: "ROAR02",
    autoName: "ROAR 2000s กระเป๋าถือเมทัลลิก Y2K",
    listing: { web_name: null, web_price: null, web_description: null },
    auto: { price: 890, description: "x".repeat(2212) },
    imageCount: 6,
    categories: ["crossbody"],
    detailItems: items,
    detailOverrides: {},
    fieldLabel: (k) => labels[k] ?? k,
    shipping: { flat: 50, freeMin: 1500 },
  });
  const by = (l: string) => rows.find((r) => r.label === l)!;

  it("ชื่อ/ราคา/คำอธิบาย/รูป บอกแหล่ง + ค่าตอนนี้", () => {
    expect(by("ชื่อ")).toMatchObject({ status: "ok", from: expect.stringContaining("ตัดแบรนด์") });
    expect(by("ราคา")).toMatchObject({ value: "฿890", status: "ok" });
    expect(by("คำอธิบาย").value).toContain("2,212");
    expect(by("รูป")).toMatchObject({ value: "6 รูป" });
  });
  it("วัสดุและขนาด: ว่าง 3 ช่อง (วัสดุ ซับใน สาย) · จุดเด่น = ไม่มีแหล่งข้อมูล · หัวข้อเฉพาะหมวดอื่นไม่โชว์", () => {
    expect(by("วัสดุและขนาด")).toMatchObject({ value: "มี 2/5 ช่อง", status: "ok", missing: ["วัสดุ", "ซับใน", "สายสะพาย"] });
    expect(by("จุดเด่น")).toMatchObject({ status: "none" });
    expect(rows.find((r) => r.label === "เฉพาะหมวดเป้")).toBeUndefined();
    expect(by("การจัดส่งและชำระเงิน").value).toContain("฿1,500");
  });
});
