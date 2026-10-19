import { describe, it, expect } from "vitest";
import { applyPathTranslations, carryTranslations, collectTextPaths, commonLabelEn, pickTranslations, textFingerprint } from "../content-i18n";
import { normalizeTheme, THEME_TEXT_KEYS } from "../website-theme";
import { normalizeFieldMap } from "../website-field-map";
import { normalizeWebCollections } from "../website-collections";
import { normalizeSiteInfo, publicSiteInfo, siteInfoToRows } from "../website-site-info";
import { SwatchIndex, rowToSwatchEntry } from "../color-swatch";

/**
 * 🌐 ก้อน 4 — ข้อความร้าน/เมนู/หมวด/คอลเลกชัน/ชื่อสี 2 ภาษา
 * กันบั๊กหลัก: ตัวทำความสะอาดเดิมเก็บเฉพาะช่องที่รู้จัก → `<key>_en` หายตอนบันทึก
 */
describe("carryTranslations — เก็บคำแปลทุกชั้น จับคู่ด้วย id/key", () => {
  it("ข้ามชิ้นที่ถูกกรองทิ้ง/เรียงใหม่ได้ถูกตัว", () => {
    const raw = { items: [{ id: "a", label: "ก", label_en: "A" }, { id: "x" }, { id: "b", label: "ข", label_en: "B", junk_en: "no" }] };
    const norm = { items: [{ id: "b", label: "ข" }, { id: "a", label: "ก" }] };
    carryTranslations(raw, norm, ["label"]);
    expect(norm.items).toEqual([{ id: "b", label: "ข", label_en: "B" }, { id: "a", label: "ก", label_en: "A" }]);
  });
  it("คัดเฉพาะช่องคำแปลของ object", () => {
    expect(pickTranslations({ a: 1, title_en: "T", _i18n: { title: { h: "0123abcd" } }, x_en: 5 })).toEqual({ title_en: "T", _i18n: { title: { h: "0123abcd" } } });
  });
});

describe("ธีม — เมนู/ท้ายเว็บ/แผงเมนูใหญ่ เก็บภาษาอังกฤษ", () => {
  it("normalizeTheme ไม่ทิ้ง label_en ของเมนู เมนูย่อย คอลัมน์ท้ายเว็บ และแผงเมนูใหญ่", () => {
    const t = normalizeTheme({
      menu: {
        items: [
          { id: "m1", label: "สินค้าทั้งหมด", label_en: "All products", kind: "shop", children: [{ id: "c1", label: "กระเป๋า", label_en: "Bags", kind: "shop" }] },
          { id: "m2", label: "ลด", badge: "ใหม่", badge_en: "New", kind: "shop", panel: { template: "B", layout: "columns", blocks: [{ id: "b1", kind: "links", title: "ประเภท", title_en: "Type", links: [{ id: "l1", label: "เป้", label_en: "Backpacks", href: "/c/backpack" }] }] } },
        ],
      },
      footer: { columns: [{ id: "f1", kind: "text", title: "นโยบาย", title_en: "Policies", text: "ส่งฟรี", text_en: "Free shipping" }] },
    });
    expect(t.menu.items![0]).toMatchObject({ label_en: "All products" });
    expect(t.menu.items![0].children[0]).toMatchObject({ label_en: "Bags" });
    expect(t.menu.items![1]).toMatchObject({ badge_en: "New" });
    const blk = t.menu.items![1].panel!.blocks[0] as unknown as Record<string, unknown>;
    expect(blk.title_en).toBe("Type");
    expect((blk.links as Record<string, unknown>[])[0].label_en).toBe("Backpacks");
    expect(t.footer.columns![0]).toMatchObject({ title_en: "Policies", text_en: "Free shipping" });
  });

  it("ตารางคำแปล: เก็บทุกช่อง + บอกตำแหน่ง + แปลทีเดียวหลายช่อง", () => {
    const theme = normalizeTheme({ menu: { items: [{ id: "m1", label: "สินค้าทั้งหมด", kind: "shop" }] } });
    const slots = collectTextPaths(theme, THEME_TEXT_KEYS, (f) => (f === "menu" ? "เมนู" : null)).filter((s) => s.path.includes("menu"));
    expect(slots.map((s) => s.th)).toContain("สินค้าทั้งหมด");
    const slot = slots.find((s) => s.th === "สินค้าทั้งหมด")!;
    expect(slot.where[0]).toBe("เมนู");
    const next = applyPathTranslations(theme, [{ slot, en: "All products" }]);
    expect(next.menu.items![0]).toMatchObject({ label_en: "All products", _i18n: { label: { h: textFingerprint("สินค้าทั้งหมด"), ai: true } } });
    expect((theme.menu.items![0] as unknown as Record<string, unknown>).label_en).toBeUndefined(); // ของเดิมไม่ถูกแตะ
  });
});

