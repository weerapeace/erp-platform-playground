import { describe, expect, it } from "vitest";
import { dupIndexes, groupsOf, lineDupKey, NO_GROUP } from "@/lib/cost-line-pick";

describe("เลือกบรรทัดก่อนดึง — ชนิด", () => {
  it("นับตามชนิด เรียงตามที่เจอก่อน · ว่าง = ไม่ระบุชนิด", () => {
    expect(groupsOf(["ตัวเสริม", "PU", "ตัวเสริม", null, " "])).toEqual([
      { label: "ตัวเสริม", count: 2 }, { label: "PU", count: 1 }, { label: NO_GROUP, count: 2 },
    ]);
  });
});

describe("เลือกบรรทัดก่อนดึง — มีแล้ว", () => {
  const a = { item_id: "x", width_cm: 8.5, length_cm: 27.5, pieces: 2 };
  it("วัสดุ+ขนาด+จำนวนเดียวกัน = ซ้ำ · ต่างขนาด = ไม่ซ้ำ", () => {
    expect(lineDupKey(a)).toBe(lineDupKey({ ...a, width_cm: 8.5000001 }));
    expect([...dupIndexes([a, { ...a, length_cm: 27 }], [a])]).toEqual([0]);
  });
  it("ไม่มี id ใช้ชื่อ (ไม่สนตัวพิมพ์) · บรรทัดว่างไม่นับซ้ำ", () => {
    expect([...dupIndexes([{ item_name: "PU " }, {}], [{ item_name: "pu" }, {}])]).toEqual([0]);
  });
});
