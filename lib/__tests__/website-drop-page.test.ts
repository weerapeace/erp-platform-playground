import { describe, it, expect } from "vitest";
import { defaultDropPageBlocks, dropPageLayout, DROP_PAGE_MAIN_ID } from "../website-drop-page";
import { blockTypesFor, normalizeBlocks, validateBlocks } from "../website-blocks";

/** 🧱 หน้าของแต่ละชุดมาใหม่ (/new/<ชุด>) */
describe("โครงตั้งต้น", () => {
  it("= Section 🆕 ชุดมาใหม่ 1 ตัว id คงที่ (เว็บร้านพรีวิววาดโครงเดียวกัน)", () => {
    const b = defaultDropPageBlocks();
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ id: DROP_PAGE_MAIN_ID, type: "drop", enabled: true, which: "this", banner: "big", showProducts: true });
    expect(validateBlocks(b).filter((i) => i.level === "error")).toEqual([]);
  });

  it("แบนเนอร์ชุด = หัวเรื่องของหน้าแล้ว (ไม่เตือนไม่มี Hero) · ปิดแบนเนอร์ = เตือนตามเดิม", () => {
    const noHero = (bs: ReturnType<typeof defaultDropPageBlocks>) => validateBlocks(bs).some((i) => i.message.includes("ไม่มีแบนเนอร์หลัก"));
    expect(noHero(defaultDropPageBlocks())).toBe(false);
    expect(noHero(normalizeBlocks([{ id: "x", type: "drop", banner: "none" }]))).toBe(true);
  });

  it("Section ชุดมาใหม่อยู่ในคลัง Section (กลุ่มสินค้า) · ค่าแปลก ๆ = ค่าเริ่มต้น", () => {
    expect(blockTypesFor(new Set()).find((t) => t.type === "drop")).toMatchObject({ label: "ชุดมาใหม่", group: "สินค้า" });
    const [b] = normalizeBlocks([{ id: "x", type: "drop", which: "อะไร", banner: "small", showProducts: false }]);
    expect(b).toMatchObject({ which: "this", banner: "small", showProducts: false });
  });
});

describe("dropPageLayout", () => {
  const pub = [{ id: "a", type: "drop", which: "this" }];
  const draft = [{ id: "b", type: "rich-text" }];
  it("ปกติ = ที่เผยแพร่ · ยังไม่จัด = null (หน้าตาเดิม)", () => {
    expect(dropPageLayout({ layout: pub, draft_layout: draft }, false)?.map((b) => b.id)).toEqual(["a"]);
    expect(dropPageLayout({ layout: null, draft_layout: draft }, false)).toBeNull();
  });
  it("พรีวิว = ร่าง (ไม่มี = ที่เผยแพร่)", () => {
    expect(dropPageLayout({ layout: pub, draft_layout: draft }, true)?.map((b) => b.id)).toEqual(["b"]);
    expect(dropPageLayout({ layout: pub, draft_layout: null }, true)?.map((b) => b.id)).toEqual(["a"]);
    expect(dropPageLayout({ layout: null, draft_layout: null }, true)).toBeNull();
  });
});
