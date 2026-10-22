import { describe, expect, it } from "vitest";
import { renameCategoryRefs, renameKeyInFieldMap, renameKeyInList, renameProblem, rewriteCategoryLinks, withCategoryRedirect } from "@/lib/website-category-rename";

const CATS = [{ key: "bags" }, { key: "accessories" }, { key: "card-holders" }, { key: "card-holder" }];

describe("renameProblem", () => {
  it("รหัสใหม่ใช้ได้", () => expect(renameProblem(CATS, "accessories", "Wallets")).toBeNull());
  it("ซ้ำหมวดอื่น / เหมือนเดิม / ว่าง / ไม่พบหมวด", () => {
    expect(renameProblem(CATS, "card-holder", "card-holders")).toMatch(/มีหมวดอื่น/);
    expect(renameProblem(CATS, "bags", "bags")).toMatch(/เหมือนเดิม/);
    expect(renameProblem(CATS, "bags", "ไทย")).toMatch(/ตั้งรหัสใหม่/);
    expect(renameProblem(CATS, "nope", "x")).toMatch(/ไม่พบ/);
  });
});

describe("rewriteCategoryLinks", () => {
  const r = (s: string) => rewriteCategoryLinks(s, "accessories", "wallets");
  it("ลิงก์หมวด + /en + ?also + /shop?cat", () => {
    expect(r("/c/accessories")).toEqual({ value: "/c/wallets", hits: 1 });
    expect(r("/en/c/accessories?sort=new").value).toBe("/en/c/wallets?sort=new");
    expect(r("/c/bags?also=accessories")).toEqual({ value: "/c/bags?also=wallets", hits: 1 });
    expect(r("/c/accessories?also=accessories").value).toBe("/c/wallets?also=wallets");
    expect(r("/shop?cat=accessories").value).toBe("/shop?cat=wallets");
    expect(r('<a href="/c/accessories">ดู</a>').value).toBe('<a href="/c/wallets">ดู</a>');
  });
  it("ไม่แตะรหัสที่ขึ้นต้นเหมือนกัน / ลิงก์เว็บอื่น / ข้อความธรรมดา", () => {
    expect(r("/c/accessories-keychains").hits).toBe(0);
    expect(r("https://other.com/c/accessories").hits).toBe(0);
    expect(r("ชุด accessories ใหม่").hits).toBe(0);
    expect(rewriteCategoryLinks("/c/card-holders", "card-holder", "x").hits).toBe(0);
  });
});

describe("renameKeyInList", () => {
  it("แทน + ไม่ซ้ำ + null คงเดิม", () => {
    expect(renameKeyInList(["bags", "accessories"], "accessories", "wallets")).toEqual(["bags", "wallets"]);
    expect(renameKeyInList(["wallets", "accessories"], "accessories", "wallets")).toEqual(["wallets"]);
    expect(renameKeyInList(null, "accessories", "wallets")).toBeNull();
  });
});

