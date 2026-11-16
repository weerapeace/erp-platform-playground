import { describe, it, expect } from "vitest";
import {
  buildSpecCatalog, buildSheetPlan, planColumns, cleanPresetConfig, specFileName, isBlank,
  type RegistryFieldRow, type SpecProduct,
} from "@/lib/spec-export";

const P: RegistryFieldRow[] = [
  { field_key: "id", column_name: "id", field_label: "Id", ui_field_type: "text", display_order: 0 },
  { field_key: "code", column_name: "code", field_label: "Code", ui_field_type: "text", display_order: 1 },
  { field_key: "name_th", column_name: "name_th", field_label: "ชื่อสินค้า", ui_field_type: "text", ui_style: { lang_en: "name_en" }, display_order: 2 },
  { field_key: "name_en", column_name: "name_en", field_label: "Name En", ui_field_type: "text", display_order: 3 },
  { field_key: "introduction", column_name: "introduction", field_label: "Introduction", ui_field_type: "textarea", ui_style: { lang_en: "introduction_en" }, display_order: 4 },
  { field_key: "introduction_en", column_name: "introduction_en", field_label: "Introduction En", ui_field_type: "textarea", display_order: 5 },
  { field_key: "brand_id", column_name: "brand_id", field_label: "Brand Id", ui_field_type: "relation", relation_config: { target_table: "brands", target_label_field: "name" }, display_order: 6 },
  { field_key: "size_length_cm", column_name: "size_length_cm", field_label: "กว้าง (ซม.)", ui_field_type: "number", display_order: 7 },
  { field_key: "sale_price", column_name: "sale_price", field_label: "Sale Price", ui_field_type: "number", is_sensitive: true, sensitive_permission: "products.cost.view", display_order: 8 },
  { field_key: "fabric_cost", column_name: "fabric_cost", field_label: "Fabric Cost", ui_field_type: "number", is_sensitive: true, sensitive_permission: "products.cost.view", display_order: 9 },
  { field_key: "cover_image_r2_key", column_name: "cover_image_r2_key", field_label: "Cover Image R2 Key", ui_field_type: "image", display_order: 10 },
  { field_key: "size_summary", column_name: "size_summary", field_label: "Size Summary", ui_field_type: "computed", relation_config: { kind: "computed", text_compute: "size_summary" }, display_order: 11 },
  { field_key: "how_to_size", column_name: null, field_label: "วิธีวัด", ui_field_type: "related", relation_config: { kind: "related", via_column: "size_description_id", target_table: "size_descriptions", target_field: "how_to_size" }, display_order: 12 },
  { field_key: "old_field", column_name: "old_field", field_label: "Old", ui_field_type: "text", is_active: false, display_order: 13 },
];
const S: RegistryFieldRow[] = [
  { field_key: "code", column_name: "code", field_label: "Code", ui_field_type: "text", display_order: 1 },
  { field_key: "color_platform_th", column_name: "color_platform_th", field_label: "Color Platform [TH]", ui_field_type: "text", display_order: 2 },
  { field_key: "color_platform_en", column_name: "color_platform_en", field_label: "Color Platform [EN]", ui_field_type: "text", display_order: 3 },
  { field_key: "list_price", column_name: "list_price", field_label: "Sale Price", ui_field_type: "number", is_sensitive: true, sensitive_permission: "products.cost.view", display_order: 4 },
  { field_key: "brands", column_name: null, field_label: "Brand", ui_field_type: "related", relation_config: { kind: "related", via_column: "parent_sku_id", target_table: "parent_skus_v2", target_field: "brand_id", resolve_table: "brands" }, display_order: 5 },
];

describe("buildSpecCatalog", () => {
  const all = buildSpecCatalog(P, S);
  const keys = all.map((f) => f.key);

  it("รวมคู่ภาษา TH/EN เป็นช่องเดียว และไม่โชว์ช่องอังกฤษแยก", () => {
    const name = all.find((f) => f.key === "p:name_th")!;
    expect(name.enColumn).toBe("name_en");
    expect(keys).not.toContain("p:name_en");
    expect(keys).not.toContain("p:introduction_en");
  });
  it("คู่ภาษาสีของ SKU ลูกใช้ค่าสำรองเมื่อทะเบียนไม่ได้ตั้ง", () => {
    expect(all.find((f) => f.key === "s:color_platform_th")?.enColumn).toBe("color_platform_en");
    expect(keys).not.toContain("s:color_platform_en");
  });
  it("ตัด id / ช่องปิดใช้ / related 2 ทอด", () => {
    expect(keys).not.toContain("p:id");
    expect(keys).not.toContain("p:old_field");
    expect(keys).not.toContain("s:brands");
  });
  it("จัดหมวดตามงาน + ป้ายไทยแทนชื่ออัตโนมัติ", () => {
    const brand = all.find((f) => f.key === "p:brand_id")!;
    expect(brand.cat).toBe("main");
    expect(brand.label).toBe("แบรนด์");
    expect(brand.relation).toEqual({ table: "brands", labelField: "name" });
    expect(all.find((f) => f.key === "p:sale_price")?.cat).toBe("price");
    expect(all.find((f) => f.key === "p:fabric_cost")?.cat).toBe("cost");
    expect(all.find((f) => f.key === "p:cover_image_r2_key")?.cat).toBe("img");
    expect(all.find((f) => f.key === "p:introduction")?.cat).toBe("plat");
    expect(all.find((f) => f.key === "s:code")?.cat).toBe("sku");
  });
  it("ช่องคำนวณ/ดึงจากตารางอื่นมีข้อมูลพอให้ server ใช้", () => {
    expect(all.find((f) => f.key === "p:size_summary")?.compute?.name).toBe("size_summary");
    expect(all.find((f) => f.key === "p:how_to_size")?.related).toEqual({ via: "size_description_id", table: "size_descriptions", field: "how_to_size" });
  });
  it("ไม่มีสิทธิ์ดูต้นทุน = ไม่เห็นช่องราคา/ต้นทุน (ทั้งรุ่นและ SKU ลูก)", () => {
    const limited = buildSpecCatalog(P, S, () => false).map((f) => f.key);
    expect(limited).not.toContain("p:sale_price");
    expect(limited).not.toContain("p:fabric_cost");
    expect(limited).not.toContain("s:list_price");
    expect(limited).toContain("p:name_th");
  });
});

