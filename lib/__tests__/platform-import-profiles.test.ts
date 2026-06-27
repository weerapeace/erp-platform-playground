import { describe, expect, it } from "vitest";
import { detectProfile, getProfile, profilesForPlatform, extractFields, parseRecords, GENERIC_CATALOG_PROFILE, type ImportMatrix } from "@/lib/platform-import-profiles";

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
