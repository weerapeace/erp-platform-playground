import { describe, expect, it } from "vitest";
import { copyTextFromHtml, usableBrand, sourceFromLazadaView, sourceFromLazadaSlim, sourceFromLineRaw, sourceFromShopeeRaw, type CopySource } from "@/lib/listing-copy-source";
import { planCopy, applyCopyChoices, copiedLabel, copyHash, priceFills, sellableWithPrices, defaultCopyChoices, type CopySystem, type CopyDraft } from "@/lib/listing-copy-map";
import type { LazadaListingView } from "@/lib/lazada-listing-edit";

const meta = { listingId: "L1", platformCode: "lazada", platformName: "Lazada", externalId: "5746781340", title: "ชื่อในระบบ" };

// IG-PROP001 จริง (2026-11-10): Lazada 299/199 · ในระบบไม่มีราคาเต็ม · น้ำหนัก 0
const lazView: LazadaListingView = {
  itemId: "5746781340", name: "IG International พร็อพถาดกระจกสะท้อน IG-PROP001", brand: "No Brand", categoryId: "10100451",
  description: "<div><p>ถาดกระจก<img src=\"https://x.slatic.net/a.jpg\"/> สไตล์วินเทจ</p><p>ขนาด&nbsp;30 ซม.</p></div>",
  shortDescription: "<ul><li>กระจกแท้</li><li>ขอบทอง</li></ul>",
  images: ["https://x.slatic.net/1.jpg", "https://x.slatic.net/2.jpg"], status: "Active", subStatus: null, rejectReasons: [],
  skus: [
    { skuId: "1", sellerSku: "IG-PROP001-01", label: "สี: สีทอง", price: 299, specialPrice: 199, specialFrom: null, specialTo: null, quantity: 5, available: 5, status: "active", images: [], weight: 0.8, length: 30, width: 30, height: 3, url: null },
    { skuId: "2", sellerSku: "IG-PROP001-04", label: "สี: สีทอง (47×22.5×2)", price: 329, specialPrice: 229, specialFrom: null, specialTo: null, quantity: 5, available: 5, status: "active", images: [], weight: 0.8, length: null, width: null, height: null, url: null },
    { skuId: "3", sellerSku: "IG-PROP001-99", label: "สี: เงิน", price: 100, specialPrice: null, specialFrom: null, specialTo: null, quantity: 0, available: 0, status: "active", images: [], weight: null, length: null, width: null, height: null, url: null },
  ],
} as unknown as LazadaListingView;

const sys = (over: Partial<CopySystem> = {}): CopySystem => ({
  name: "IG International พร็อพถาดกระจกสะท้อน IG-PROP001 (ระบบ)", altNames: [], description: "รายละเอียดในระบบ", altDescriptions: [],
  brand: "IG International", weightKg: 0, imageCount: 5, categoryLabel: "90 · บ้านและสวน > ของตกแต่งบ้าน",
  skus: [
    { id: "s1", code: "IG-PROP001-01", fake: 0, sale: 199, active: true },
    { id: "s4", code: "IG-PROP001-04", fake: null, sale: 229, active: true },
    { id: "s5", code: "IG-PROP001-05", fake: null, sale: 249, active: true },
  ],
  ...over,
});
const emptyDraft: CopyDraft = { title: null, description: null, categoryPath: null, extra: {} };

describe("copyTextFromHtml", () => {
  it("เอารูป/แท็กออก · ย่อหน้าคั่นบรรทัดว่าง · รายการเป็น •", () => {
    expect(copyTextFromHtml("<ul><li>ก</li><li>ข</li></ul><p>ย่อหน้า&nbsp;1</p><p>ย่อหน้า 2<img src='x'></p>")).toBe("• ก\n• ข\n\nย่อหน้า 1\n\nย่อหน้า 2");
  });
  it("ข้อความธรรมดาคงเดิม (ไม่ยุบบรรทัด)", () => {
    expect(copyTextFromHtml("บรรทัด 1\nบรรทัด 2\n\n\n\nบรรทัด 3")).toBe("บรรทัด 1\nบรรทัด 2\n\nบรรทัด 3");
  });
  it("สคริปต์/สไตล์ไม่หลุดมา · ถอดรหัสตัวอักษร", () => {
    expect(copyTextFromHtml("<style>.a{}</style><p>A &amp; B &#3585;</p><script>x()</script>")).toBe("A & B ก");
  });
  it("ว่าง = ข้อความว่าง", () => { expect(copyTextFromHtml(null)).toBe(""); expect(copyTextFromHtml("<p></p>")).toBe(""); });
});