describe("หมวด / คอลเลกชัน / ตัวเลือก / หน่วย", () => {
  it("normalizeFieldMap เก็บภาษาอังกฤษของหมวด หัวข้อตัวเลือก และหน่วย", () => {
    const m = normalizeFieldMap({
      categories: [{ key: "bag", label: "กระเป๋า", label_en: "Bags", blurb: "หนังแท้", blurb_en: "Genuine leather" }],
      options: { source: "sku_color", label: "สี", label_en: "Colour" },
      unit: { default: "ใบ", default_en: "pc" },
    });
    expect(m.categories[0]).toMatchObject({ label_en: "Bags", blurb_en: "Genuine leather" });
    expect(m.options).toMatchObject({ label_en: "Colour" });
    expect(m.unit).toMatchObject({ default_en: "pc" });
  });
  it("คอลเลกชันเก็บชื่อ/เรื่องราวภาษาอังกฤษ", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(normalizeWebCollections([{ id, slug: "rise", title: "ไรส์", title_en: "Rise", story: "เรื่อง", story_en: "Story" }])[0]).toMatchObject({ title_en: "Rise", story_en: "Story" });
  });
  it("คำมาตรฐาน: หน่วย/ชื่อชุดตัวเลือก", () => {
    expect(commonLabelEn("ใบ")).toBe("pc");
    expect(commonLabelEn(" สี ")).toBe("Colour");
    expect(commonLabelEn("อะไรไม่รู้")).toBe("");
  });
});

describe("ชื่อสีภาษาอังกฤษจากทะเบียนสีกลาง", () => {
  const idx = new SwatchIndex(
    [
      ["กรมท่า", "Navy"],
      ["ขาว", "White"],
      ["ครีม", "Cream"],
    ].map(([th, en]) => rowToSwatchEntry({ th, en, swatch_kind: null, swatch_colors: null, swatch_image_key: null })),
  );
  it("สีเดียว + วงเล็บท้าย", () => {
    expect(idx.english("กรมท่า")).toBe("Navy");
    expect(idx.english("กรมท่า (02)")).toBe("Navy (02)");
  });
  it("สีผสมแปลทีละคำ คงตัวคั่นเดิม · มีคำที่ไม่รู้จัก = ไม่แปล (ใช้ไทย)", () => {
    expect(idx.english("กรมท่า-ครีม-ขาว")).toBe("Navy-Cream-White");
    expect(idx.english("กรมท่า-ส้ม")).toBe("");
  });
  it("ชื่อที่เป็นอังกฤษอยู่แล้ว = ไม่ต้องแปล", () => {
    expect(idx.english("Classic Leopard")).toBe("");
  });
});

describe("ข้อมูลร้าน (store_settings) 2 ภาษา", () => {
  it("อ่าน/เขียน/ส่งออก ช่องอังกฤษ + สถานะการแปล", () => {
    const meta = { site_tagline: { h: textFingerprint("กระเป๋าดี"), ai: true } };
    const info = normalizeSiteInfo([
      { key: "site_tagline", value: "กระเป๋าดี" },
      { key: "site_tagline_en", value: "Good bags" },
      { key: "order_prefix_en", value: "ไม่ควรเก็บ" },
      { key: "_i18n", value: JSON.stringify(meta) },
    ]);
    expect(info.site_tagline_en).toBe("Good bags");
    expect((info as unknown as Record<string, unknown>).order_prefix_en).toBeUndefined();
    expect(info._i18n).toEqual(meta);

    const rows = siteInfoToRows("shop-1", info);
    expect(rows.find((r) => r.key === "site_tagline_en")?.value).toBe("Good bags");
    expect(rows.find((r) => r.key === "footer_note_en")?.value).toBe(""); // เขียนว่างด้วย = ลบคำแปลได้
    expect(JSON.parse(rows.find((r) => r.key === "_i18n")!.value)).toEqual(meta);

    const pub = publicSiteInfo(info) as unknown as Record<string, unknown>;
    expect(pub.site_tagline_en).toBe("Good bags");
    expect(pub._i18n).toBeUndefined();
  });
});

/** 🌐 ข้อความตะกร้า/หน้ารายการที่เพิ่มทีหลัง — ภาษาอังกฤษต้องไม่หายตอนบันทึก + ตารางคำแปลเห็น (เดิมหาย: ปุ่มเลือกซื้อต่อ ฯลฯ) */
describe("ธีม: ข้อความตะกร้าที่เพิ่มทีหลังมีภาษาอังกฤษได้", () => {
  const raw = {
    cart: {
      continueText: "เลือกซื้อต่อ", continueText_en: "Continue shopping",
      emptyButton: "ไปเลือกสินค้า", emptyButton_en: "Shop now",
      labels: { gift: "ห่อเป็นของขวัญ", gift_en: "Gift wrap", card: "เขียนการ์ด", card_en: "Add a card", note: "ฝากถึงร้าน", note_en: "Note" },
    },
    listing: { header: { eyebrow: "คอลเลกชันใหม่", eyebrow_en: "New collection" } },
  };
  it("normalizeTheme เก็บ _en ไว้", () => {
    const t = normalizeTheme(raw) as unknown as Record<string, Record<string, unknown>>;
    expect(t.cart.continueText_en).toBe("Continue shopping");
    expect(t.cart.emptyButton_en).toBe("Shop now");
    expect((t.cart.labels as Record<string, unknown>).gift_en).toBe("Gift wrap");
    expect((t.cart.labels as Record<string, unknown>).card_en).toBe("Add a card");
    expect(((t.listing.header ?? {}) as Record<string, unknown>).eyebrow_en).toBe("New collection");
  });
  it("ตารางคำแปลเห็นช่องเหล่านี้", () => {
    const paths = collectTextPaths(normalizeTheme(raw), THEME_TEXT_KEYS).map((s) => [...s.path, s.key].join("."));
    for (const p of ["cart.continueText", "cart.emptyButton", "cart.labels.gift", "cart.labels.card", "cart.labels.note", "listing.header.eyebrow"]) expect(paths).toContain(p);
  });
});
