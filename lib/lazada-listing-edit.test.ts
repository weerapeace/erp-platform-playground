import { describe, it, expect } from "vitest";
import {
  lazadaListingView, lazImageList, lazDateText, lazSkuLabel, lazStatusBadge,
  highlightsToLines, linesToHighlights, lazadaEditStateFromView, planLazadaEdit, foreignDescImages,
  lazUpdateProductXml, lazDeactivateXml, planLazadaDisplay, lazViewAfterWrite, lazRawAfterStatus,
  lazadaPriceRowsFromView, planLazadaPrices, lazPriceQuantityXml, applyLazadaBulkPrice, lazSaleDateText,
} from "./lazada-listing-edit";

// รูปแบบตามคู่มือ /product/item/get (open.lazada.com · สำรวจ 2026-11-10)
const item = {
  item_id: 16196625125, primary_category: 12211, status: "Active", subStatus: "",
  images: "[\"https://th-live.slatic.net/p/a.jpg\",\"https://th-live.slatic.net/p/b.jpg\"]",
  variation: { Variation1: { name: "color_family", label: "Color Family", has_image: true } },
  attributes: { name: "เข็มขัดหนัง IG-EQ011", brand: "No Brand", description: "<p>หนังแท้</p>", short_description: "<ul><li>ยาว 120 ซม.</li></ul>" },
  skus: [
    { SkuId: 127317001489, SellerSku: "IG-EQ011-01", price: 328, special_price: 159, special_from_time: "2026-11-01 00:00:00", special_to_time: "2026-11-30 23:59:59",
      quantity: 3, Available: 3, Status: "active", saleProp: { color_family: "Black" }, Images: ["https://th-live.slatic.net/p/s1.jpg", "", "", "", "", "", "", ""],
      package_weight: "0.3", package_length: "30", package_width: "10", package_height: "5", Url: "https://www.lazada.co.th/products/i16196625125-s127317001489.html" },
    { SkuId: 127317001490, SellerSku: "IG-EQ011-02", price: 328, special_price: 400, quantity: 0, Status: "inactive", saleProp: { color_family: "Brown" } },
    { SkuId: 127317001491, SellerSku: "IG-EQ011-03", price: 328 },
  ],
};

describe("lazadaListingView", () => {
  const v = lazadaListingView(item)!;
  it("ข้อมูลหลัก: ชื่อ/แบรนด์/หมวด/รายละเอียด/จุดเด่น/รูป (รูปเป็นข้อความ JSON ก็อ่านได้)", () => {
    expect(v).toMatchObject({ itemId: "16196625125", name: "เข็มขัดหนัง IG-EQ011", brand: "No Brand", categoryId: "12211", status: "Active" });
    expect(v.description).toBe("<p>หนังแท้</p>");
    expect(v.shortDescription).toContain("<li>");
    expect(v.images).toEqual(["https://th-live.slatic.net/p/a.jpg", "https://th-live.slatic.net/p/b.jpg"]);
  });
  it("ตัวเลือก: ชื่อจาก saleProp · ราคาลด+ช่วงวัน · กล่อง · รูปตัดช่องว่าง", () => {
    expect(v.skus[0]).toMatchObject({
      skuId: "127317001489", sellerSku: "IG-EQ011-01", label: "สี: Black", price: 328, specialPrice: 159,
      specialFrom: "2026-11-01 00:00", specialTo: "2026-11-30 23:59", available: 3, status: "active",
      images: ["https://th-live.slatic.net/p/s1.jpg"], weight: 0.3, length: 30, width: 10, height: 5,
    });
  });
  it("ราคาลดสูงกว่าราคาปกติ = ไม่นับเป็นราคาลด · ไม่มี saleProp = ใช้รหัส", () => {
    expect(v.skus[1].specialPrice).toBeNull();
    expect(v.skus[1].status).toBe("inactive");
    expect(v.skus[2].label).toBe("IG-EQ011-03");
  });
  it("ไม่มี item_id = null", () => expect(lazadaListingView({ attributes: { name: "x" } })).toBeNull());
  it("เหตุผลที่ถูกปัดตก (array ของ object) → ข้อความ", () => {
    const r = lazadaListingView({ ...item, status: "Suspended", rejectReason: [{ violationDetail: "No White Background", suggestion: "ใช้พื้นขาว" }] })!;
    expect(r.rejectReasons).toEqual(["No White Background — ใช้พื้นขาว"]);
  });
});

