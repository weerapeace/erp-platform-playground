import { describe, expect, it } from "vitest";
import { WEBSITE_GROUPS, WEBSITE_GROUP_STYLE, WEBSITE_TAB_META } from "../website-access";
import { erpIconDef } from "../erp-icons";

// 🧭 เมนู 2 ชั้นหน้าเว็บไซต์: ทุกแท็บต้องมีชื่อ+ไอคอน และไอคอนต้องมีในชุดไอคอนเส้นกลาง (ไม่งั้นช่องไอคอนว่าง)
describe("เมนูหน้าเว็บไซต์", () => {
  it("ทุกกลุ่มมีไอคอน+สี และไอคอนมีในชุดกลาง", () => {
    for (const g of WEBSITE_GROUPS) {
      const st = WEBSITE_GROUP_STYLE[g.key];
      expect(st, g.key).toBeTruthy();
      expect(erpIconDef(st.icon), `${g.key}: ${st.icon}`).not.toBeNull();
      expect(st.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("ทุกแท็บในกลุ่มมีชื่อ+ไอคอนที่มีในชุดกลาง · ไม่มีแท็บค้างที่ไม่อยู่กลุ่มไหน", () => {
    const tabs = WEBSITE_GROUPS.flatMap((g) => g.tabs);
    for (const k of tabs) {
      const m = WEBSITE_TAB_META[k];
      expect(m?.label, k).toBeTruthy();
      expect(erpIconDef(m.icon), `${k}: ${m.icon}`).not.toBeNull();
    }
    expect(Object.keys(WEBSITE_TAB_META).sort()).toEqual([...tabs].sort());
  });
});