describe("usableBrand", () => {
  it("No Brand / ว่าง = null", () => {
    expect(usableBrand("No Brand")).toBeNull(); expect(usableBrand("nobrand")).toBeNull(); expect(usableBrand(" ")).toBeNull();
    expect(usableBrand("IG International")).toBe("IG International");
  });
});

describe("แปลงร้านต้นทาง", () => {
  it("Lazada สด: ราคาลด → เต็ม/จ่าย · ไม่มีราคาลด → จ่ายอย่างเดียว · จุดเด่นอยู่บนสุด · No Brand = null", () => {
    const src = sourceFromLazadaView(lazView, meta);
    expect(src.variants[0]).toMatchObject({ sku: "IG-PROP001-01", full: 299, sale: 199, weightKg: 0.8 });
    expect(src.variants[2]).toMatchObject({ full: null, sale: 100 });
    expect(src.descriptionText).toBe("• กระจกแท้\n• ขอบทอง\n\nถาดกระจก สไตล์วินเทจ\n\nขนาด 30 ซม.");
    expect(src.brand).toBeNull();
    expect(src.images).toHaveLength(2);
    expect(src.weightKg).toBe(0.8);
    expect(src.live).toBe(true);
  });
  it("Lazada สำเนาย่อ (ดึงสดไม่ได้): ชื่อ + ราคา · ไม่มีรูป + เตือน", () => {
    const src = sourceFromLazadaSlim({ lazada: { brand: "No Brand", skus: [{ seller_sku: "A-01", price: "90", special_price: "79", label: "สี: ดำ" }] } }, meta, "ดึงสดไม่ได้");
    expect(src.variants[0]).toMatchObject({ sku: "A-01", full: 90, sale: 79, label: "สี: ดำ" });
    expect(src.images).toEqual([]); expect(src.live).toBe(false); expect(src.warning).toBe("ดึงสดไม่ได้");
  });
  it("LINE: ราคาเต็ม + ราคาที่จ่าย · ชื่อตัวเลือกจาก options", () => {
    const src = sourceFromLineRaw({ line: { name: "เข็มขัด", description: "<p>หนังแท้</p>", brand: "Louis Montini", imageUrls: ["u1", "u1", "u2"], category: { id: 57, nameTh: "เครื่องประดับ" },
      variants: [{ sku: "MGN190-01S", price: 1490, discountedPrice: 890, weight: 0.15, options: [{ name: "สี", value: "น้ำตาล" }, { name: "ไซส์", value: "S" }] }] } }, { ...meta, platformCode: "line_shopping", platformName: "LINE SHOPPING" });
    expect(src.variants[0]).toMatchObject({ sku: "MGN190-01S", full: 1490, sale: 890, label: "สี: น้ำตาล · ไซส์: S", weightKg: 0.15 });
    expect(src.images).toEqual(["u1", "u2"]); expect(src.categoryLabel).toBe("57 · เครื่องประดับ"); expect(src.descriptionText).toBe("หนังแท้");
  });
  it("Shopee ไฟล์: ชื่อ + รายละเอียดเท่านั้น", () => {
    const src = sourceFromShopeeRaw({ basic_info: { et_title_product_name: "แท่นวางโฟม", et_title_product_description: "บรรทัด1\nบรรทัด2" } }, { ...meta, platformCode: "shopee", platformName: "Shopee" });
    expect(src).toMatchObject({ title: "แท่นวางโฟม", descriptionText: "บรรทัด1\nบรรทัด2", images: [], variants: [] });
    expect(src.warning).toBeTruthy();
  });
});

