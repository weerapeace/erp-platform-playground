import { describe, it, expect } from "vitest";
import { normalizeBlocks } from "../website-blocks";
import { matchShowIf, POS9_OPTIONS, SECTION_SCHEMAS } from "../website-schema";

/** 📂 หมวดสินค้า: ชื่อบนรูป 9 จุด + เลื่อนละเอียด · ชื่อนอกรูป เหนือ/ใต้ */
describe("หมวดสินค้า: ตำแหน่งชื่อหมวด", () => {
  const field = (k: string) => SECTION_SCHEMAS.categories.fields.find((f) => f.key === k)!;

  it("ข้อมูลเก่า = ชื่อบนรูป ตำแหน่งเดิม ไม่เลื่อน", () => {
    const [b] = normalizeBlocks([{ id: "c1", type: "categories", layout: "tile", textPos: "bottom-left" }]) as unknown as Record<string, unknown>[];
    expect([b.namePlace, b.textPos, b.nameDx, b.nameDy, b.nameAlign, b.nameGap]).toEqual(["on", "bottom-left", 0, 0, "left", 10]);
  });

  it("เก็บค่าใหม่ 9 จุด + นอกรูป · เลื่อนเกินขอบ = ตัด · ค่าแปลก = ค่าเริ่ม", () => {
    const [a, c] = normalizeBlocks([
      { id: "c2", type: "categories", layout: "tile", textPos: "bottom-right", nameDx: -99, nameDy: 12 },
      { id: "c3", type: "categories", layout: "tile", namePlace: "below", nameAlign: "center", nameGap: 99, textPos: "nowhere" },
    ]) as unknown as Record<string, unknown>[];
    expect([a.textPos, a.nameDx, a.nameDy]).toEqual(["bottom-right", -30, 12]);
    expect([c.namePlace, c.nameAlign, c.nameGap, c.textPos]).toEqual(["below", "center", 40, "top-left"]);
  });

  it("แผงโชว์ช่องตามที่เลือก: บนรูป = 9 จุด/เลื่อน · นอกรูป = จัดชื่อ/ระยะห่าง", () => {
    const on = { layout: "tile", namePlace: "on" };
    const out = { layout: "tile", namePlace: "above" };
    expect([matchShowIf(field("textPos"), on), matchShowIf(field("nameDx"), on), matchShowIf(field("nameAlign"), on)]).toEqual([true, true, false]);
    expect([matchShowIf(field("textPos"), out), matchShowIf(field("tileText"), out), matchShowIf(field("nameGap"), out)]).toEqual([false, false, true]);
  });

  it("ตาราง 9 จุด เรียงแถวบน→ล่าง ซ้าย→ขวา · ค่าเดิม 3 ตัวยังอยู่", () => {
    expect(POS9_OPTIONS.map((o) => o.v)).toEqual(["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"]);
    expect(field("textPos").display).toBe("pos9");
  });
});