describe("ตัวช่วย", () => {
  it("lazImageList: array / ข้อความ JSON / ลิงก์เดี่ยว / ไม่ใช่ลิงก์", () => {
    expect(lazImageList(["https://x/1.jpg", "", null])).toEqual(["https://x/1.jpg"]);
    expect(lazImageList("https://x/2.jpg")).toEqual(["https://x/2.jpg"]);
    expect(lazImageList("[bad json")).toEqual([]);
    expect(lazImageList(["javascript:alert(1)"])).toEqual([]);
  });
  it("lazDateText: ข้อความ → 16 ตัวแรก · มิลลิวินาที → เวลาไทย", () => {
    expect(lazDateText("2026-11-01 00:00:00")).toBe("2026-11-01 00:00");
    expect(lazDateText(String(Date.UTC(2026, 10, 1, 17, 0)))).toBe("2026-11-02 00:00");
    expect(lazDateText("")).toBeNull();
  });
  it("lazSkuLabel: ชั้นที่รู้จักแปลไทย · ชั้นอื่นใช้ป้ายจาก variation · หลายชั้นคั่นด้วย ·", () => {
    expect(lazSkuLabel({ saleProp: { color_family: "Black", size: "M" } })).toBe("สี: Black · ไซซ์: M");
    expect(lazSkuLabel({ saleProp: { buckle_type: "Pin" } }, { Variation2: { name: "buckle_type", label: "Buckle Type" } })).toBe("Buckle Type: Pin");
    expect(lazSkuLabel({ SellerSku: "X" })).toBeNull();
  });
  it("lazStatusBadge: สถานะ Lazada → ภาษาคน", () => {
    expect(lazStatusBadge("Active").tone).toBe("ok");
    expect(lazStatusBadge("InActive").label).toBe("ปิดขาย");
    expect(lazStatusBadge("Pending QC").tone).toBe("wait");
    expect(lazStatusBadge("suspended").tone).toBe("bad");
    expect(lazStatusBadge(null).tone).toBe("none");
  });
});

describe("เฟส 2: จุดเด่น (บรรทัดละข้อ ↔ <ul><li>)", () => {
  it("HTML → บรรทัด · ตัด tag/รูป · แปลง &amp;", () => {
    expect(highlightsToLines("<ul><li>ยาว <b>120</b> ซม.</li><li>หนัง &amp; ผ้า</li><li> </li></ul>")).toBe("ยาว 120 ซม.\nหนัง & ผ้า");
    expect(highlightsToLines("<p>ข้อ 1</p><p>ข้อ 2</p>")).toBe("ข้อ 1\nข้อ 2");
    expect(highlightsToLines("")).toBe("");
  });
  it("บรรทัด → <ul><li> (escape < >)", () => {
    expect(linesToHighlights("ข้อ 1\n\n a<b \n")).toBe("<ul><li>ข้อ 1</li><li>a&lt;b</li></ul>");
    expect(linesToHighlights("  ")).toBe("");
  });
});

