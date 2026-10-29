import { describe, expect, it } from "vitest";
import { cleanHref, cloneMegaBlock, DEFAULT_MENU_BEHAVIOR, inShowWindow, megaBlockLinks, megaHasContent, megaIsSep, megaLinkIssue, megaPreset, megaSplitColumns, newMegaBlock, newMegaLink, newMegaRow, normalizeMegaPanel, normalizeMenuBehavior, pickMegaProducts } from "@/lib/website-mega-menu";
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
    // "มาใหม่" → หน้า /new (ชุดมาใหม่ · 2026-10-17) แทน /shop?sort=new
    expect(p.blocks[0].links.map((l) => l.href)).toEqual(["/shop", "/new", "/c/backpack", "/c/tote"]);
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

describe("แผงเมนูใหญ่ รอบ 2", () => {
  it("ตั้งเวลาแสดง (เวลาไทย · วันสิ้นสุดถึงสิ้นวัน)", () => {
    const at = (s: string) => Date.parse(s);
    expect(inShowWindow("", "", at("2026-01-01T00:00:00Z"))).toBe(true);
    expect(inShowWindow("2026-10-20", "", at("2026-10-19T16:59:00Z"))).toBe(false); // 23:59 ไทย วันที่ 19
    expect(inShowWindow("2026-10-20", "", at("2026-10-19T17:00:00Z"))).toBe(true); // 00:00 ไทย วันที่ 20
    expect(inShowWindow("", "2026-10-31", at("2026-10-31T16:59:00Z"))).toBe(true); // 23:59 ไทย
    expect(inShowWindow("", "2026-10-31", at("2026-10-31T17:01:00Z"))).toBe(false);
    expect(inShowWindow("2026-10-20T09:30", "", at("2026-10-20T02:31:00Z"))).toBe(true);
  });
  it("รายการอัตโนมัติ: ที่ใส่เองก่อน + หมวด/คอลเลกชัน/สี · จำกัดจำนวน · ซ่อนลิงก์หมดเวลา", () => {
    const data = { categories: [{ key: "tote", label: "ถือ", imageKey: "c/t.jpg", count: 3 }, { key: "bp", label: "เป้" }], collections: [{ slug: "rise", label: "Rise", imageKey: "k.jpg" }], tones: [{ key: "red", name: "แดง", hex: "#f00" }] };
    const manual = [{ ...newMegaLink("ดูทั้งหมด", "/shop") }, { ...newMegaLink("โปรหมด", "/x"), showUntil: "2020-01-01" }];
    const cats = megaBlockLinks({ links: manual, auto: "categories", autoMax: 1 }, data);
    expect(cats.map((l) => l.label)).toEqual(["ดูทั้งหมด", "ถือ"]);
    expect(cats[1]).toMatchObject({ href: "/c/tote", hoverImageKey: "c/t.jpg", count: 3, id: "a-c-tote" });
    expect(megaBlockLinks({ links: [], auto: "collections", autoMax: 9 }, data)[0].href).toBe("/collection/rise");
    expect(megaBlockLinks({ links: [], auto: "colors", autoMax: 9 }, data)[0]).toMatchObject({ href: "/shop?tone=red", color: "#f00" });
    expect(megaBlockLinks({ links: [], auto: "colors", autoMax: 9 }, null)).toEqual([]);
  });
  it("การ์ดสินค้า: เฉพาะลด · ลดมากสุด · ราคา · สุ่มคงที่ทั้งวัน", () => {
    const ps = [
      { code: "A", price: 100, comparePrice: 200 },
      { code: "B", price: 300, comparePrice: null },
      { code: "C", price: 90, comparePrice: 100 },
    ];
    const base = { ...newMegaBlock("products"), count: 5 };
    expect(pickMegaProducts({ ...base, onSale: true }, ps).map((p) => p.code)).toEqual(["A", "C"]);
    expect(pickMegaProducts({ ...base, sort: "discount" }, ps).map((p) => p.code)).toEqual(["A", "C", "B"]);
    expect(pickMegaProducts({ ...base, sort: "price-asc" }, ps).map((p) => p.code)).toEqual(["C", "A", "B"]);
    expect(pickMegaProducts({ ...base, sort: "price-desc" }, ps).map((p) => p.code)).toEqual(["B", "A", "C"]);
    const day = Date.parse("2026-10-16T05:00:00Z");
    const r1 = pickMegaProducts({ ...base, id: "b1", sort: "random" }, ps, day).map((p) => p.code);
    const r2 = pickMegaProducts({ ...base, id: "b1", sort: "random" }, ps, day + 3600e3).map((p) => p.code);
    expect(r1).toEqual(r2);
  });
  it("ตรวจลิงก์เสีย", () => {
    const sets = { categories: new Set(["tote"]), products: new Set(["bbp03"]), pages: new Set(["about-us"]), collections: new Set(["rise"]) };
    expect(megaLinkIssue("/c/tote", sets)).toBeNull();
    expect(megaLinkIssue("/c/gone", sets)).toBe("หมวดนี้ไม่มีแล้ว");
    expect(megaLinkIssue("/product/BBP03", sets)).toBeNull();
    expect(megaLinkIssue("/product/zz", sets)).toBe("สินค้านี้ไม่ได้อยู่บนเว็บแล้ว");
    expect(megaLinkIssue("/collection/old", sets)).toBe("คอลเลกชันนี้ไม่มีแล้ว");
    expect(megaLinkIssue("/about-us", sets)).toBeNull();
    expect(megaLinkIssue("/shop", sets)).toBeNull();
    expect(megaLinkIssue("/old-page", sets)).toBe("หน้านี้ไม่มีแล้ว");
    expect(megaLinkIssue("https://x.com", sets)).toBeNull();
  });
  it("ทำซ้ำคอลัมน์ = id ใหม่ทั้งหมด", () => {
    const b = { ...newMegaBlock("links"), links: [newMegaLink("a")] };
    const c = cloneMegaBlock(b);
    expect(c.id).not.toBe(b.id);
    expect(c.links[0].id).not.toBe(b.links[0].id);
    expect(c.links[0].label).toBe("a");
  });
  it("พฤติกรรมเมนู: ค่าแปลก = ค่าเริ่มต้น · เมนูเก่าไม่มี behavior", () => {
    expect(normalizeMenuBehavior({ open: "click", delay: 150, dim: true, mobileStyle: "drill" })).toMatchObject({ open: "click", delay: 150, dim: true, mobileStyle: "drill", mobileCats: false });
    expect(normalizeMenuBehavior({ delay: 999, open: "x" })).toEqual(DEFAULT_MENU_BEHAVIOR);
    expect(normalizeMenu({ items: [] }).behavior).toEqual(DEFAULT_MENU_BEHAVIOR);
  });
  it("📂 กางเมนูย่อยไว้เลย (มือถือ/ลิ้นชัก): เดิม = กดเอง · ค่าแปลก = กดเอง", () => {
    expect(DEFAULT_MENU_BEHAVIOR.mobileOpen).toBe("none");
    expect(normalizeMenuBehavior({ mobileOpen: "all" }).mobileOpen).toBe("all");
    expect(normalizeMenuBehavior({ mobileOpen: "first" }).mobileOpen).toBe("first");
    expect(normalizeMenuBehavior({ mobileOpen: "everything" }).mobileOpen).toBe("none");
  });
  it("✨ ลิงก์/หัวข้อ: เอฟเฟกต์ · ฟอนต์ · ลูกศร · เส้นใต้ — เดิม = ไม่มี · ค่าแปลก = ไม่มี", () => {
    const l = newMegaLink("All Products", "/shop");
    expect([l.effect, l.font, l.arrow, l.underline]).toEqual(["", "", "", false]);
    const panel = normalizeMegaPanel({
      layout: "columns",
      blocks: [
        {
          kind: "links",
          links: [
            { label: "SALE", href: "/shop", effect: "shake", font: "Parisienne", arrow: "up-right", underline: true },
            { label: "หัวข้อ", kind: "heading", effect: "explode", font: "Comic Sans", arrow: "left", underline: "yes" },
          ],
        },
      ],
    });
    const [a, b] = panel!.blocks[0].links;
    expect([a.effect, a.font, a.arrow, a.underline]).toEqual(["shake", "Parisienne", "up-right", true]);
    expect([b.effect, b.font, b.arrow, b.underline]).toEqual(["", "", "", false]);
  });
});