describe("renameCategoryRefs", () => {
  it("เมนู · Section หมวด · ตารางสินค้า · mega · โปร", () => {
    const theme = {
      menu: { items: [{ kind: "category", value: "accessories", also: "accessories", href: "" }, { kind: "page", value: "accessories" }, { kind: "url", value: "/c/accessories" }] },
      blocks: [
        { type: "categories", cats: ["card-holders", "accessories"], catImg: { accessories: "a.jpg", bags: "b.jpg" }, catName: { accessories: { th: "กระเป๋าสตางค์" } } },
        { type: "products", source: "category", category: "accessories", tabCats: ["accessories"] },
        { panel: { blocks: [{ kind: "links", links: [{ label: "W", href: "/c/accessories" }] }] } },
      ],
      scope: { mode: "categories", categories: ["accessories"] },
    };
    const { value, hits } = renameCategoryRefs(theme, "accessories", "wallets");
    expect(value.menu.items[0]).toMatchObject({ value: "wallets", also: "wallets" });
    expect(value.menu.items[1].value).toBe("accessories"); // หน้าเว็บชื่อเดียวกัน ไม่ใช่หมวด
    expect(value.menu.items[2].value).toBe("/c/wallets");
    expect(value.blocks[0]).toMatchObject({ cats: ["card-holders", "wallets"], catImg: { wallets: "a.jpg", bags: "b.jpg" }, catName: { wallets: { th: "กระเป๋าสตางค์" } } });
    expect(value.blocks[1]).toMatchObject({ category: "wallets", tabCats: ["wallets"] });
    expect(value.blocks[2].panel?.blocks[0].links[0].href).toBe("/c/wallets");
    expect(value.scope.categories).toEqual(["wallets"]);
    expect(hits).toBe(10);
  });
  it("ไม่มีอะไรให้แก้ = ก้อนเดิม hits 0", () => {
    const x = { a: [{ category: "bags" }] };
    const r = renameCategoryRefs(x, "accessories", "wallets");
    expect(r.hits).toBe(0);
    expect(r.value).toBe(x);
  });
  it("รูปแทนรายหมวด: รหัสใหม่มีอยู่แล้ว = คงของใหม่", () => {
    const r = renameCategoryRefs({ catImg: { accessories: "old.jpg", wallets: "new.jpg" } }, "accessories", "wallets");
    expect(r.value.catImg).toEqual({ wallets: "new.jpg" });
  });
});

describe("renameKeyInFieldMap", () => {
  it("รหัส · แม่ · กฎ ERP/แท็ก · หมวดตั้งต้น · ช่องอื่นคงเดิม", () => {
    const raw = {
      name: { source: "name_th" },
      categories: [
        { key: "accessories", label: "WALLETS" },
        { key: "accessories-mini", label: "Mini", parent: "accessories" },
      ],
      category: { default: "accessories", rules: { "Bag Accessories": "accessories", กระเป๋า: "bags" }, tagRules: { t1: "accessories" } },
    };
    const out = renameKeyInFieldMap(raw, [], "accessories", "wallets");
    expect(out.name).toEqual({ source: "name_th" });
    expect(out.categories).toEqual([
      { key: "wallets", label: "WALLETS" },
      { key: "accessories-mini", label: "Mini", parent: "wallets" },
    ]);
    expect(out.category).toEqual({ default: "wallets", rules: { "Bag Accessories": "wallets", กระเป๋า: "bags" }, tagRules: { t1: "wallets" } });
  });
  it("ร้านที่ยังไม่เคยตั้งหมวด (ใช้ชุดตั้งต้น) → เขียนชุดที่เปลี่ยนแล้วลงไป", () => {
    const out = renameKeyInFieldMap({}, [{ key: "hardware" }, { key: "tools" }], "tools", "my-tools");
    expect(out.categories).toEqual([{ key: "hardware" }, { key: "my-tools" }]);
  });
});

describe("withCategoryRedirect", () => {
  it("เพิ่มบรรทัดใหม่ขึ้นก่อน + ไม่ต่อทอด", () => {
    const out = withCategoryRedirect("/old-wallets -> /c/accessories\n/blog/x -> /blog/y", "accessories", "wallets");
    expect(out.split("\n")).toEqual(["/c/accessories -> /c/wallets", "/old-wallets -> /c/wallets", "/blog/x -> /blog/y"]);
  });
  it("สลับรหัส: ลบบรรทัดที่ย้ายรหัสใหม่ออกไป (ตอนนี้เป็นหมวดจริง)", () => {
    const step1 = withCategoryRedirect("", "card-holders", "ita-bags");
    expect(step1).toBe("/c/card-holders -> /c/ita-bags");
    const step2 = withCategoryRedirect(step1, "card-holder", "card-holders");
    expect(step2.split("\n")).toEqual(["/c/card-holder -> /c/card-holders"]);
  });
});
