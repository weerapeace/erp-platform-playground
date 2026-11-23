import { describe, expect, it } from "vitest";
import { applyTextStyleToField, cardFieldTextStyle, copyFieldLook, defaultCardField, defaultCardStyle, normalizeCardStyle, normalizeCardStyleMap, styledTexts, valuesFromSnapshot, CARD_PRESETS, CARD_DONE_COLOR } from "@/components/canvas-cards/card-style";

describe("card style (ตั้งค่าการ์ดบนกระดาน)", () => {
  it("normalize: ทิ้งค่าเสีย · บรรทัดใหม่ต่อท้าย · ค่าเกินช่วงถูกบีบ", () => {
    const s = normalizeCardStyle("content", { fields: [{ key: "brief", on: true, font: 999, size: "XXL", color: "red", maxLines: 99 }, { key: "nope" }], gap: 99, width: 50, align: "weird" })!;
    expect(s.fields[0]).toMatchObject({ key: "brief", font: 6, size: 14, maxLines: 20, align: "left" });
    expect(s.fields.map((f) => f.key)).toContain("title");
    expect(s.fields.find((f) => f.key === "nope")).toBeUndefined();
    expect(s).toMatchObject({ gap: 16, width: 180, doneFade: true });
  });
  it("ค่าแบบเก่า (S/M/L/XL · จัดชิดทั้งการ์ด · จุดนำหน้า) แปลงแล้วหน้าตาเท่าเดิม", () => {
    const s = normalizeCardStyle("content", { fields: [{ key: "title", on: true, font: 7, size: "L", color: "#633806" }, { key: "no", on: true, font: 6, size: "S", color: "#64748b" }, { key: "sched", size: "XL" }], align: "center", lead: "dot", gap: 4 })!;
    expect(s.fields[0]).toMatchObject({ size: 18, align: "center" });
    expect(s.fields[0].list).toBeUndefined();
    expect(s.fields[1]).toMatchObject({ size: 12, align: "center", list: "bullet" });
    expect(s.fields[2].size).toBe(22);
    const out = styledTexts(s, { title: "LY22", no: "CN-1", sched: "23 พ.ย." });
    expect(out.map((x) => x.text)).toEqual(["LY22", "• CN-1", "• 23 พ.ย."]);
  });
  it("styledTexts: ข้ามบรรทัดปิด/ว่าง · ตัดบรรทัดเกิน · แยกทีละบรรทัด (cont) · เลขนำหน้า", () => {
    const st = defaultCardStyle("content");
    st.fields = st.fields.map((f) => (f.key === "brief" ? { ...f, list: "number" as const, bold: true, highlight: "#fef08a" } : f));
    const out = styledTexts(st, { title: "LY22", no: "", sched: "23 พ.ย.", brief: "a\nb\nc\nd\ne\nf\ng" });
    expect([...new Set(out.map((x) => x.key))]).toEqual(["title", "sched", "brief"]);
    const brief = out.filter((x) => x.key === "brief");
    expect(brief.length).toBe(6);
    expect(brief[0]).toMatchObject({ text: "1. a", bold: true, highlight: "#fef08a" });
    expect(brief[0].cont).toBeUndefined();
    expect(brief[1]).toMatchObject({ text: "2. b", cont: true });
    expect(brief[5].text).toBe("… +2");
  });
  it("งานย่อยที่เสร็จ (☑) ขีดฆ่า + จาง · ปิดได้", () => {
    const st = defaultCardStyle("task");
    const out = styledTexts(st, { subs: "☑ เตรียม\n☐ ถ่าย" });
    expect(out[0]).toMatchObject({ strike: true, strokeColor: CARD_DONE_COLOR });
    expect(out[1].strike).toBeUndefined();
    const off = styledTexts({ ...st, doneFade: false }, { subs: "☑ เตรียม" });
    expect(off[0].strike).toBeUndefined();
  });
  it("ตัวตั้งค่าตัวอักษรกลาง ↔ บรรทัดการ์ด · แปรงก๊อป · ค่าเริ่มต้นต่อบรรทัด", () => {
    const f = defaultCardStyle("sku").fields[1];
    const g = applyTextStyleToField(f, { ...cardFieldTextStyle(f), size: 99, color: "#123456", underline: true, list: "bullet", font: "2" });
    expect(g).toMatchObject({ size: 25, color: "#123456", underline: true, list: "bullet", font: 2, key: "name" });
    const h = copyFieldLook(g, { ...defaultCardStyle("sku").fields[0], on: false });
    expect(h).toMatchObject({ key: "code", on: false, size: 25, underline: true });
    expect(defaultCardField("sku", "name", { ...g, on: false })).toMatchObject({ on: false, size: 14, color: "#1e293b" });
  });
  it("แบบสำเร็จรูป + ค่าจาก snapshot", () => {
    const mini = CARD_PRESETS.find((p) => p.key === "mini")!.apply(defaultCardStyle("task"), "task");
    expect(mini.fields.filter((f) => f.on).length).toBe(3);
    expect(valuesFromSnapshot("sku", { code: "A", name: "B", price: 890 }).price).toBe("฿890");
    expect(Object.keys(normalizeCardStyleMap({ content: {}, bogus: {} }))).toEqual(["content"]);
  });
});