describe("แผงเมนูใหญ่: เลือกคอลัมน์ย่อยรายลิงก์ (2026-10-22)", () => {
  const L = (label: string, col = 0) => ({ ...newMegaLink(label, "/shop"), col });
  it("ค่าเริ่ม = อัตโนมัติ · ค่าเพี้ยนถูกตัด 0–3", () => {
    expect(newMegaLink("a").col).toBe(0);
    const p = normalizeMegaPanel({ blocks: [{ kind: "links", cols: 2, links: [{ label: "a", col: 2 }, { label: "b", col: 9 }, { label: "c", col: "x" }] }] })!;
    expect(p.blocks[0].links.map((l) => l.col)).toEqual([2, 3, 0]);
  });
  it("ไม่มีใครเลือก = null (แบบเดิม) · ไม่แบ่ง = null", () => {
    expect(megaSplitColumns([L("a"), L("b")], 2)).toBeNull();
    expect(megaSplitColumns([L("a", 1)], 1)).toBeNull();
  });
  it("ลิงก์ที่เลือก = คอลัมน์นั้น · อัตโนมัติ = ลงคอลัมน์ที่สั้นกว่า · เรียงตามลำดับเดิม · เกินจำนวนคอลัมน์ = คอลัมน์สุดท้าย", () => {
    const cols = megaSplitColumns([L("ดูทั้งหมด", 1), L("มาใหม่", 1), L("HANDBAGS"), L("BAG CHARMS"), L("ITA BAGS", 2), L("WALLETS", 3)], 2)!;
    expect(cols.map((c) => c.map((l) => l.label))).toEqual([["ดูทั้งหมด", "มาใหม่", "HANDBAGS"], ["BAG CHARMS", "ITA BAGS", "WALLETS"]]);
    const bal = megaSplitColumns([L("a", 1), L("b"), L("c"), L("d")], 2)!;
    expect(bal.map((c) => c.map((l) => l.label))).toEqual([["a", "c"], ["b", "d"]]);
  });
});

