import { describe, expect, it } from "vitest";
import { detectProfile, getProfile, profilesForPlatform, extractFields, parseRecords, dbRowToProfile, GENERIC_CATALOG_PROFILE, type ImportMatrix, type DbProfileRow } from "@/lib/platform-import-profiles";

// ตัวอย่างย่อจากไฟล์ Shopee จริง (mass_update_*) — หัวตาราง 6 แถว ข้อมูลเริ่มแถวที่ 6
const shopeeSales: ImportMatrix = [
  ["et_title_product_id", "et_title_product_name", "et_title_variation_id", "et_title_variation_name", "et_title_parent_sku", "et_title_variation_sku", "et_title_variation_price", "ps_gtin_code", "et_title_variation_stock", "et_title_reason"],
  ["sales_info", "35b74571", "0", "231505269", "{\"search_condition\":{}}", "", "", "", "", ""],
  ["รหัสสินค้า", "ชื่อสินค้า", "รหัสตัวเลือกสินค้า", "ชื่อตัวเลือกสินค้า", "Parent SKU", "เลข SKU", "ราคา", "GTIN", "คลัง", "เหตุผล"],
  ["", "", "", "", "", "", "จำเป็นต้องกรอก", "", "จำเป็นต้องกรอก", ""],
  ["", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", ""],
  ["57952761129", "แท่นวางโฟม", "345266719514", "เหลือง หกเหลี่ยม L", "IG-P002", "IG-P002-H02L", "109", "", "2", ""],
  ["57952761129", "แท่นวางโฟม", "345266719529", "เขียว หกเหลี่ยม S", "", "IG-P002-H07S", "119", "", "3", ""],
  ["57906572956", "พร็อพหนังสือ", "345200000001", "แบบ A", "IG-PROP011", "IG-PROP011-A", "59", "", "5", ""],
];

const shopeeBasic: ImportMatrix = [
  ["et_title_product_id", "et_title_parent_sku", "et_title_product_name", "et_title_product_description", "et_title_reason"],
  ["basic_info", "31088f6a", "0", "231505269", "{\"search_condition\":{}}"],
  ["รหัสสินค้า", "Parent SKU", "ชื่อสินค้า", "รายละเอียดสินค้า", "เหตุผล"],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["", "", "", "", ""],
  ["57952761129", "IG-P002", "แท่นวางโฟม", "วัสดุ: โฟมโพลีเมอร์", ""],
];

describe("detectProfile", () => {
  it("เดาไฟล์ Shopee sales_info จากแถว metadata (R1[0])", () => {
    expect(detectProfile("shopee", shopeeSales).id).toBe("shopee_sales_info");
  });
  it("เดาไฟล์ Shopee basic_info ได้", () => {
    expect(detectProfile("shopee", shopeeBasic).id).toBe("shopee_basic_info");
  });
  it("ไฟล์ที่เดาไม่ออก → generic", () => {
    const unknown: ImportMatrix = [["name", "sku", "price"], ["A", "X1", "10"]];
    expect(detectProfile("shopee", unknown).id).toBe(GENERIC_CATALOG_PROFILE.id);
  });
  it("แพลตฟอร์มอื่นไม่หยิบโปรไฟล์ Shopee", () => {
    expect(detectProfile("lazada", shopeeSales).id).toBe(GENERIC_CATALOG_PROFILE.id);
  });
});

describe("profilesForPlatform", () => {
  it("รวมโปรไฟล์ Shopee + generic", () => {
    const ids = profilesForPlatform("shopee").map((p) => p.id);
    expect(ids).toContain("shopee_sales_info");
    expect(ids).toContain(GENERIC_CATALOG_PROFILE.id);
  });
});

describe("parseRecords — ข้ามหัวตาราง 6 แถว + แปลงรหัสคอลัมน์", () => {
  it("sales_info: อ่านราคา/สต๊อก/SKU ระดับตัวเลือก", () => {
    const recs = parseRecords(getProfile("shopee_sales_info")!, shopeeSales);
    expect(recs).toHaveLength(3);
    expect(recs[0]).toMatchObject({ external_product_id: "57952761129", parent_sku: "IG-P002", variation_sku: "IG-P002-H02L", price: 109, stock: 2 });
    expect(recs[1].parent_sku).toBeNull(); // Shopee ใส่ parent_sku เฉพาะแถวแรกของแต่ละสินค้า
    expect(recs[1].variation_sku).toBe("IG-P002-H07S");
  });
  it("basic_info: อ่านชื่อ/รหัสระดับสินค้า", () => {
    const recs = parseRecords(getProfile("shopee_basic_info")!, shopeeBasic);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ external_product_id: "57952761129", parent_sku: "IG-P002", title: "แท่นวางโฟม" });
  });
  it("ไม่อ่านแถว metadata/label/คำอธิบายเป็นสินค้า", () => {
    const recs = parseRecords(getProfile("shopee_sales_info")!, shopeeSales);
    expect(recs.every((r) => r.external_product_id !== "sales_info")).toBe(true);
    expect(recs.every((r) => r.title !== "ชื่อสินค้า")).toBe(true);
  });
  it("generic: หัวตารางแถวเดียว", () => {
    const generic: ImportMatrix = [["name", "sku", "price"], ["สินค้า A", "X1", "10"], ["", "", ""]];
    const recs = parseRecords(GENERIC_CATALOG_PROFILE, generic);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ title: "สินค้า A", variation_sku: "X1", price: 10 });
  });
});

