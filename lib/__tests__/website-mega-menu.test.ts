import { describe, expect, it } from "vitest";
import { cleanHref, megaHasContent, megaPreset, normalizeMegaPanel, pickMegaProducts, newMegaBlock } from "@/lib/website-mega-menu";
import { normalizeMenu } from "@/lib/website-theme";

const cats = [
  { key: "backpack", label: "กระเป๋าเป้" },
  { key: "tote", label: "กระเป๋าถือ", imageKey: "cat/tote.jpg" },
];

describe("แผงเมนูใหญ่: แม่แบบตั้งต้น", () => {
  it("A = ลิงก์ + การ์ดสินค้า + รูปเด่น · เติมหมวดของร้าน", () => {
    const p = megaPreset("A", { categories: cats });
    expect(p.layout).toBe("columns");
    expect(p.blocks.map((b) => b.kind)).toEqual(["links", "products", "feature"]);
    expect(p.blocks[0].links.map((l) => l.href)).toEqual(["/shop", "/shop?sort=new", "/c/backpack", "/c/tote"]);
    expect(megaHasContent(p)).toBe(true);
  });
  it("B = ไอคอน · กลุ่ม · จุดสี", () => {
    const p = megaPreset("B", { categories: cats });
    expect(p.blocks.map((b) => [b.kind, b.style])).toEqual([["links", "icon"], ["groups", "plain"], ["links", "dot"]]);
    expect(p.blocks[0].links[0].icon).toBe("handbag");
  });
  it("C = แท็บจากหมวด + การ์ดใช้รูปหมวด", () => {
    const p = megaPreset("C", { categories: cats });
    expect(p.layout).toBe("tabs");
    expect(p.tabs.map((t) => t.label)).toEqual(["กระเป๋าเป้", "กระเป๋าถือ"]);
    expect(p.tabs[1].cards[0].imageKey).toBe("cat/tote.jpg");
  });
});

describe("แผงเมนูใหญ่: ตัวกรองค่า", () => {
  it("ไม่มี/ผิดรูป = null", () => {
    expect(normalizeMegaPanel(null)).toBeNull();
    expect(normalizeMegaPanel([1])).toBeNull();
  });
  it("ตัดค่าแปลก · จำกัดจำนวน · ลิงก์อันตรายถูกล้าง", () => {
    const p = normalizeMegaPanel({
      template: "Z",
      blocks: [
        { kind: "links", span: 9, style: "weird", links: [{ label: "x", href: "javascript:alert(1)", icon: "nope", color: "red" }, { label: "" }] },
        { kind: "products", count: 99, perRow: 0, codes: ["A1", "A1", "bad code!"] },
        ...Array.from({ length: 10 }, () => ({ kind: "feature" })),
      ],
    })!;
    expect(p.template).toBe("A");
    expect(p.blocks).toHaveLength(6);
    expect(p.blocks[0]).toMatchObject({ span: 3, style: "plain" });
    expect(p.blocks[0].links).toHaveLength(1);
    expect(p.blocks[0].links[0]).toMatchObject({ href: "", icon: "", color: "" });
    expect(p.blocks[1]).toMatchObject({ count: 12, perRow: 1, codes: ["A1"] });
  });
  it("cleanHref", () => {
    expect(cleanHref(" /shop ")).toBe("/shop");
    expect(cleanHref("JavaScript:x")).toBe("");
    expect(cleanHref("https://a.com")).toBe("https://a.com");
  });
  it("แผงว่าง = ไม่มีเนื้อหา", () => {
    expect(megaHasContent(normalizeMegaPanel({ layout: "tabs", tabs: [{ label: "ก" }] }))).toBe(false);
    expect(megaHasContent(null)).toBe(false);
  });
  it("เมนูบนสุดเก็บแผง · เมนูย่อยไม่มีแผง", () => {
    const m = normalizeMenu({ items: [{ label: "กระเป๋า", kind: "shop", panel: { template: "C", tabs: [{ label: "ก", cards: [{ title: "x" }] }] }, children: [{ label: "ย่อย", panel: { template: "A" } }] }] });
    expect(m.items![0].panel?.layout).toBe("tabs");
    expect(m.items![0].children[0].panel).toBeNull();
    expect(normalizeMenu({ items: [{ label: "a" }] }).items![0].panel).toBeNull();
  });
});

describe("แผงเมนูใหญ่: คัดสินค้า", () => {
  const products = [
    { code: "P1", category: "tote", listedAt: "2026-01-01", salesRank: 3 },
    { code: "P2", category: "tote", listedAt: "2026-03-01", salesRank: 1 },
    { code: "P3", category: "backpack", categories: ["backpack", "tote"], listedAt: "2026-02-01", salesRank: null },
    { code: "P4", category: "backpack", listedAt: null, salesRank: 2 },
  ];
  it("อัตโนมัติ: หมวด (รวมหมวดรอง) + มาใหม่", () => {
    const b = { ...newMegaBlock("products"), category: "tote", sort: "new" as const, count: 2 };
    expect(pickMegaProducts(b, products).map((p) => p.code)).toEqual(["P2", "P3"]);
  });
  it("อัตโนมัติ: ทุกหมวด + ขายดี", () => {
    const b = { ...newMegaBlock("products"), sort: "best" as const, count: 3 };
    expect(pickMegaProducts(b, products).map((p) => p.code)).toEqual(["P2", "P4", "P1"]);
  });
  it("เลือกเอง: ตามลำดับที่เลือก · ไม่มีในร้าน = ข้าม · ไม่สนตัวพิมพ์", () => {
    const b = { ...newMegaBlock("products"), source: "pick" as const, codes: ["p4", "X9", "P1"] };
    expect(pickMegaProducts(b, products).map((p) => p.code)).toEqual(["P4", "P1"]);
  });
});