const fields = buildSpecCatalog(P, S);
const pick = (...k: string[]) => k.map((x) => fields.find((f) => f.key === x)!);
const PRODUCTS: SpecProduct[] = [
  {
    id: "a", code: "TTM127",
    values: { code: "TTM127", name_th: "กระเป๋าสตางค์", name_en: "Wallet", introduction: "เกริ่น", introduction_en: null, cover_image_r2_key: "k/a.jpg" },
    kids: [
      { id: "a1", code: "TTM127-BR", active: true, values: { code: "TTM127-BR", color_platform_th: "น้ำตาล", color_platform_en: "Brown" } },
      { id: "a2", code: "TTM127-BK", active: true, values: { code: "TTM127-BK", color_platform_th: "ดำ", color_platform_en: null } },
      { id: "a3", code: "TTM127-OLD", active: false, values: { code: "TTM127-OLD", color_platform_th: "เก่า", color_platform_en: "Old" } },
    ],
  },
  { id: "b", code: "LMB204", values: { code: "LMB204", name_th: "กระเป๋าเอกสาร", name_en: "-", introduction: null, introduction_en: null }, kids: [] },
];

describe("planColumns", () => {
  it("ทั้งคู่ = ช่องคู่ภาษาแยก 2 คอลัมน์ · ช่อง SKU ลูกออกเฉพาะแบบแยกแถว", () => {
    const f = pick("p:code", "p:name_th", "s:code");
    expect(planColumns(f, "both", "kids").map((c) => c.header)).toEqual(["รหัส", "ชื่อสินค้า (TH)", "Product name (EN)", "รหัส (SKU ลูก)"]);
    expect(planColumns(f, "th", "parent").map((c) => c.key)).toEqual(["p:code", "p:name_th"]);
    expect(planColumns(f, "en", "summary").map((c) => c.key)).toEqual(["p:code", "p:name_th", "__colors"]);
  });
  it("ภาษาอังกฤษใช้หัวคอลัมน์อังกฤษ", () => {
    expect(planColumns(pick("p:name_th"), "en", "parent")[0].header).toBe("Product name");
    expect(planColumns(pick("p:name_th"), "th", "parent")[0].header).toBe("ชื่อสินค้า");
  });
});

