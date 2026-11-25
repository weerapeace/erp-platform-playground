import { describe, expect, it } from "vitest";
import { ageText, cleanCatBody, doneAgain, dueItems, dueLabel, isLatestRecord, latestWeight, type CatsData, type Treatment, type Vaccination } from "@/lib/cats";

const base = { is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", deleted_at: null };
const CAT = "11111111-1111-4111-8111-111111111111";
const cat = { ...base, id: CAT, name: "มะลิ", photo_r2_key: null, sex: "female" as const, birth_date: "2023-05-10", adopted_date: null, breed: null, color: null, neutered: true, microchip: null, note: null, sort_order: 0 };
const vac = (id: string, given: string, due: string | null, name = "วัคซีนรวม 4 โรค"): Vaccination => ({ ...base, id, cat_id: CAT, vaccine_name: name, date_given: given, clinic_id: null, next_due_date: due, cost: null, note: null });
const tr = (id: string, type: "deworm" | "flea", given: string, due: string | null, interval: number | null = 30): Treatment => ({ ...base, id, cat_id: CAT, type, product: "Revolution", date_given: given, interval_days: interval, next_due_date: due, cost: null, note: null });
const data = (p: Partial<CatsData>): CatsData => ({ cats: [cat], clinics: [], vaccinations: [], treatments: [], weights: [], supplies: [], purchases: [], vet_visits: [], expenses: [], ...p });

describe("cleanCatBody", () => {
  it("ต้องมีชื่อแมว", () => {
    expect(cleanCatBody("cats", {}, false)).toEqual({ ok: false, error: "ต้องใส่ชื่อ" });
    expect(cleanCatBody("cats", { name: "  " }, false).ok).toBe(false);
  });
  it("ตัดช่องว่าง + ค่าว่างเป็น null + bool", () => {
    const r = cleanCatBody("cats", { name: " มะลิ ", breed: "", neutered: true, sex: "female" }, false);
    expect(r).toEqual({ ok: true, patch: { name: "มะลิ", breed: null, neutered: true, sex: "female" } });
  });
  it("วันที่ผิด / เพศผิด ไม่ผ่าน", () => {
    expect(cleanCatBody("cats", { name: "a", birth_date: "2026-02-31" }, false).ok).toBe(false);
    expect(cleanCatBody("cats", { name: "a", sex: "x" }, false).ok).toBe(false);
  });
  it("วันนัดก่อนวันฉีดไม่ได้", () => {
    const r = cleanCatBody("vaccinations", { cat_id: CAT, vaccine_name: "FVRCP", date_given: "2026-05-01", next_due_date: "2026-04-01" }, false);
    expect(r.ok).toBe(false);
  });
  it("ยา: มีรอบแต่ไม่ใส่วันครบกำหนด → คิดให้", () => {
    const r = cleanCatBody("treatments", { cat_id: CAT, type: "flea", product: "Revolution", date_given: "2026-11-01", interval_days: 30, next_due_date: "" }, false);
    expect(r.ok && r.patch.next_due_date).toBe("2026-12-01");
  });
  it("ยา: ใส่วันครบกำหนดเองไว้ = ใช้ของที่ใส่", () => {
    const r = cleanCatBody("treatments", { cat_id: CAT, type: "flea", product: "x", date_given: "2026-11-01", interval_days: 30, next_due_date: "2026-11-20" }, false);
    expect(r.ok && r.patch.next_due_date).toBe("2026-11-20");
  });
  it("น้ำหนักต้องอยู่ในช่วงจริง", () => {
    expect(cleanCatBody("weights", { cat_id: CAT, date: "2026-11-01", weight_kg: 0 }, false).ok).toBe(false);
    expect(cleanCatBody("weights", { cat_id: CAT, date: "2026-11-01", weight_kg: "4.234" }, false)).toEqual({ ok: true, patch: { cat_id: CAT, date: "2026-11-01", weight_kg: 4.23 } });
  });
  it("แก้บางช่อง ไม่บังคับช่องอื่น · ไม่มีอะไรแก้ = ผิด", () => {
    expect(cleanCatBody("cats", { color: "ครีม" }, true)).toEqual({ ok: true, patch: { color: "ครีม" } });
    expect(cleanCatBody("cats", {}, true).ok).toBe(false);
  });
  it("ค่าใช้จ่ายติดลบไม่ได้ · มีลูกน้ำได้", () => {
    expect(cleanCatBody("clinics", { name: "a" }, false).ok).toBe(true);
    expect(cleanCatBody("vaccinations", { cat_id: CAT, vaccine_name: "a", date_given: "2026-01-01", cost: -1 }, false).ok).toBe(false);
    const r = cleanCatBody("vaccinations", { cat_id: CAT, vaccine_name: "a", date_given: "2026-01-01", cost: "1,250.5" }, false);
    expect(r.ok && r.patch.cost).toBe(1250.5);
  });
});

describe("dueItems", () => {
  it("นับเฉพาะเข็มล่าสุดของชื่อเดียวกัน", () => {
    const d = data({ vaccinations: [vac("a", "2025-11-01", "2026-11-01"), vac("b", "2026-11-01", "2027-11-01")] });
    expect(dueItems(d, "2026-11-20", 30)).toEqual([]);
    expect(isLatestRecord(d, "vaccinations", "b")).toBe(true);
    expect(isLatestRecord(d, "vaccinations", "a")).toBe(false);
  });
  it("ชื่อวัคซีนต่างตัวพิมพ์/ช่องว่าง = กลุ่มเดียวกัน", () => {
    const d = data({ vaccinations: [vac("a", "2025-01-01", "2026-01-01", "Rabies"), vac("b", "2026-01-01", "2027-01-01", " rabies ")] });
    expect(dueItems(d, "2026-12-20")).toHaveLength(1);
  });
  it("ยาแยกชนิด · เลยกำหนดขึ้นก่อน · แมวในถังขยะไม่นับ", () => {
    const d = data({ treatments: [tr("x", "flea", "2026-10-01", "2026-11-01"), tr("y", "deworm", "2026-09-01", "2026-12-01")] });
    const r = dueItems(d, "2026-11-05", 30);
    expect(r.map((i) => [i.recordId, i.daysLeft])).toEqual([["x", -4], ["y", 26]]);
    expect(dueItems({ ...d, cats: [{ ...cat, is_active: false }] }, "2026-11-05")).toEqual([]);
  });
  it("ไกลเกินช่วง = ไม่โชว์", () => {
    expect(dueItems(data({ treatments: [tr("x", "flea", "2026-10-01", "2027-01-01")] }), "2026-11-01", 30)).toEqual([]);
  });
});

describe("doneAgain", () => {
  it("วัคซีน: ใช้ช่วงห่างเดิม", () => {
    expect(doneAgain("vaccinations", vac("a", "2025-11-01", "2026-11-01"), "2026-11-24")).toMatchObject({ date_given: "2026-11-24", next_due_date: "2027-11-24", vaccine_name: "วัคซีนรวม 4 โรค" });
  });
  it("วัคซีนไม่มีวันนัด = 1 ปี", () => {
    expect(doneAgain("vaccinations", vac("a", "2025-11-01", null), "2026-01-01").next_due_date).toBe("2027-01-01");
  });
  it("ยา: ใช้รอบเดิม", () => {
    expect(doneAgain("treatments", tr("a", "flea", "2026-10-01", "2026-12-30", 90), "2026-11-24")).toMatchObject({ interval_days: 90, next_due_date: "2027-02-22", type: "flea" });
  });
});

describe("อื่น ๆ", () => {
  it("อายุ", () => {
    expect(ageText("2023-05-10", "2026-11-24")).toBe("3 ปี 6 เดือน");
    expect(ageText("2026-03-30", "2026-11-24")).toBe("7 เดือน");
    expect(ageText("2026-11-10", "2026-11-24")).toBe("2 สัปดาห์");
    expect(ageText(null, "2026-11-24")).toBe("");
  });
  it("ป้ายวันที่เหลือ", () => {
    expect(dueLabel(-2)).toEqual({ text: "เลยกำหนด 2 วัน", tone: "danger" });
    expect(dueLabel(0).tone).toBe("danger");
    expect(dueLabel(5).tone).toBe("warning");
    expect(dueLabel(20).tone).toBe("ok");
  });
  it("น้ำหนักล่าสุด + ต่างจากครั้งก่อน", () => {
    const w = (id: string, date: string, kg: number) => ({ ...base, id, cat_id: CAT, date, weight_kg: kg, note: null });
    expect(latestWeight([w("a", "2026-10-01", 4), w("b", "2026-11-01", 4.2)], CAT)).toEqual({ kg: 4.2, date: "2026-11-01", diff: 0.2 });
    expect(latestWeight([], CAT)).toBeNull();
  });
});