describe("planCopy — ค่าเริ่ม + ราคา", () => {
  const src = sourceFromLazadaView(lazView, meta);
  it("ร่างว่าง: ใช้ของร้านต้นทางทุกช่องที่ร้านมี · แบรนด์ (No Brand) = ในระบบ", () => {
    const p = planCopy({ target: "line_shopping", source: src, system: sys(), draft: emptyDraft });
    const ch = Object.fromEntries(p.fields.map((f) => [f.key, f.choice]));
    expect(ch).toEqual({ title: "source", description: "source", images: "source", brand: "system", weight: "source" });
    expect(p.applied).toBe(false);
    expect(p.missing).toEqual([]);
    expect(p.category.label).toContain("90");
  });
  it("ราคา: ในระบบไม่มีราคาเต็ม → เติมจาก Lazada · ราคาขายตรงกัน = ไม่ขัด · ตัวเลือกที่ไม่มีในระบบ/ไม่มีบนร้าน แยกบอก", () => {
    const p = planCopy({ target: "line_shopping", source: src, system: sys(), draft: emptyDraft });
    expect(p.prices.map((x) => [x.code, x.fill])).toEqual([["IG-PROP001-01", { fake_price: 299 }], ["IG-PROP001-04", { fake_price: 329 }]]);
    expect(p.priceFillCount).toBe(2); expect(p.priceConflictCount).toBe(0);
    expect(p.variants).toMatchObject({ matched: 2, source: 3, system: 3, sourceOnly: ["IG-PROP001-99"], systemOnly: ["IG-PROP001-05"] });
    expect(priceFills(p)).toHaveLength(2);
    expect(priceFills(p, ["s4"])).toEqual([{ sku_id: "s4", code: "IG-PROP001-04", field: "fake_price", price: 329 }]);
  });
  it("ราคาไม่ตรงกัน = ขัด (ไม่เติม)", () => {
    const p = planCopy({ target: "line_shopping", source: src, system: sys({ skus: [{ id: "s1", code: "ig-prop001-01", fake: 350, sale: 199, active: true }] }), draft: emptyDraft });
    expect(p.prices[0]).toMatchObject({ conflict: true, fill: {} });
  });
  it("ร่างที่คนแก้ไว้ = คงไว้เป็นค่าเริ่ม", () => {
    const d: CopyDraft = { ...emptyDraft, title: "ชื่อที่แก้เองสำหรับ LINE" };
    const p = planCopy({ target: "line_shopping", source: src, system: sys(), draft: d });
    const t = p.fields.find((f) => f.key === "title")!;
    expect(t.choice).toBe("keep"); expect(t.choices).toEqual(["source", "system", "keep"]); expect(t.draft).toBe("ชื่อที่แก้เองสำหรับ LINE");
  });
  it("ร้านต้นทางไม่มีรูป + ในระบบไม่มีรูป = ขาด (แดง)", () => {
    const shopee = sourceFromShopeeRaw({ basic_info: { et_title_product_name: "X" } }, { ...meta, platformCode: "shopee", platformName: "Shopee" });
    const p = planCopy({ target: "line_shopping", source: shopee, system: sys({ imageCount: 0, categoryLabel: null }), draft: emptyDraft });
    expect(p.missing).toEqual(["รูปสินค้า", "หมวด LINE"]);
    expect(p.fields.find((f) => f.key === "images")!.choices).toEqual(["system"]);
  });
});