describe("buildSheetPlan", () => {
  const f = pick("p:code", "p:name_th", "p:introduction", "s:code", "s:color_platform_th");

  it("แยกแถวตามลูก + รวมช่องรุ่น: แถวละสี · ช่องรุ่นรวมสูงหลายแถว · ซ่อนสีเลิกขาย", () => {
    const plan = buildSheetPlan({ fields: f, lang: "en", mode: "kids", merge: true, products: PRODUCTS, hideInactiveKids: true });
    expect(plan.rows).toHaveLength(3);   // TTM127 = 2 สี (ไม่นับเลิกขาย) + LMB204 ไม่มีลูก = 1 แถว
    expect(plan.productStarts).toEqual([0, 2]);
    expect(plan.merges).toEqual([
      { r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 1, r2: 1, c2: 1 }, { r1: 0, c1: 2, r2: 1, c2: 2 },
    ]);
    expect(plan.rows[0][1].v).toBe("Wallet");
    expect(plan.rows[1][1].v).toBeNull();          // แถวถัดไปของช่องรวม = ว่าง
    expect(plan.rows[1][3].v).toBe("TTM127-BK");
  });
  it("ซ้ำทุกแถว: ไม่มีช่องรวม และค่าของรุ่นซ้ำทุกแถว", () => {
    const plan = buildSheetPlan({ fields: f, lang: "en", mode: "kids", merge: false, products: PRODUCTS, hideInactiveKids: true });
    expect(plan.merges).toHaveLength(0);
    expect(plan.rows[1][1].v).toBe("Wallet");
  });
  it("ช่องที่ยังไม่แปล: ไทยมีแต่อังกฤษว่าง (ขีด - ถือว่าว่าง) · นับครั้งเดียวต่อรุ่นแม้ซ้ำทุกแถว", () => {
    const plan = buildSheetPlan({ fields: f, lang: "en", mode: "kids", merge: false, products: PRODUCTS, hideInactiveKids: true });
    const m = plan.missing.map((x) => `${x.rowId}:${x.enColumn}`).sort();
    expect(m).toEqual(["a2:color_platform_en", "a:introduction_en", "b:name_en"]);
    expect(plan.rows[0][2].missing).toBe(true);
  });
  it("ภาษาไทยไม่มีช่องที่ต้องแปล", () => {
    expect(buildSheetPlan({ fields: f, lang: "th", mode: "kids", merge: true, products: PRODUCTS }).missing).toHaveLength(0);
  });
  it("ติ๊กออกสีที่ไม่ส่ง", () => {
    const plan = buildSheetPlan({ fields: f, lang: "th", mode: "kids", merge: true, products: PRODUCTS, excludeKids: new Set(["a1"]), hideInactiveKids: true });
    expect(plan.rows.map((r) => r[3].v)).toEqual(["TTM127-BK", null]);
  });
  it("สรุปสี: 1 รุ่น 1 แถว + ช่องรวมทุกสี (อังกฤษว่าง → ใช้ไทย)", () => {
    const plan = buildSheetPlan({ fields: pick("p:code"), lang: "en", mode: "summary", merge: true, products: PRODUCTS, hideInactiveKids: true });
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0][1].v).toBe("Brown, ดำ");
    expect(plan.rows[1][1].v).toBeNull();
  });
  it("หัว 2 ชั้น แบ่งช่วง ข้อมูลรุ่น / ข้อมูลสี", () => {
    const plan = buildSheetPlan({ fields: f, lang: "th", mode: "kids", merge: true, products: PRODUCTS });
    expect(plan.bands.map((b) => [b.label, b.c1, b.c2])).toEqual([["ข้อมูลรุ่น", 0, 2], ["ข้อมูลสี (SKU ลูก)", 3, 4]]);
  });
  it("รูป: เก็บ key ไว้ให้ตัวสร้างไฟล์ฝัง/ทำลิงก์", () => {
    const plan = buildSheetPlan({ fields: pick("p:cover_image_r2_key"), lang: "th", mode: "parent", merge: true, products: PRODUCTS });
    expect(plan.rows[0][0]).toEqual({ v: "k/a.jpg", image: true });
    expect(plan.rows[1][0]).toEqual({ v: null, image: true });
  });
});

describe("ตัวช่วยอื่น", () => {
  it("cleanPresetConfig กรองค่าแปลก ๆ", () => {
    const c = cleanPresetConfig({ fields: ["p:code", "bad key", "s:code", "p:code", 5], lang: "xx", mode: "summary", merge: false, images: "link" });
    expect(c).toMatchObject({ fields: ["p:code", "s:code"], lang: "en", mode: "summary", merge: false, images: "link", twoTier: true });
  });
  it("ชื่อไฟล์ใช้วันที่เวลาไทย", () => {
    expect(specFileName("en", new Date("2026-11-30T20:00:00Z"))).toBe("รายละเอียดสินค้า_EN_2026-12-01");
    expect(specFileName("both", new Date("2026-11-16T01:00:00Z"))).toBe("รายละเอียดสินค้า_TH-EN_2026-11-16");
  });
  it("isBlank: ขีด/ช่องว่าง = ว่าง แต่ 0 ไม่ว่าง", () => {
    expect(isBlank("-")).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank("ดำ")).toBe(false);
  });
});

describe("ช่องอังกฤษที่ยังเป็นภาษาไทย", () => {
  it("นับเป็นยังไม่แปล แต่คงค่าเดิมไว้ (ข้อมูลจริง: สีอังกฤษคัดลอกจากไทย)", () => {
    const prods: SpecProduct[] = [{ id: "t", code: "TTM127", values: {}, kids: [
      { id: "t3", code: "TTM127-03", active: true, values: { code: "TTM127-03", color_platform_th: "แทน (03)", color_platform_en: "แทน (03)" } },
      { id: "t1", code: "TTM127-01", active: true, values: { code: "TTM127-01", color_platform_th: "กรมท่า (01)", color_platform_en: "Navy (01)" } },
    ] }];
    const plan = buildSheetPlan({ fields: pick("s:color_platform_th"), lang: "en", mode: "kids", merge: true, products: prods });
    expect(plan.rows[0][0]).toEqual({ v: "แทน (03)", missing: true });
    expect(plan.rows[1][0]).toEqual({ v: "Navy (01)" });
    expect(plan.missing.map((m) => m.rowId)).toEqual(["t3"]);
  });
});