describe("เฟส 2: planLazadaEdit", () => {
  const base = lazadaEditStateFromView(lazadaListingView(item)!);
  it("ไม่แก้อะไร = ไม่ส่ง (จุดเด่นจาก HTML เดิมเทียบแล้วเท่ากัน)", () => {
    const p = planLazadaEdit(base, { ...base });
    expect(p.changes).toEqual([]);
    expect(p.fields).toEqual({});
    expect(p.warnings).toEqual([]);
  });
  it("แก้ชื่อ → ส่งเฉพาะชื่อ (ตัดช่องว่างซ้ำ) + เตือนอาจตรวจใหม่", () => {
    const p = planLazadaEdit(base, { ...base, name: "  เข็มขัดหนัง   รุ่นใหม่ " });
    expect(p.fields).toEqual({ name: "เข็มขัดหนัง รุ่นใหม่" });
    expect(p.changes[0]).toMatchObject({ label: "ชื่อ", after: "เข็มขัดหนัง รุ่นใหม่" });
    expect(p.warnings.some((w) => w.includes("ตรวจใหม่"))).toBe(true);
  });
  it("ชื่อว่าง / ยาวเกิน 255 = ไม่ผ่าน", () => {
    expect(planLazadaEdit(base, { ...base, name: " " }).errors[0]).toContain("ห้ามว่าง");
    expect(planLazadaEdit(base, { ...base, name: "ก".repeat(256) }).errors[0]).toContain("255");
  });
  it("รายละเอียด: รูปจากที่อื่น = ไม่ผ่าน · รูป Lazada ผ่าน · รูปลด/ตารางหาย = เตือน", () => {
    const withImgs = { ...base, description: "<p>a</p><img src=\"https://th-live.slatic.net/p/1.jpg\"><img src=\"https://img.lazcdn.com/2.jpg\"><table><tr><td>x</td></tr></table>" };
    expect(planLazadaEdit(base, withImgs).errors).toEqual([]);
    expect(planLazadaEdit(base, { ...base, description: "<p>a</p><img src=\"https://erp.example.com/r2/x.jpg\">" }).errors[0]).toContain("รูปจากที่อื่น 1 รูป");
    const p = planLazadaEdit(withImgs, { ...withImgs, description: "<p>a</p><img src=\"https://th-live.slatic.net/p/1.jpg\">" });
    expect(p.errors).toEqual([]);
    expect(p.warnings.join(" ")).toContain("รูปในรายละเอียดลดลง 2 → 1");
    expect(p.warnings.join(" ")).toContain("ตารางในรายละเอียดหายไป 1");
  });
  it("รายละเอียดเปลี่ยนแค่รูปแบบ HTML (ข้อความเท่าเดิม) = เตือน", () => {
    const p = planLazadaEdit(base, { ...base, description: "<p>หนังแท้ </p>" });
    expect(p.fields.description).toBe("<p>หนังแท้ </p>");
    expect(p.warnings.join(" ")).toContain("เปลี่ยนแค่รูปแบบ");
  });
  it("รายละเอียดว่าง = ไม่ผ่าน · มีแต่รูปก็ได้", () => {
    expect(planLazadaEdit(base, { ...base, description: "<p> </p>" }).errors[0]).toContain("ห้ามว่าง");
    expect(planLazadaEdit(base, { ...base, description: "<img src=\"https://th-live.slatic.net/a.jpg\">" }).errors).toEqual([]);
  });
  it("จุดเด่น: แก้ → ส่งเป็น <ul><li> · ล้างหมด = ไม่ผ่าน", () => {
    const p = planLazadaEdit(base, { ...base, highlights: "ยาว 120 ซม.\nหนังแท้ 100%" });
    expect(p.fields.shortDescription).toBe("<ul><li>ยาว 120 ซม.</li><li>หนังแท้ 100%</li></ul>");
    expect(planLazadaEdit(base, { ...base, highlights: "" }).errors[0]).toContain("อย่างน้อย 1 ข้อ");
  });
  it("foreignDescImages: ลิงก์สัมพัทธ์/โดเมนอื่น = ภายนอก", () => {
    expect(foreignDescImages("<img src='/x.jpg'><img src=\"https://lzd-img-global.slatic.net/a.png\">")).toEqual(["/x.jpg"]);
  });
});

