import { describe, expect, it } from "vitest";
import { defaultCardStyle, normalizeCardStyle, normalizeCardStyleMap, styledTexts, valuesFromSnapshot, CARD_PRESETS } from "@/components/canvas-cards/card-style";

describe("card style (ตั้งค่าการ์ดบนกระดาน)", () => {
  it("normalize: ทิ้งค่าเสีย · บรรทัดใหม่ต่อท้าย · ค่าเกินช่วงถูกบีบ", () => {
    const s = normalizeCardStyle("content", { fields: [{ key: "brief", on: true, font: 999, size: "XXL", color: "red", maxLines: 99 }, { key: "nope" }], gap: 99, width: 50, align: "weird" })!;
    expect(s.fields[0]).toMatchObject({ key: "brief", font: 6, size: "M", maxLines: 20 });
    expect(s.fields.map((f) => f.key)).toContain("title");
    expect(s.fields.find((f) => f.key === "nope")).toBeUndefined();
    expect(s).toMatchObject({ gap: 16, width: 180, align: "left" });
  });
  it("styledTexts: ข้ามบรรทัดปิด/ว่าง · ตัดบรรทัดเกิน · จุดนำหน้าไม่ใส่บรรทัดแรก", () => {
    const st = { ...defaultCardStyle("content"), lead: "dot" as const };
    const out = styledTexts(st, { title: "LY22", no: "", sched: "23 พ.ย.", brief: "a\nb\nc\nd\ne\nf\ng" });
    expect(out.map((x) => x.key)).toEqual(["title", "sched", "brief"]);
    expect(out[0].text).toBe("LY22");
    expect(out[1].text).toBe("• 23 พ.ย.");
    expect(out[2].text.split("\n").length).toBe(6);
  });
  it("แบบสำเร็จรูป + ค่าจาก snapshot", () => {
    const mini = CARD_PRESETS.find((p) => p.key === "mini")!.apply(defaultCardStyle("task"), "task");
    expect(mini.fields.filter((f) => f.on).length).toBe(3);
    expect(valuesFromSnapshot("sku", { code: "A", name: "B", price: 890 }).price).toBe("฿890");
    expect(Object.keys(normalizeCardStyleMap({ content: {}, bogus: {} }))).toEqual(["content"]);
  });
});
