import { describe, expect, it } from "vitest";
import { formHiddenTabsKey, parseHiddenTabs, toggleHiddenTab, visibleTabKeys } from "@/lib/form-tab-prefs";

const KEYS = ["core", "content", "x:web", "x:platforms", "system"];

describe("form-tab-prefs", () => {
  it("key แยกตามโมดูล", () => {
    expect(formHiddenTabsKey("parent-skus-v2")).toBe("form_hidden_tabs:parent-skus-v2");
  });

  it("อ่านค่า: ไม่ใช่ array = null · กรองค่าที่ไม่ใช่ข้อความ", () => {
    expect(parseHiddenTabs({})).toBeNull();
    expect(parseHiddenTabs(["x:web", 3, "", null])).toEqual(["x:web"]);
  });

  it("ซ่อนแท็บที่ติ๊กออก คงลำดับเดิม", () => {
    expect(visibleTabKeys(KEYS, ["x:web", "system"])).toEqual(["core", "content", "x:platforms"]);
  });

  it("ซ่อนหมด = เหลือแท็บแรก 1 แท็บ (ไม่ให้ลิ้นชักว่าง)", () => {
    expect(visibleTabKeys(KEYS, KEYS)).toEqual(["core"]);
    expect(visibleTabKeys([], ["core"])).toEqual([]);
  });

  it("สลับซ่อน/โชว์ + ตัดคีย์ของแท็บที่ไม่มีแล้ว", () => {
    expect(toggleHiddenTab(KEYS, ["old_tab"], "x:web")).toEqual(["x:web"]);
    expect(toggleHiddenTab(KEYS, ["x:web", "system"], "x:web")).toEqual(["system"]);
  });
});