describe("เฟส 2: XML", () => {
  const skus = [
    { skuId: "1", sellerSku: "A-01", status: "active" },
    { skuId: "2", sellerSku: "A&B", status: "inactive" },
  ];
  it("update: ส่งทุก SKU ตามลำดับ + สถานะเดิมทุกตัว (กันตัวที่ปิดอยู่เปิดเอง) · escape · HTML ใน CDATA", () => {
    const x = lazUpdateProductXml("99", skus, { name: "ชื่อ <ใหม่>", description: "<p>x]]>y</p>" });
    expect(x).toContain("<ItemId>99</ItemId>");
    expect(x).toContain("<name>ชื่อ &lt;ใหม่&gt;</name>");
    expect(x).toContain("<description><![CDATA[<p>x]]]]><![CDATA[>y</p>]]></description>");
    expect(x.indexOf("<SkuId>1</SkuId>")).toBeLessThan(x.indexOf("<SkuId>2</SkuId>"));
    expect(x).toContain("<SkuId>1</SkuId><SellerSku>A-01</SellerSku><Status>active</Status>");
    expect(x).toContain("<SkuId>2</SkuId><SellerSku>A&amp;B</SellerSku><Status>inactive</Status>");
    expect(x).not.toContain("short_description");
  });
  it("update เปิดขาย: เปลี่ยนเฉพาะตัวที่สั่ง · Attributes ว่างได้", () => {
    const x = lazUpdateProductXml("99", skus, {}, new Map([["2", "active"]]));
    expect(x).toContain("<Attributes></Attributes>");
    expect(x).toContain("<SkuId>2</SkuId><SellerSku>A&amp;B</SellerSku><Status>active</Status>");
  });
  it("deactivate: ทั้งสินค้า / ระบุ SKU", () => {
    expect(lazDeactivateXml("99")).toBe("<Request><Product><ItemId>99</ItemId></Product></Request>");
    expect(lazDeactivateXml("99", ["1", "2"])).toBe("<Request><Product><ItemId>99</ItemId><Skus><SkuId>1</SkuId><SkuId>2</SkuId></Skus></Product></Request>");
  });
});

describe("เฟส 2: planLazadaDisplay", () => {
  const v = lazadaListingView(item)!;   // SKU 1 active · 2 inactive · 3 ไม่มีสถานะ (= active)
  it("ปิดทั้งสินค้า → deactivate ระดับสินค้า · นับเฉพาะตัวที่ยังเปิด", () => {
    const p = planLazadaDisplay(v, { open: false });
    expect(p).toMatchObject({ api: "deactivate", wholeItem: true });
    expect(p.targets.map((s) => s.skuId)).toEqual(["127317001489", "127317001491"]);
  });
  it("เปิดทั้งสินค้า → update เฉพาะตัวที่ปิดอยู่", () => {
    const p = planLazadaDisplay(v, { open: true });
    expect(p.api).toBe("update");
    expect([...p.statusOverride]).toEqual([["127317001490", "active"]]);
    expect(p.summary).toBe("เปิดขาย 1 ตัวเลือก");
  });
  it("ปิดทีละตัว → deactivate ระบุ SKU · ตัวที่ปิดอยู่แล้ว = ไม่ต้องทำ", () => {
    expect(planLazadaDisplay(v, { open: false, skuIds: ["127317001489"] })).toMatchObject({ api: "deactivate", wholeItem: false });
    expect(planLazadaDisplay(v, { open: false, skuIds: ["127317001490"] }).api).toBe("none");
  });
  it("SKU ที่ไม่มีบนร้าน = ไม่ผ่าน", () => {
    const p = planLazadaDisplay(v, { open: true, skuIds: ["nope"] });
    expect(p.api).toBe("none");
    expect(p.errors[0]).toContain("nope");
  });
});