describe("เมนู: ตัวคั่น · ซ่อนเมนู · ☰ จอคอม (2026-10-29)", () => {
  const panelWith = (links: unknown[]) => normalizeMegaPanel({ template: "A", layout: "columns", blocks: [{ kind: "links", links, cols: 2 }] });
  it("เส้นคั่น/เว้นบรรทัด เก็บได้แม้ไม่มีชื่อ/ลิงก์ · หัวข้อไม่เก็บลิงก์ · ข้อมูลเก่าไม่มี kind = ลิงก์", () => {
    const p = panelWith([
      { kind: "heading", label: "NEW ARRIVAL", href: "/shop", bold: true, col: 2 },
      { label: "กระเป๋าเป้", href: "/c/backpack" },
      { kind: "divider", label: "x", href: "/shop", col: 1 },
      { kind: "space" },
      { kind: "heading", label: "" },
      { kind: "อะไรก็ไม่รู้", label: "ลิงก์", href: "/shop" },
    ])!;
    const links = p.blocks[0].links;
    expect(links.map((l) => l.kind)).toEqual(["heading", "link", "divider", "space", "link"]);
    expect(links[0]).toMatchObject({ label: "NEW ARRIVAL", href: "", bold: true, col: 2 });
    expect(links[2]).toMatchObject({ label: "", href: "", col: 1 });
  });
  it("newMegaRow: หัวข้อตั้งต้นตัวหนา · ตัวคั่นไม่มีชื่อ · แผงที่มีแต่ตัวคั่น = ยังไม่มีเนื้อหา", () => {
    expect(newMegaRow("heading")).toMatchObject({ kind: "heading", label: "หัวข้อ", bold: true, href: "" });
    expect(newMegaRow("divider")).toMatchObject({ kind: "divider", label: "", href: "" });
    expect(megaIsSep({ kind: "space" })).toBe(true);
    expect(megaIsSep({})).toBe(false);
    expect(megaHasContent(panelWith([{ kind: "divider" }, { kind: "space" }]))).toBe(false);
    expect(megaHasContent(panelWith([{ kind: "divider" }, { kind: "heading", label: "SALE" }]))).toBe(true);
  });
  it("ตัวคั่นลงคอลัมน์ที่เลือกได้เหมือนลิงก์", () => {
    const links = panelWith([
      { label: "A", href: "/shop", col: 1 },
      { kind: "divider", col: 1 },
      { label: "B", href: "/shop", col: 2 },
    ])!.blocks[0].links;
    expect(megaSplitColumns(links, 2)?.map((c) => c.map((l) => l.kind))).toEqual([["link", "divider"], ["link"]]);
  });
  it("☰ จอคอม: ค่าเริ่ม = คำเมนูเดิม · ค่าแปลก = เดิม · คำข้างปุ่มตัดที่ 20 ตัว", () => {
    expect(DEFAULT_MENU_BEHAVIOR).toMatchObject({ desktopStyle: "links", burgerLabel: "" });
    expect(normalizeMenuBehavior({ desktopStyle: "burger-text", burgerLabel: "  MENU MENU MENU MENU MENU " })).toMatchObject({ desktopStyle: "burger-text", burgerLabel: "MENU MENU MENU MENU" });
    expect(normalizeMenuBehavior({ desktopStyle: "x" }).desktopStyle).toBe("links");
  });
  it("เมนู: สวิตช์ปิด (hidden) เก็บไว้ใน ERP · 📌 ติดหัวเว็บ เฉพาะเมนูบนสุด", () => {
    const m = normalizeMenu({ items: [{ label: "All Products", kind: "shop", pin: true, hidden: true, children: [{ label: "ย่อย", kind: "shop", pin: true }] }, { label: "Shop all", kind: "shop" }] });
    expect(m.items?.[0]).toMatchObject({ hidden: true, pin: true });
    expect(m.items?.[0].children[0]).toMatchObject({ hidden: false, pin: false });
    expect(m.items?.[1]).toMatchObject({ hidden: false, pin: false });
  });
});
