import { describe, expect, it } from "vitest";
import { planTiktokSizeTable, sizeTableFromGrid, sortSizeTemplatesFor, starterSizeTable, ttsSizeMetaOf, ttsSizeTemplatesOf } from "@/lib/tiktok-size-chart";
import { planTiktokSizeChart, ttsCategoryRulesOf } from "@/lib/tiktok-attrs";

// ตัวอย่างคำตอบจากเอกสาร (Get Category Rules / Search Size Charts)
const rules = { size_chart: { is_supported: true, is_required: true, measurement_and_options: [{ size_systems: ["size_chart_size_system_us"], measurement_type: "BODY_MEASUREMENTS", options: [{ name: "Bust", id: "size_chart_option_bust", role: "KEY", unit: "LENGTH", metric_value_range: ["70", "160"] }] }], size_types: ["size_chart_size_type_regular"], size_systems: ["size_chart_size_system_us"] }, cod: { is_supported: true } };
const meta = ttsSizeMetaOf(rules)!;

describe("ข้อมูลหมวด + แม่แบบ", () => {
  it("อ่านแบบวัดของหมวด", () => {
    expect(meta.measures[0]).toMatchObject({ type: "BODY_MEASUREMENTS", options: [{ id: "size_chart_option_bust", min: 70, max: 160, role: "KEY" }] });
    expect(ttsCategoryRulesOf(rules).size?.measures.length).toBe(1);
    expect(ttsSizeMetaOf({})).toBeNull();
  });
  it("อ่านแม่แบบ (ภาษาไทยก่อน) + เรียงตัวที่ใช้กับหมวดได้ขึ้นก่อน", () => {
    const list = ttsSizeTemplatesOf({ size_chart: [
      { template_id: "T1", template_name: "เสื้อ", related_category_ids: ["999"], size_chart_datas: [{ locale: "en-US", size_chart_data: { table: { headers: [{ name: "Size" }], rows: [{ cells: [{ value: "S" }] }] } } }] },
      { template_id: "T2", template_name: "กระเป๋า", related_category_ids: ["601417"], images: [{ url: "https://x/y.png", locale: "th-TH" }], size_chart_datas: [{ locale: "th-TH", size_chart_data: { measurement_type: "GENERIC_MEASUREMENTS", table: { headers: [{ name: "ไซซ์", id: "size_chart_size_system_size" }, { name: "กว้าง" }], rows: [{ cells: [{ value: "M" }, { value: "30" }] }, { cells: [{ value: "L" }] }] } } }] },
    ] });
    expect(list[1].table).toEqual({ headers: [{ id: "size_chart_size_system_size", name: "ไซซ์" }, { id: null, name: "กว้าง" }], rows: [["M", "30"], ["L", ""]] });
    expect(list[1].image).toBe("https://x/y.png");
    expect(sortSizeTemplatesFor(list, "601417").map((t) => [t.id, t.fits])).toEqual([["T2", true], ["T1", false]]);
  });
});

describe("planTiktokSizeTable", () => {
  it("ตารางตั้งต้นใช้คอลัมน์วัดหลักของหมวด", () => {
    expect(starterSizeTable(meta).headers.map((h) => h.id)).toEqual(["size_chart_size_system_size", "size_chart_option_bust"]);
  });
  it("ตารางถูกต้อง → body สร้างแม่แบบ (ตัดแถวว่าง · id ที่หมวดไม่รู้จัก = คอลัมน์ตั้งเอง)", () => {
    const p = planTiktokSizeTable({ categoryId: "601417", name: "เสื้อผู้หญิง", measurementType: "BODY_MEASUREMENTS", table: { headers: [{ id: "size_chart_size_system_size", name: "ไซซ์" }, { id: "size_chart_option_bust", name: "รอบอก (ซม.)" }, { id: "weird", name: "ยาว" }], rows: [["S", "80", "60"], ["", "", ""], ["M", "200", "62"]] } }, meta);
    expect(p.errors).toEqual([]);
    expect(p.rows).toBe(2);
    expect(p.warnings.join()).toContain("นอกช่วง");
    const t = (p.body!.size_chart_data as { table: { headers: unknown[]; rows: unknown[] } }).table;
    expect(t.headers).toEqual([{ id: "size_chart_size_system_size", name: "ไซซ์" }, { id: "size_chart_option_bust", name: "รอบอก (ซม.)" }, { name: "ยาว" }]);
    expect(t.rows[0]).toEqual({ cells: [{ value: "S" }, { value: "80" }, { value: "60" }] });
    expect(p.body!.size_chart_mode).toBe("REUSABLE_TEMPLATE");
  });
  it("ไม่มีชื่อ / หัวซ้ำ / คอลัมน์แรกว่าง = error", () => {
    const p = planTiktokSizeTable({ categoryId: "1", name: "", measurementType: null, table: { headers: [{ id: null, name: "A" }, { id: null, name: "a" }], rows: [["", "1"]] } }, null);
    expect(p.errors.length).toBeGreaterThanOrEqual(3);
    expect(p.body).toBeNull();
  });
  it("วางจาก Excel → ตาราง (หัวไซซ์ได้ id อัตโนมัติ)", () => {
    const t = sizeTableFromGrid([["Size", "Bust"], ["S", "80"], ["M", "84"]], meta)!;
    expect(t.headers).toEqual([{ id: "size_chart_size_system_size", name: "Size" }, { id: "size_chart_option_bust", name: "Bust" }]);
    expect(t.rows).toEqual([["S", "80"], ["M", "84"]]);
  });
});

describe("planTiktokSizeChart (แม่แบบ)", () => {
  const r = { codSupported: null, sizeChartSupported: true, sizeChartRequired: null };
  it("เปลี่ยนจากรูปเป็นแม่แบบ", () => {
    const p = planTiktokSizeChart("tts:abc", "tpl:77", r, "กระเป๋า");
    expect(p.changed).toBe(true);
    expect(p.change).toEqual({ label: "ตารางขนาด", before: "รูปเดิม", after: "แม่แบบ \"กระเป๋า\"" });
  });
  it("แม่แบบเดิม = ไม่เปลี่ยน · ลบไม่ได้", () => {
    expect(planTiktokSizeChart("tpl:77", "tpl:77", r).changed).toBe(false);
    expect(planTiktokSizeChart("tpl:77", null, r).errors[0]).toContain("ลบตารางขนาดไม่ได้");
  });
});