describe("extractFields", () => {
  it("คืนรหัสคอลัมน์ + ป้ายไทย + ตัวอย่างค่า", () => {
    const fields = extractFields(getProfile("shopee_sales_info")!, shopeeSales);
    const price = fields.find((f) => f.key === "et_title_variation_price");
    expect(price?.label).toBe("ราคา");
    expect(price?.sample).toBe("109");
  });
});

// ---------- ระดับ 2: ชนิดไฟล์ที่ผู้ใช้สร้างเอง (custom จาก DB) ----------
const customRow: DbProfileRow = {
  id: "uuid-1", profile_key: "shopee_promo", label: "Shopee — โปรโมชั่น",
  kind: "catalog", level: "variation", section: "promo",
  header_row_index: 0, label_row_index: 1, data_start_row_index: 2,
  detect: { headerIncludes: ["promo_sku"] },
  field_map: { variation_sku: ["promo_sku"], price: ["promo_price"], title: "promo_name" },
  is_active: true,
};

describe("dbRowToProfile", () => {
  it("แปลงแถว DB → ImportProfile (รวม field_map ที่เป็น string เดี่ยว)", () => {
    const p = dbRowToProfile(customRow, "shopee");
    expect(p).toMatchObject({ id: "shopee_promo", platformCode: "shopee", level: "variation", section: "promo", dataStartRowIndex: 2, isCustom: true, dbId: "uuid-1" });
    expect(p.map.variation_sku).toEqual(["promo_sku"]);
    expect(p.map.title).toEqual(["promo_name"]); // string เดี่ยว → array
    expect(p.detect?.headerIncludes).toEqual(["promo_sku"]);
  });
});

describe("custom profiles (extra) merge", () => {
  const custom = dbRowToProfile(customRow, "shopee");
  const promoFile: ImportMatrix = [
    ["promo_sku", "promo_price", "promo_name"],
    ["รหัส", "ราคาโปร", "ชื่อ"],
    ["IG-P002-H02L", "99", "แท่นวางโฟม เหลือง"],
  ];
  it("detectProfile หยิบ custom ก่อน เมื่อ signature ตรง", () => {
    expect(detectProfile("shopee", promoFile, [custom]).id).toBe("shopee_promo");
  });
  it("getProfile หา custom ได้จาก extra", () => {
    expect(getProfile("shopee_promo", [custom])?.isCustom).toBe(true);
  });
  it("profilesForPlatform รวม custom + มาตรฐาน + generic", () => {
    const ids = profilesForPlatform("shopee", [custom]).map((p) => p.id);
    expect(ids[0]).toBe("shopee_promo"); // custom มาก่อน
    expect(ids).toContain("shopee_sales_info");
    expect(ids).toContain(GENERIC_CATALOG_PROFILE.id);
  });
  it("custom override built-in id เดียวกัน (ไม่ซ้ำในรายการ)", () => {
    const override = dbRowToProfile({ ...customRow, id: "uuid-2", profile_key: "shopee_sales_info", label: "ราคา/สต๊อก (ปรับเอง)" }, "shopee");
    const list = profilesForPlatform("shopee", [override]);
    expect(list.filter((p) => p.id === "shopee_sales_info")).toHaveLength(1);
    expect(list.find((p) => p.id === "shopee_sales_info")?.isCustom).toBe(true);
  });
  it("parseRecords ใช้ custom profile แตกข้อมูลได้", () => {
    const recs = parseRecords(custom, promoFile);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ variation_sku: "IG-P002-H02L", price: 99, title: "แท่นวางโฟม เหลือง" });
  });
});
