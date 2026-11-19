import { describe, expect, it } from "vitest";
import {
  activeCats, catNameMatches, checklistText, shopCategoryChecklist, stepEffect, suggestForCategory, unassignedProducts, undoOf, validateCatName,
  type ShopCat, type ShopCatItem, type ShopCatProduct, type StepEffect,
} from "@/lib/shop-category-plan";

const cat = (id: string, name: string, sort: number, over: Partial<ShopCat> = {}): ShopCat => ({ id, name, sort_order: sort, central_category_id: null, on_shop: false, shop_name: null, shop_sort: null, deleted_at: null, ...over });
const item = (cid: string, pid: string, over: Partial<ShopCatItem> = {}): ShopCatItem => ({ category_id: cid, parent_sku_id: pid, sort_order: 0, in_plan: true, on_shop: false, ...over });
const prod = (id: string, over: Partial<ShopCatProduct> = {}): ShopCatProduct => ({ id, code: id.toUpperCase(), name: id, cover: null, central_id: null, central_name: null, listed: true, first_seen: null, ...over });
const code = (id: string) => id.toUpperCase();
/** ใช้ผลติ๊ก/ยกเลิกติ๊กกับข้อมูล (จำลองฝั่ง API) */
const apply = (e: StepEffect, cats: ShopCat[], items: ShopCatItem[]) => ({
  cats: cats.map((c) => ({ ...c, ...(e.cats.find((x) => x.id === c.id)?.patch ?? {}) })),
  items: items.map((i) => ({ ...i, ...(e.items.find((x) => x.category_id === i.category_id && x.parent_sku_id === i.parent_sku_id)?.patch ?? {}) })),
});

describe("validateCatName", () => {
  const cats = [cat("a", "ขายดี", 0), cat("b", "ของขวัญ", 1, { deleted_at: "2026-11-19" })];
  it("ว่าง / ยาวเกิน / ซ้ำ (ไม่สนตัวพิมพ์ · ไม่นับหมวดในถังขยะ · ไม่นับตัวเอง)", () => {
    expect(validateCatName("  ", cats)).toBe("ใส่ชื่อหมวดก่อน");
    expect(validateCatName("ก".repeat(61), cats)).toMatch(/ยาวเกิน/);
    expect(validateCatName(" ขายดี ", cats)).toMatch(/มีหมวด/);
    expect(validateCatName("ขายดี", cats, "a")).toBeNull();
    expect(validateCatName("ของขวัญ", cats)).toBeNull();
  });
});

describe("เช็กลิสต์ = ส่วนต่างระหว่างแผนกับที่ติ๊กว่าทำแล้ว", () => {
  it("หมวดใหม่ = สร้าง + ใส่สินค้าในข้อเดียว (มีรหัสให้คัดลอก)", () => {
    const steps = shopCategoryChecklist([cat("a", "ขายดี", 0)], [item("a", "p1"), item("a", "p2", { sort_order: 1 })], code);
    expect(steps).toEqual([{ key: "create:a", kind: "create", categoryId: "a", title: "สร้างหมวด “ขายดี” แล้วใส่ 2 สินค้า", codes: ["P1", "P2"] }]);
  });
  it("หมวดที่ทำแล้ว: เปลี่ยนชื่อ / ใส่เพิ่ม / เอาออก / ลบ / เรียงใหม่", () => {
    const cats = [
      cat("a", "ขายดีมาก", 0, { on_shop: true, shop_name: "ขายดี", shop_sort: 1 }),
      cat("b", "กระเป๋า", 1, { on_shop: true, shop_name: "กระเป๋า", shop_sort: 0 }),
      cat("c", "เลิกขาย", 2, { on_shop: true, shop_name: "เลิกขาย", shop_sort: 2, deleted_at: "2026-11-19" }),
    ];
    const items = [item("b", "p1", { on_shop: true }), item("b", "p2"), item("b", "p3", { in_plan: false, on_shop: true })];
    const steps = shopCategoryChecklist(cats, items, code);
    expect(steps.map((s) => s.key)).toEqual(["rename:a", "add:b", "remove:b", "delete:c", "reorder"]);
    expect(steps.find((s) => s.key === "add:b")!.codes).toEqual(["P2"]);
    expect(steps.find((s) => s.key === "remove:b")!.codes).toEqual(["P3"]);
    expect(steps.find((s) => s.key === "reorder")!.title).toBe("เรียงหมวดใหม่: ขายดีมาก › กระเป๋า");
  });
  it("ตรงกับแผนแล้ว = ไม่มีข้อ · หมวดในถังขยะที่ไม่เคยขึ้นร้าน = ไม่ต้องทำอะไร", () => {
    const cats = [cat("a", "ขายดี", 0, { on_shop: true, shop_name: "ขายดี", shop_sort: 0 }), cat("z", "ร่าง", 1, { deleted_at: "x" })];
    expect(shopCategoryChecklist(cats, [item("a", "p1", { on_shop: true })], code)).toEqual([]);
    expect(checklistText([], "Lazada IG")).toMatch(/ตรงกับแผนแล้ว/);
  });
});

