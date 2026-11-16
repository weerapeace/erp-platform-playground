import { describe, expect, it } from "vitest";
import { costLineFromNote, guessNoteItem, parseNoteDims } from "../note-dims";
import type { CostItemLike } from "../design-sheet-cost-row";

describe("parseNoteDims", () => {
  it("อ่านแถว + จัดกลุ่มตามลำดับ · ตัดค่าเพี้ยน · ขนาดไม่ครบ = ไม่แน่ใจ", () => {
    const d = parseNoteDims(JSON.stringify({ rows: [
      { group: "PU ชิ้น 1", name: "", w: 10.5, h: 2.4, qty: 2 },
      { group: "PU ชิ้น 1", name: "ข้าง", w: "13,5", h: 13.5, qty: 0, unsure: true },
      { group: "P.U ชิ้น 2", name: "ไหมพรม", w: 15, h: null },
      { group: "P.U ชิ้น 2", name: "", w: -3, h: null },
    ], notes: "มุมขวาอ่านไม่ชัด" }));
    expect(d.rows).toHaveLength(3);
    expect(d.rows[0]).toEqual({ group: "PU ชิ้น 1", name: "", w: 10.5, h: 2.4, qty: 2, unsure: false });
    expect(d.rows[1]).toMatchObject({ w: 13.5, qty: 1, unsure: true });
    expect(d.rows[2]).toMatchObject({ name: "ไหมพรม", w: 15, h: null, unsure: true });
    expect(d.groups).toEqual(["PU ชิ้น 1", "P.U ชิ้น 2"]);
    expect(d.notes).toBe("มุมขวาอ่านไม่ชัด");
  });
  it("คำตอบพัง = ว่าง ไม่ล้ม", () => {
    expect(parseNoteDims("ขอโทษครับ").rows).toEqual([]);
    expect(parseNoteDims(null).rows).toEqual([]);
  });
});

describe("guessNoteItem", () => {
  const items = [{ id: "a", name: "หนัง PU ส้ม 1.2mm", group_name: "หนังเทียม" }, { id: "b", name: "หนัง PU", group_name: "หนังเทียม" }, { id: "c", name: "ผ้าซับใน", group_name: "ผ้า" }];
  it("ตัด 'ชิ้น 1' และจุดออก แล้วเลือกตัวที่ชื่อสั้นสุด", () => {
    expect(guessNoteItem("P.U ชิ้น 2", items)?.id).toBe("b");
    expect(guessNoteItem("ผ้าซับใน", items)?.id).toBe("c");
  });
  it("ไม่เจอ / ว่าง = null", () => {
    expect(guessNoteItem("ซิป", items)).toBeNull();
    expect(guessNoteItem("", items)).toBeNull();
  });
});

describe("costLineFromNote", () => {
  const piece: CostItemLike = { id: "p", name: "PU ชิ้น", price_per_unit: 100, uom: null, face_width_cm: null, width_cm: 10, length_cm: 10,
    group_name: "ผ้า (ชิ้น)", group_code: "fabric_piece", calc_method: null, loss_percent: 0, divisor: null, uom_default: null };
  it("มีวัตถุดิบ → คิดพื้นที่ × จำนวนชิ้น ด้วยสูตรกลาง", () => {
    const l = costLineFromNote({ name: "สาย", w: 10, h: 2, qty: 2 }, piece, 0, "BAG01");
    expect(l).toMatchObject({ item_id: "p", width_cm: 10, length_cm: 2, pieces: 2, note: "สาย", parent_code: "BAG01", qty: 40, amount: 40 });
  });
  it("ไม่เลือกวัตถุดิบ → บรรทัดว่างที่มีขนาด (ยอดว่าง)", () => {
    const l = costLineFromNote({ name: "", w: 9, h: 6.5, qty: 1 }, null, 3, null);
    expect(l).toMatchObject({ item_id: null, width_cm: 9, length_cm: 6.5, pieces: 1, note: null, sort_order: 4, amount: null });
  });
});