describe("ส่งสำเร็จแต่ดึงกลับไม่ได้ (เจอจริง 2026-11-10 LB-01 ปิด→เปิด)", () => {
  const v = lazadaListingView(item)!;
  it("lazViewAfterWrite: สถานะตามที่สั่ง + สถานะสินค้า · ชื่อ/จุดเด่นตามที่ส่ง", () => {
    const closed = lazViewAfterWrite(v, { statusOverride: new Map([["127317001489", "inactive"], ["127317001491", "inactive"]]) });
    expect(closed.skus.map((s) => s.status)).toEqual(["inactive", "inactive", "inactive"]);
    expect(closed.status).toBe("InActive");
    const opened = lazViewAfterWrite(closed, { statusOverride: new Map([["127317001490", "active"]]) });
    expect(opened.status).toBe("Active");
    const edited = lazViewAfterWrite(v, { fields: { name: "ใหม่", shortDescription: "<ul><li>a</li></ul>" } });
    expect(edited).toMatchObject({ name: "ใหม่", shortDescription: "<ul><li>a</li></ul>", description: v.description, status: v.status });
  });
  it("lazRawAfterStatus: แก้สถานะ SKU ใน raw.lazada + สถานะสินค้า", () => {
    const raw = { item_id: "1", status: "InActive", skus: [{ sku_id: "23194862631", seller_sku: "LB-01", status: "inactive", price: 36 }] };
    const r = lazRawAfterStatus(raw, new Map([["23194862631", "active"]]));
    expect(r.status).toBe("active");
    expect(r.lazada).toMatchObject({ status: "Active", skus: [{ sku_id: "23194862631", status: "active", price: 36 }] });
  });
});