describe("applyCopyChoices + ป้าย 'มาจาก'", () => {
  const src = sourceFromLazadaView(lazView, meta);
  it("ค่าเริ่ม: เขียนชื่อ/รายละเอียด/รูป/น้ำหนักจากร้าน + จำลายนิ้วมือ · แบรนด์ = ในระบบ", () => {
    const r = applyCopyChoices({ target: "line_shopping", source: src, system: sys(), draft: { ...emptyDraft, extra: { gift_status: "on" } }, by: "a@b", now: "2026-11-10T00:00:00Z" });
    expect(r.title).toBe(src.title);
    expect(r.description).toBe(src.descriptionText);
    expect(r.extra.line_images).toEqual(src.images);
    expect(r.extra.weight).toBe(0.8);
    expect(r.extra.brand).toBe("IG International");
    expect(r.extra.gift_status).toBe("on");   // ฟิลด์อื่นของร่างไม่หาย
    expect(copiedLabel(r.extra, "title", r.title)).toBe("จากร้าน Lazada (#5746781340)");
    expect(copiedLabel(r.extra, "title", "แก้แล้ว")).toBeNull();
    expect(copiedLabel(r.extra, "brand", r.extra.brand)).toBeNull();
    expect(copiedLabel(r.extra, "images", r.extra.line_images)).toContain("Lazada");
  });
  it("เลือก 'ข้อมูลในระบบ' = ชื่อ/รายละเอียดในระบบลงร่าง (ไม่เว้นว่าง — ตัวตรวจอ่านจากร่าง) · รูป/น้ำหนัก = ล้าง ให้ตัวสร้างใช้ของในระบบ", () => {
    const d: CopyDraft = { title: "x", description: "y", categoryPath: null, extra: { line_images: ["a"], weight: 1 } };
    const r = applyCopyChoices({ target: "line_shopping", source: src, system: sys(), draft: d, choices: { title: "system", description: "system", images: "system", weight: "system" } });
    expect(r.title).toBe(sys().name); expect(r.description).toBe("รายละเอียดในระบบ");
    expect("line_images" in r.extra).toBe(false); expect("weight" in r.extra).toBe(false);
    const p = planCopy({ target: "line_shopping", source: src, system: sys(), draft: { ...d, title: r.title ?? null, description: r.description ?? null, extra: r.extra } });
    expect(p.fields.find((f) => f.key === "title")!.choice).toBe("system");
    expect(p.fields.find((f) => f.key === "description")!.choice).toBe("system");
  });
  it("เลือกแหล่งที่ไม่มีค่า = ใช้ค่าเริ่มแทน", () => {
    const r = applyCopyChoices({ target: "line_shopping", source: src, system: sys(), draft: emptyDraft, choices: { brand: "source" } });
    expect(r.used.brand).toBe("system");
  });
  it("คัดลอกแล้วเปิดใหม่ = เห็นสถานะเดิมของร่าง (applied)", () => {
    const r = applyCopyChoices({ target: "line_shopping", source: src, system: sys(), draft: emptyDraft, choices: { title: "system" } });
    const d: CopyDraft = { title: r.title ?? null, description: r.description ?? null, categoryPath: null, extra: r.extra };
    const p = planCopy({ target: "line_shopping", source: src, system: sys(), draft: d });
    expect(p.applied).toBe(true);
    expect(p.fields.find((f) => f.key === "title")!.choice).toBe("system");
    expect(p.fields.find((f) => f.key === "images")!.choice).toBe("source");
    expect(defaultCopyChoices("line_shopping", src, sys(), d).title).toBe("source");
  });
});

describe("ของช่วย", () => {
  it("copyHash ไม่สนช่องว่างซ้ำ", () => { expect(copyHash("a  b")).toBe(copyHash("a b")); expect(copyHash(["a", "b"])).not.toBe(copyHash(["b", "a"])); });
  it("sellableWithPrices: ตัวขายไม่มีราคา → ใช้ของตัวสี · ไม่นับตัวสี/ตัวปิด", () => {
    const r = sellableWithPrices([
      { id: "m", code: "WK42-01", fake: 690, sale: 430, active: true },
      { id: "d", code: "WK42-01D", fake: null, sale: null, active: true },
      { id: "x", code: "WK42-02D", fake: null, sale: 100, active: false },
    ]);
    expect(r.map((x) => [x.code, x.effFake, x.effSale])).toEqual([["WK42-01D", 690, 430]]);
  });
  it("ร้านต้นทางว่างทั้งหมด (CopySource ขั้นต่ำ) ไม่พัง", () => {
    const bare: CopySource = { listingId: "L", platformCode: "shopee", platformName: "Shopee", externalId: null, title: "", descriptionText: "", images: [], brand: null, categoryLabel: null, weightKg: null, variants: [], live: false, warning: null };
    const p = planCopy({ target: "line_shopping", source: bare, system: sys({ name: "" }), draft: emptyDraft });
    expect(p.missing).toContain("ชื่อสินค้า");
  });
});
