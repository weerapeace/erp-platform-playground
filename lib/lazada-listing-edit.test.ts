import { describe, it, expect } from "vitest";
import {
  lazadaListingView, lazImageList, lazDateText, lazSkuLabel, lazStatusBadge,
  highlightsToLines, linesToHighlights, lazadaEditStateFromView, planLazadaEdit, foreignDescImages,
  lazUpdateProductXml, lazDeactivateXml, planLazadaDisplay, lazViewAfterWrite, lazRawAfterStatus,
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