describe("เฟส 3: ราคา", () => {
  const v = lazadaListingView(item)!;   // SKU1 328/ลด 159 (1–30 พ.ย.) · SKU2 328 · SKU3 328
  const base = lazadaPriceRowsFromView(v);
  const T = "2026-11-10";
  const set = (i: number, patch: Partial<(typeof base)[number]>) => base.map((r, k) => (k === i ? { ...r, ...patch } : r));
  it("แปลงจากมุมมอง: วันที่ราคาลดเป็น YYYY-MM-DD + เก็บค่าเต็มเดิม", () => {
    expect(base[0]).toMatchObject({ price: 328, special: 159, from: "2026-11-01", to: "2026-11-30", toRaw: "2026-11-30 23:59" });
    expect(base[1].special).toBeNull();
  });
  it("ไม่แก้ = ไม่ส่ง", () => expect(planLazadaPrices(base, base, T)).toMatchObject({ skus: [], changes: [], errors: [] }));
  it("แก้ราคาปกติตัวเดียว → ส่งแค่ Price ตัวนั้น", () => {
    const p = planLazadaPrices(base, set(1, { price: 350 }), T);
    expect(p.errors).toEqual([]);
    expect(p.skus).toEqual([{ skuId: "127317001490", sellerSku: "IG-EQ011-02", price: 350 }]);
  });
  it("ราคาขยับ ≥80% = ไม่ผ่าน · ≥50% = เตือน", () => {
    expect(planLazadaPrices(base, set(1, { price: 60 }), T).errors[0]).toContain("80%");
    const w = planLazadaPrices(base, set(1, { price: 500 }), T);
    expect(w.errors).toEqual([]);
    expect(w.warnings[0]).toContain("52%");
  });
  it("ราคาลด: ต้องต่ำกว่าราคาปกติ · ลดเกิน 80% ไม่ผ่าน · วันจบผ่านแล้วไม่ผ่าน", () => {
    expect(planLazadaPrices(base, set(1, { special: 400, from: "2026-11-11", to: "2026-11-20" }), T).errors[0]).toContain("ต่ำกว่าราคาปกติ");
    expect(planLazadaPrices(base, set(1, { special: 50, from: "2026-11-11", to: "2026-11-20" }), T).errors[0]).toContain("ลด 85%");
    expect(planLazadaPrices(base, set(1, { special: 290, from: "2026-11-01", to: "2026-11-05" }), T).errors[0]).toContain("ผ่านไปแล้ว");
  });
  it("ราคาลดใหม่ → SalePrice + วันเริ่ม 00:00:00 / จบ 23:59:59", () => {
    const p = planLazadaPrices(base, set(1, { special: 290, from: "2026-11-12", to: "2026-11-30" }), T);
    expect(p.skus[0]).toEqual({ skuId: "127317001490", sellerSku: "IG-EQ011-02", price: 328, salePrice: 290, saleStart: "2026-11-12 00:00", saleEnd: "2026-11-30 23:59" });
  });
  it("แก้ราคาลดแต่วันเดิม → ใช้เวลาเดิมจาก Lazada", () => {
    const p = planLazadaPrices(base, set(0, { special: 169 }), T);
    expect(p.skus[0]).toMatchObject({ price: 328, salePrice: 169, saleStart: "2026-11-01 00:00", saleEnd: "2026-11-30 23:59" });
  });
  it("ล้างราคาลด = ยังไม่รองรับ · ราคาปกติใหม่ต่ำกว่าราคาลดเดิม = ไม่ผ่าน", () => {
    expect(planLazadaPrices(base, set(0, { special: null }), T).errors[0]).toContain("ล้างราคาลด");
    expect(planLazadaPrices(base, set(0, { price: 150 }), T).errors[0]).toContain("ต่ำกว่า/เท่าราคาลดเดิม");
    expect(planLazadaPrices(base, set(0, { price: 60 }), T).errors[0]).toContain("80%");
    expect(planLazadaPrices(base, set(0, { price: 159 }), T).errors.join(" ")).toMatch(/ต่ำกว่า\/เท่าราคาลดเดิม|80%/);
  });
  it("lazSaleDateText", () => {
    expect(lazSaleDateText("2026-11-30", "to", "2026-11-30 23:59")).toBe("2026-11-30 23:59");
    expect(lazSaleDateText("2026-12-01", "to", "2026-11-30 23:59")).toBe("2026-12-01 23:59");
    expect(lazSaleDateText("2026-12-01", "from")).toBe("2026-12-01 00:00");
  });
  it("XML: ไม่มี Quantity · ส่งเฉพาะช่องที่เปลี่ยน", () => {
    const x = lazPriceQuantityXml("99", [{ skuId: "1", sellerSku: "A", price: 350 }, { skuId: "2", sellerSku: "B&C", salePrice: 290, saleStart: "2026-11-12 00:00:00", saleEnd: "2026-11-30 23:59:59" }]);
    expect(x).not.toContain("Quantity");
    expect(x).toContain("<Sku><ItemId>99</ItemId><SkuId>1</SkuId><SellerSku>A</SellerSku><Price>350</Price></Sku>");
    expect(x).toContain("<SellerSku>B&amp;C</SellerSku><SalePrice>290</SalePrice><SaleStartDate>2026-11-12 00:00:00</SaleStartDate><SaleEndDate>2026-11-30 23:59:59</SaleEndDate>");
  });
  it("แก้หลายตัวพร้อมกัน: ราคา / ลด % / ช่วงวัน · ติ๊กบางตัว", () => {
    const r = applyLazadaBulkPrice(base, null, { price: 350, pct: 10, from: "2026-11-12", to: "2026-11-30" });
    expect(r.changed).toBe(3);
    expect(r.rows[1]).toMatchObject({ price: 350, special: 315, from: "2026-11-12", to: "2026-11-30" });
    const one = applyLazadaBulkPrice(base, new Set(["127317001491"]), { special: 300, from: "2026-11-12", to: "2026-11-30" });
    expect(one.changed).toBe(1);
    expect(applyLazadaBulkPrice(base, null, {}).error).toBeTruthy();
  });
  it("lazViewAfterWrite: ราคาตามที่ส่ง", () => {
    const vv = lazViewAfterWrite(v, { prices: [{ skuId: "127317001490", sellerSku: null, price: 350, salePrice: 290, saleStart: "2026-11-12 00:00:00", saleEnd: "2026-11-30 23:59:59" }] });
    expect(vv.skus[1]).toMatchObject({ price: 350, specialPrice: 290, specialFrom: "2026-11-12 00:00", specialTo: "2026-11-30 23:59" });
  });
});

