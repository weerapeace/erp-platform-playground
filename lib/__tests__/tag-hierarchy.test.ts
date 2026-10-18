import { describe, it, expect } from "vitest";
import { ancestorTagsOf, parentTagOf, parentTagOfGroup, subGroupOfTag, sameTagName } from "@/lib/tag-hierarchy";

// โครงเหมือนข้อมูลจริง: หมวดหมู่สินค้า → ↳ กระเป๋า (ผูกกับแท็ก กระเป๋า) · วัตถุดิบ → ↳ ซิป
const groups = [
  { id: "g-cat", name: "หมวดหมู่สินค้า", parent_group_id: null },
  { id: "g-bag", name: "กระเป๋า", parent_group_id: "g-cat" },
  { id: "g-mat", name: "วัตถุดิบ", parent_group_id: null },
  { id: "g-zip", name: " ซิป ", parent_group_id: "g-mat" },          // ช่องว่างเกิน = ยังจับคู่ได้
  { id: "g-other", name: "ไม่มีแท็กแม่", parent_group_id: "g-cat" },
];
const tags = [
  { id: "t-bag", name: "กระเป๋า", group_id: "g-cat" },
  { id: "t-wallet", name: "กระเป๋าสตางค์", group_id: "g-cat" },
  { id: "t-backpack", name: "กระเป๋าเป้", group_id: "g-bag" },
  { id: "t-zip", name: "ซิป", group_id: "g-mat" },
  { id: "t-zip3", name: "ซิปไนล่อน #3", group_id: "g-zip" },
  { id: "t-orphan", name: "ลอย", group_id: "g-other" },
  { id: "t-none", name: "ไม่มีกลุ่ม", group_id: null },
];
const nameOf = (t: { name: string }) => t.name;

describe("tag-hierarchy", () => {
  it("แท็กในหมวดย่อยชื่อเดียวกับแท็ก = แท็กย่อยของแท็กนั้น", () => {
    expect(parentTagOf("t-backpack", tags, groups, nameOf)?.id).toBe("t-bag");
    expect(parentTagOf("t-zip3", tags, groups, nameOf)?.id).toBe("t-zip");
  });

  it("แท็กชั้นบน / ไม่มีกลุ่ม / หมวดย่อยที่ไม่มีแท็กชื่อตรง → ไม่มีแท็กแม่", () => {
    expect(parentTagOf("t-bag", tags, groups, nameOf)).toBeNull();
    expect(parentTagOf("t-none", tags, groups, nameOf)).toBeNull();
    expect(parentTagOf("t-orphan", tags, groups, nameOf)).toBeNull();
    expect(parentTagOf("ไม่มีจริง", tags, groups, nameOf)).toBeNull();
  });

  it("หาได้ทั้งสองทาง (แท็กแม่ ↔ หมวดย่อย)", () => {
    expect(subGroupOfTag("กระเป๋า", "g-cat", groups)?.id).toBe("g-bag");
    expect(subGroupOfTag("กระเป๋าสตางค์", "g-cat", groups)).toBeNull();
    expect(subGroupOfTag("กระเป๋า", null, groups)).toBeNull();
    expect(parentTagOfGroup(groups[3], tags, nameOf)?.id).toBe("t-zip");
    expect(parentTagOfGroup(groups[0], tags, nameOf)).toBeNull();
  });

  it("ancestorTagsOf ไล่ขึ้นทุกชั้น และไม่วนไม่จบ", () => {
    // ชั้น 3: ↳ ซิป → ↳↳ ซิปไนล่อน #3 (หมวดย่อยซ้อน) → แท็กในนั้นมีแม่ 2 ชั้น
    const g2 = [...groups, { id: "g-zip3", name: "ซิปไนล่อน #3", parent_group_id: "g-zip" }];
    const t2 = [...tags, { id: "t-zip3-teeth", name: "ฟันซิป", group_id: "g-zip3" }];
    expect(ancestorTagsOf("t-zip3-teeth", t2, g2, nameOf).map((t) => t.id)).toEqual(["t-zip3", "t-zip"]);
    // กลุ่มวนกันเอง (ข้อมูลเสีย) ต้องไม่ค้าง
    const loopG = [{ id: "a", name: "A", parent_group_id: "b" }, { id: "b", name: "B", parent_group_id: "a" }];
    const loopT = [{ id: "tA", name: "A", group_id: "b" }, { id: "tB", name: "B", group_id: "a" }];
    expect(ancestorTagsOf("tA", loopT, loopG, nameOf).length).toBeLessThanOrEqual(2);
  });

  it("sameTagName ไม่สนช่องว่าง/ตัวพิมพ์", () => {
    expect(sameTagName(" Bags ", "bags")).toBe(true);
    expect(sameTagName("กระเป๋า", "กระเป๋าเป้")).toBe(false);
  });
});
