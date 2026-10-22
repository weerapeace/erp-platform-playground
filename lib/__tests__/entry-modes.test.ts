import { describe, expect, it } from "vitest";
import {
  ENTRY_MODE_DEFAULTS, IMAGES_KEY, computeModeProgress, isValueFilled, modeAppliesTo, modeVisibleTo,
  normalizeEntryModes, resolveEntryModes, type EntryMode,
} from "@/lib/entry-modes";

const mode: EntryMode = {
  key: "web", label: "ลงเว็บ",
  items: [
    { field: "name_th", level: "required" },
    { field: "name_en", level: "required" },
    { field: "fits", level: "recommended" },
  ],
  imagesMin: 3, imagesLevel: "required",
};

describe("entry modes — นับความครบ", () => {
  it("ค่าว่าง/ขีด/รายการว่าง = ยังไม่ลง · ติ๊ก = ต้องเป็นใช่", () => {
    expect(isValueFilled("")).toBe(false);
    expect(isValueFilled("  - ")).toBe(false);
    expect(isValueFilled("N/A")).toBe(false);
    expect(isValueFilled([])).toBe(false);
    expect(isValueFilled({})).toBe(false);
    expect(isValueFilled(false)).toBe(false);
    expect(isValueFilled(0)).toBe(true);
    expect(isValueFilled("11.200")).toBe(true);
    expect(isValueFilled([{ k: "phone" }])).toBe(true);
  });

  it("แยกนับ ต้องมี/แนะนำ + จำนวนรูป", () => {
    const p = computeModeProgress(mode, { name_th: "กระเป๋า", name_en: "", fits: null }, { imageCount: 1 });
    expect(p.reqTotal).toBe(3);   // ชื่อไทย + ชื่ออังกฤษ + รูป
    expect(p.reqDone).toBe(1);
    expect(p.recTotal).toBe(1);
    expect(p.missing.map((m) => m.key)).toEqual(["name_en", "fits", IMAGES_KEY]);
    expect(p.pct).toBe(25);
  });

  it("ช่องที่ข้าม (ประเภทสินค้าซ่อน) ไม่นับ · ยังไม่รู้จำนวนรูป = ไม่นับรูป", () => {
    const p = computeModeProgress(mode, { name_th: "x", name_en: "y" }, { skip: (f) => f === "fits", imageCount: null });
    expect(p.total).toBe(2);
    expect(p.done).toBe(2);
    expect(p.missing).toEqual([]);
    expect(p.pct).toBe(100);
  });

  it("สิทธิ์เห็นโหมด + ใช้กับประเภทสินค้า", () => {
    const m: EntryMode = { ...mode, roles: ["manager"], families: ["fam1"] };
    expect(modeVisibleTo(m, "staff")).toBe(false);
    expect(modeVisibleTo(m, "manager")).toBe(true);
    expect(modeVisibleTo(m, "admin")).toBe(true);
    expect(modeAppliesTo(m, ["fam2"])).toBe(false);
    expect(modeAppliesTo(m, ["fam2", "fam1"])).toBe(true);
    expect(modeAppliesTo(mode, [])).toBe(true);
  });
});

describe("entry modes — ทำความสะอาดค่าที่บันทึก", () => {
  it("ตัดโหมดไม่มีชื่อ · ช่องซ้ำ · key ซ้ำ · ระดับแปลก ๆ = ต้องมี", () => {
    const out = normalizeEntryModes([
      { key: "a", label: "A", items: [{ field: "x", level: "weird" }, { field: "x", level: "recommended" }, { field: "" }] },
      { key: "a", label: "B", items: [], imagesMin: "4", imagesLevel: "recommended" },
      { key: "c", label: "  ", items: [] },
      "junk",
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].items).toEqual([{ field: "x", level: "required" }]);
    expect(out[1].key).not.toBe("a");
    expect(out[1].imagesMin).toBe(4);
    expect(out[1].imagesLevel).toBe("recommended");
  });

  it("ไม่เคยตั้ง = ชุดตั้งต้น · ตั้งเป็นว่าง = ไม่มีโหมด", () => {
    expect(resolveEntryModes("parent-skus-v2", undefined)).toBe(ENTRY_MODE_DEFAULTS["parent-skus-v2"]);
    expect(resolveEntryModes("parent-skus-v2", [])).toEqual([]);
    expect(resolveEntryModes("unknown-module", undefined)).toEqual([]);
  });

  it("ชุดตั้งต้นผ่านการทำความสะอาดโดยไม่เปลี่ยน", () => {
    const d = ENTRY_MODE_DEFAULTS["parent-skus-v2"];
    expect(normalizeEntryModes(d)).toEqual(d);
  });
});
