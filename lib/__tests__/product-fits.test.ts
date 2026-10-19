import { describe, it, expect } from "vitest";
import { bilingualDimensions, dimensionRows, parseSizeDims, productDimensions, sizeDimsFor, type FitItem } from "../product-fits";

/** 📏 หัวข้อ "ขนาด" บนเว็บ — ไทย + อังกฤษ (`_en`) จากข้อมูลชุดเดียวกัน */
const bag = { size_length_cm: 23, size_height_cm: 15, size_thickness_cm: 14, handle_drop_cm: 13, strap_drop_cm: 60 };
const catalog: FitItem[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "มือถือ", name_en: "a smartphone" },
  { id: "22222222-2222-4222-8222-222222222222", name: "กระเป๋าสตางค์", name_en: "a wallet" },
];
const fits = catalog.map((c) => ({ id: c.id }));

describe("dimensionRows", () => {
  it("อังกฤษ = Length / Height / Width แบบเว็บแบรนด์นอก (key คงเดิม)", () => {
    const en = dimensionRows(bag, "en");
    expect(en.map((r) => `${r.label}: ${r.cm} | ${r.inch}`)).toEqual([
      'Length: 23 cm | 9.1"',
      'Height: 15 cm | 5.9"',
      'Width: 14 cm | 5.5"',
      'Handle drop: 13 cm | 5.1"',
      'Strap drop: 60 cm | 23.6"',
    ]);
    expect(en.map((r) => r.key)).toEqual(["width", "height", "thickness", "handle", "strap"]);
  });

  it("ไทยยังเป็น กว้าง / สูง / หนา", () => {
    expect(dimensionRows(bag).slice(0, 3).map((r) => `${r.label}: ${r.cm}`)).toEqual(["กว้าง: 23 ซม.", "สูง: 15 ซม.", "หนา: 14 ซม."]);
  });
});

describe("bilingualDimensions", () => {
  it("ใส่ label_en / cm_en ต่อแถว + fits_en", () => {
    const row = { ...bag, fits };
    const d = bilingualDimensions(productDimensions(row, catalog), productDimensions(row, catalog, "en"))!;
    expect(d.fits).toEqual(["มือถือ", "กระเป๋าสตางค์"]);
    expect(d.fits_en).toEqual(["a smartphone", "a wallet"]);
    expect(d.rows[0]).toMatchObject({ key: "width", label: "กว้าง", label_en: "Length", cm: "23 ซม.", cm_en: "23 cm", inch: '9.1"' });
  });

  it("ไม่มีของที่ใส่ได้ = ไม่ส่ง fits_en", () => {
    const d = bilingualDimensions(productDimensions(bag, catalog), productDimensions(bag, catalog, "en"))!;
    expect(d.fits).toEqual([]);
    expect(d).not.toHaveProperty("fits_en");
  });

  it("แถวไม่ตรงกัน = ไม่ใส่อังกฤษ (กันจับคู่ผิดบรรทัด) · ไม่มีข้อมูล = undefined", () => {
    const th = productDimensions(bag, catalog)!;
    const d = bilingualDimensions(th, { fits: [], rows: th.rows.slice(1) })!;
    expect(d.rows.every((r) => r.label_en === undefined)).toBe(true);
    expect(bilingualDimensions(undefined, undefined)).toBeUndefined();
  });
});

/** 📐 ขนาดของต่อตัวเลือก (สมาร์ทโฟน 6.1 / 6.7 นิ้ว ยาวไม่เท่ากัน) */
describe("size_dims", () => {
  const raw = { "ถึง 6.1 นิ้ว": { w: 7.2, h: 14.8, d: 0.8 }, "ถึง 6.7 นิ้ว": { w: 7.8, h: "16.1", d: 0.8 }, "พัง": { w: 0, h: 1, d: 1 } };
  it("อ่านเฉพาะขนาดที่ครบ 3 ด้าน (string JSON ก็ได้)", () => {
    expect(Object.keys(parseSizeDims(raw))).toEqual(["ถึง 6.1 นิ้ว", "ถึง 6.7 นิ้ว"]);
    expect(parseSizeDims(JSON.stringify(raw))["ถึง 6.7 นิ้ว"]).toEqual({ w: 7.8, h: 16.1, d: 0.8 });
    expect(parseSizeDims(null)).toEqual({});
    expect(parseSizeDims("not json")).toEqual({});
  });
  it("ขนาดตามตัวเลือกที่เลือก · ไม่เลือก/ไม่มี = null", () => {
    expect(sizeDimsFor(raw, " ถึง 6.1 นิ้ว ")).toEqual({ w: 7.2, h: 14.8, d: 0.8 });
    expect(sizeDimsFor(raw, "ถึง 6.9 นิ้ว")).toBeNull();
    expect(sizeDimsFor(raw, null)).toBeNull();
  });
});