describe("ราคาลดไม่มีกำหนด (เจ้าของขอ 2026-11-10 · LB-01 ราคาลดบนร้านไม่มีวัน)", () => {
  const v = lazadaListingView(item)!;
  const base = lazadaPriceRowsFromView(v);
  const T = "2026-11-10";
  const set = (i: number, patch: Partial<(typeof base)[number]>) => base.map((r, k) => (k === i ? { ...r, ...patch } : r));
  it("ราคาลดเดิมไม่มีวัน → แก้ราคาลด ไม่ต้องใส่วัน · ส่งแท็กวันว่าง + Price คู่", () => {
    const noDate = base.map((r, k) => (k === 0 ? { ...r, from: null, to: null, fromRaw: null, toRaw: null } : r));
    const p = planLazadaPrices(noDate, noDate.map((r, k) => (k === 0 ? { ...r, special: 160 } : r)), T);
    expect(p.errors).toEqual([]);
    expect(p.skus[0]).toEqual({ skuId: "127317001489", sellerSku: "IG-EQ011-01", price: 328, salePrice: 160, saleStart: "", saleEnd: "" });
    expect(p.changes[0].after).toContain("ไม่มีกำหนด");
    expect(lazPriceQuantityXml("1", p.skus)).toContain("<SalePrice>160</SalePrice><SaleStartDate></SaleStartDate><SaleEndDate></SaleEndDate>");
  });
  it("ราคาลดใหม่ไม่ใส่วัน = ไม่มีกำหนด · ใส่แค่วันสิ้นสุด = เริ่มวันนี้ · ใส่แค่วันเริ่ม = ไม่มีวันจบ", () => {
    expect(planLazadaPrices(base, set(1, { special: 290 }), T).skus[0]).toMatchObject({ salePrice: 290, saleStart: "", saleEnd: "" });
    expect(planLazadaPrices(base, set(1, { special: 290, to: "2026-11-30" }), T).skus[0]).toMatchObject({ saleStart: "2026-11-10 00:00", saleEnd: "2026-11-30 23:59" });
    expect(planLazadaPrices(base, set(1, { special: 290, from: "2026-11-12" }), T).skus[0]).toMatchObject({ saleStart: "2026-11-12 00:00", saleEnd: "" });
  });
  it("ล้างวันเดิม (เปลี่ยนเป็นไม่มีกำหนด) = ส่งได้ แต่เตือน", () => {
    const p = planLazadaPrices(base, set(0, { from: null, to: null }), T);
    expect(p.errors).toEqual([]);
    expect(p.skus[0]).toMatchObject({ salePrice: 159, saleStart: "", saleEnd: "" });
    expect(p.warnings.join(" ")).toContain("ไม่มีกำหนด");
  });
  it("แถบแก้หลายตัว: ติ๊กไม่มีกำหนด = ล้างวันทุกตัวที่มีราคาลด", () => {
    const r = applyLazadaBulkPrice(base, null, { noEnd: true });
    expect(r.changed).toBe(1);
    expect(r.rows[0]).toMatchObject({ special: 159, from: null, to: null });
  });
  it("lazViewAfterWrite: วันว่าง = ไม่มีวัน", () => {
    const vv = lazViewAfterWrite(v, { prices: [{ skuId: "127317001489", sellerSku: null, price: 328, salePrice: 150, saleStart: "", saleEnd: "" }] });
    expect(vv.skus[0]).toMatchObject({ specialPrice: 150, specialFrom: null, specialTo: null });
  });
});