describe("ติ๊กว่าทำแล้ว + ยกเลิกติ๊ก", () => {
  it("ติ๊กครบทุกข้อ → เช็กลิสต์ว่าง · ยกเลิกติ๊ก → กลับมาเหมือนเดิม", () => {
    let cats = [cat("a", "ขายดี", 0), cat("b", "กระเป๋า", 1, { on_shop: true, shop_name: "กระเป๋าเก่า", shop_sort: 0 })];
    let items = [item("a", "p1"), item("b", "p2")];
    const before = { cats, items };
    const undos: StepEffect[] = [];
    for (const s of shopCategoryChecklist(cats, items, code)) {
      const eff = stepEffect(s.key, cats, items)!;
      expect(eff).not.toBeNull();
      undos.unshift(undoOf(eff, cats, items));
      ({ cats, items } = apply(eff, cats, items));
    }
    expect(shopCategoryChecklist(cats, items, code)).toEqual([]);
    expect(cats.find((c) => c.id === "a")).toMatchObject({ on_shop: true, shop_name: "ขายดี", shop_sort: 0 });
    for (const u of undos) ({ cats, items } = apply(u, cats, items));
    expect(cats).toEqual(before.cats);
    expect(items).toEqual(before.items);
  });
  it("ข้อที่ไม่มีแล้ว (แผนเปลี่ยนไปแล้ว) = null", () => {
    expect(stepEffect("create:a", [cat("a", "x", 0, { on_shop: true, shop_name: "x" })], [])).toBeNull();
    expect(stepEffect("delete:a", [cat("a", "x", 0)], [])).toBeNull();
    expect(stepEffect("nope", [], [])).toBeNull();
  });
  it("ลบหมวดในหลังร้านแล้ว = สินค้าในหมวดนั้นไม่อยู่บนร้านด้วย", () => {
    const cats = [cat("c", "เลิก", 0, { on_shop: true, shop_name: "เลิก", deleted_at: "x" })];
    const eff = stepEffect("delete:c", cats, [item("c", "p1", { on_shop: true })])!;
    expect(eff.items).toEqual([{ category_id: "c", parent_sku_id: "p1", patch: { on_shop: false } }]);
  });
});

describe("แนะนำสินค้า + ยังไม่อยู่หมวดไหน", () => {
  const products = [
    prod("p1", { central_id: "c-belt", central_name: "เข็มขัด Belts" }),
    prod("p2", { central_id: "c-bag", central_name: "กระเป๋าถือ Handbags", first_seen: "2026-11-15T00:00:00Z" }),
    prod("p3", { listed: false, central_id: "c-belt", central_name: "เข็มขัด Belts" }),
  ];
  it("ชื่อหมวดตรงหมวดกลาง (ตัดอังกฤษ) · ผูกหมวดกลางไว้ = ใช้ที่ผูก · ไม่แนะนำตัวที่ไม่มีบนร้าน", () => {
    expect(catNameMatches("เข็มขัดหนัง", "เข็มขัด Belts")).toBe(true);
    expect(catNameMatches("ขายดี", "เข็มขัด Belts")).toBe(false);
    const cats = [cat("a", "เข็มขัดหนัง", 0)];
    expect(suggestForCategory(cats[0], products, cats, []).map((s) => s.product.id)).toEqual(["p1"]);
    const linked = cat("b", "อะไรก็ได้", 0, { central_category_id: "c-bag" });
    expect(suggestForCategory(linked, products, [linked], []).map((s) => s.product.id)).toEqual(["p2"]);
  });
  it("หมวด “สินค้าใหม่” = ลงร้านใน 14 วัน · ข้ามตัวที่อยู่หมวดนี้แล้ว", () => {
    const c = cat("n", "สินค้าใหม่", 0);
    expect(suggestForCategory(c, products, [c], [], new Date("2026-11-19T00:00:00Z")).map((s) => s.product.id)).toEqual(["p2"]);
    expect(suggestForCategory(c, products, [c], [item("n", "p2")], new Date("2026-11-19T00:00:00Z"))).toEqual([]);
  });
  it("ยังไม่อยู่หมวดไหน = มีบนร้าน และไม่อยู่ในแผนของหมวดที่ยังไม่ลบ", () => {
    const cats = [cat("a", "x", 0), cat("d", "ลบแล้ว", 1, { deleted_at: "x" })];
    const items = [item("a", "p1"), item("d", "p2"), item("a", "p3", { in_plan: false })];
    expect(unassignedProducts(products, cats, items).map((p) => p.id)).toEqual(["p2"]);
    expect(activeCats(cats).map((c) => c.id)).toEqual(["a"]);
  });
});
