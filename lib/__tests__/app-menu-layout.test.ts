import { describe, it, expect } from "vitest";
import { applyAppOverrides, mergeAppOverride, menuPlace, moreLabelOf, planLayoutSave } from "@/lib/app-menu-layout";

const m = (id: string, sort_order: number, app_overrides?: unknown) => ({ id, label: id, section: "หมวด", sort_order, app_overrides });

describe("จัดเรียง / ซ่อนเมนูต่อแอป", () => {
  it("ไม่ตั้งค่า = อยู่บนแถบ เรียงตาม sort_order กลาง", () => {
    expect(menuPlace(m("a", 10), "tasks")).toBe("bar");
    expect(menuPlace(m("a", 10, { tasks: { place: "อะไรก็ไม่รู้" } }), "tasks")).toBe("bar");
    expect(applyAppOverrides([m("b", 20), m("a", 10)], "tasks").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("ค่าของแอปหนึ่งไม่กระทบอีกแอป", () => {
    const sku = m("sku", 10, { tasks: { sort: 90, place: "more" } });
    expect(menuPlace(sku, "tasks")).toBe("more");
    expect(menuPlace(sku, "purchasing")).toBe("bar");
    expect(applyAppOverrides([sku, m("x", 20)], "tasks").map((x) => x.id)).toEqual(["x", "sku"]);
    expect(applyAppOverrides([sku, m("x", 20)], "purchasing").map((x) => x.id)).toEqual(["sku", "x"]);
  });

  it("ใช้ชื่อ/หมวดที่แอปตั้งเอง", () => {
    const [r] = applyAppOverrides([m("a", 10, { fin: { label: "ขาย", section: "เงินเข้า" } })], "fin");
    expect(r.label).toBe("ขาย");
    expect(r.section).toBe("เงินเข้า");
  });

  it("รวมค่าใหม่ไม่ทับของแอปอื่น · place bar = ล้างออก · ว่างหมด = ลบ key แอป", () => {
    const raw = { fin: { label: "ขาย" }, tasks: { section: "งาน", place: "more" } };
    expect(mergeAppOverride(raw, "tasks", { sort: 30 })).toEqual({ fin: { label: "ขาย" }, tasks: { section: "งาน", place: "more", sort: 30 } });
    expect(mergeAppOverride(raw, "tasks", { place: "bar" })).toEqual({ fin: { label: "ขาย" }, tasks: { section: "งาน" } });
    expect(mergeAppOverride({ tasks: { place: "hidden" } }, "tasks", { place: "bar" })).toEqual({});
    expect(mergeAppOverride(null, "tasks", { place: "hidden", sort: 12.6 })).toEqual({ tasks: { place: "hidden", sort: 13 } });
  });

  it("แผนบันทึก: ลำดับเดิมตรงอยู่แล้ว = ไม่เขียนลำดับ เขียนแค่ที่อยู่ที่เปลี่ยน", () => {
    const items = [m("a", 10), m("b", 20), m("c", 30)];
    expect(planLayoutSave(items, "tasks", ["a", "b", "c"], { a: "bar", b: "more", c: "bar" })).toEqual([{ id: "b", set: { place: "more" } }]);
    expect(planLayoutSave(items, "tasks", ["a", "b", "c"], {})).toEqual([]);
  });

  it("แผนบันทึก: ลากสลับ / ลำดับซ้ำ → ให้เลขใหม่ 10,20,30 เฉพาะตัวที่เปลี่ยน", () => {
    const items = [m("a", 10), m("b", 20), m("c", 30)];
    expect(planLayoutSave(items, "tasks", ["c", "a", "b"], {})).toEqual([
      { id: "c", set: { sort: 10 } }, { id: "a", set: { sort: 20 } }, { id: "b", set: { sort: 30 } },
    ]);
    // SKUs กับ งานทั้งหมด ลำดับ 10 เท่ากัน → ต้องแยกให้ชัด
    const tie = [m("sku", 10), m("all", 10), m("camp", 30)];
    expect(planLayoutSave(tie, "tasks", ["sku", "all", "camp"], {})).toEqual([{ id: "all", set: { sort: 20 } }]);
  });

  it("ชื่อปุ่มรวมเมนู ว่าง = เพิ่มเติม", () => {
    expect(moreLabelOf(null)).toBe("เพิ่มเติม");
    expect(moreLabelOf({ menu_more_label: "  " })).toBe("เพิ่มเติม");
    expect(moreLabelOf({ menu_more_label: "อื่น ๆ" })).toBe("อื่น ๆ");
  });
});
