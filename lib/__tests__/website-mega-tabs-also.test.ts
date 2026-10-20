import { describe, it, expect } from "vitest";
import { normalizeMegaPanel, megaTabCols, megaViewAllCard, megaLinkIssue, megaCategoryKeyOf } from "../website-mega-menu";
import { categoryHref, categoryAlsoOf, categoryKeyOf } from "../website-links";
import { menuItemHref, normalizeMenu } from "../website-theme";

/** 🧭 แผงเมนูแบบ C: การ์ดต่อแถวอัตโนมัติ + การ์ด "ดูทั้งหมด" */
describe("แผงแบบแท็บ: อัตโนมัติ + การ์ดดูทั้งหมด", () => {
  it("อัตโนมัติ (0) = เต็มแถวตามจำนวนการ์ด สูงสุด 6 · ตั้งเลข = ตามนั้น", () => {
    expect(megaTabCols(0, 3)).toBe(3);
    expect(megaTabCols(0, 2)).toBe(2);
    expect(megaTabCols(0, 1)).toBe(1);
    expect(megaTabCols(0, 9)).toBe(6);
    expect(megaTabCols(0, 0)).toBe(1);
    expect(megaTabCols(4, 2)).toBe(4);
  });

  it("เก็บค่าอัตโนมัติ (0) ได้ · ค่าเก่า/เกินช่วง = ปกติ · การ์ดดูทั้งหมดตั้งต้นปิด", () => {
    const p = normalizeMegaPanel({ template: "C", cardsPerRow: 0, tabs: [] })!;
    expect(p.cardsPerRow).toBe(0);
    expect(normalizeMegaPanel({ template: "C", cardsPerRow: 9 })!.cardsPerRow).toBe(6);
    expect(normalizeMegaPanel({ template: "C" })!.cardsPerRow).toBe(4);
    expect(p).toMatchObject({ viewAllCard: false, viewAllCardLabel: "", viewAllCardImageKey: null });
    const on = normalizeMegaPanel({ template: "C", viewAllCard: true, viewAllCardLabel: "ดูทั้งหมด", viewAllCardImageKey: "storefront/x.jpg" })!;
    expect(on).toMatchObject({ viewAllCard: true, viewAllCardLabel: "ดูทั้งหมด", viewAllCardImageKey: "storefront/x.jpg" });
  });

  it("การ์ดดูทั้งหมด → ลิงก์ของแท็บ (ไม่มี = ลิงก์ของเมนู) · ปิด/ไม่มีลิงก์ = ไม่มีการ์ด", () => {
    const p = { viewAllCard: true, viewAllCardLabel: "", viewAllCardImageKey: null };
    expect(megaViewAllCard(p, "/c/bags", "/shop")).toMatchObject({ id: "view-all", title: "ดูทั้งหมด", href: "/c/bags" });
    expect(megaViewAllCard(p, "", "/shop")?.href).toBe("/shop");
    expect(megaViewAllCard(p, "", "")).toBeNull();
    expect(megaViewAllCard({ ...p, viewAllCard: false }, "/c/bags")).toBeNull();
    expect(megaViewAllCard({ ...p, viewAllCardLabel: "See all" }, "/c/bags")?.title).toBe("See all");
  });
});

/** 📂📂 ลิงก์หมวด "ต้องอยู่ทั้ง 2 หมวด" (/c/<หมวด>?also=<หมวด2>) */
describe("ลิงก์ 2 หมวด", () => {
  it("สร้าง/อ่านลิงก์ · หมวดเดียว = ลิงก์เดิม · หมวดซ้ำกัน = หมวดเดียว", () => {
    expect(categoryHref("belts")).toBe("/c/belts");
    expect(categoryHref("belts", "men")).toBe("/c/belts?also=men");
    expect(categoryHref("belts", "belts")).toBe("/c/belts");
    expect(categoryHref("belts", "")).toBe("/c/belts");
    expect(categoryKeyOf("/c/belts?also=men")).toBe("belts");
    expect(megaCategoryKeyOf("/c/belts?also=men")).toBe("belts");
    expect(categoryAlsoOf("/c/belts?also=men")).toBe("men");
    expect(categoryAlsoOf("/c/belts")).toBe("");
    expect(categoryAlsoOf("/shop?also=men")).toBe("");
  });

  it("เมนู kind category: หมวดที่ 2 อยู่ในลิงก์ · เก็บเฉพาะเมนูหมวด", () => {
    expect(menuItemHref({ kind: "category", value: "belts", also: "men" })).toBe("/c/belts?also=men");
    expect(menuItemHref({ kind: "category", value: "belts" })).toBe("/c/belts");
    const m = normalizeMenu({ items: [{ label: "เข็มขัดผู้ชาย", kind: "category", value: "belts", also: "men" }, { label: "หน้าแรก", kind: "home", value: "", also: "men" }] });
    expect(m.items?.[0].also).toBe("men");
    expect(m.items?.[1].also).toBe("");
  });

  it("เตือนเมื่อหมวดที่ 2 ไม่มีแล้ว", () => {
    const ctx = { categories: new Set(["belts", "men"]), products: new Set<string>(), pages: new Set<string>() };
    expect(megaLinkIssue("/c/belts?also=men", ctx)).toBeNull();
    expect(megaLinkIssue("/c/belts?also=kids", ctx)).toBe("หมวดที่ 2 ไม่มีแล้ว");
    expect(megaLinkIssue("/c/gone?also=men", ctx)).toBe("หมวดนี้ไม่มีแล้ว");
  });
});
