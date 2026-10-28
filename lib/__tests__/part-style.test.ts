import { describe, it, expect } from "vitest";
import { DEFAULT_ACCOUNT_LOOK, DEFAULT_SITE_PAGE, normalizeAccount, normalizePartStyles, normalizeSitePage } from "../website-site-design";
import { ACCOUNT_PARTS, PART_GROUP_FIELDS } from "../website-page-parts";

/** 🎨 ชุดปรับหน้าตาชิ้นส่วน (ของกลาง) + 👤 หน้าบัญชีของฉัน — ตัวตรวจค่า (มิเรอร์กับเว็บร้าน) */
describe("normalizePartStyles", () => {
  it("รับเฉพาะค่าที่รู้จัก · บีบตัวเลขให้อยู่ในช่วง · สีต้องเป็นชื่อสีร้าน/hex/none", () => {
    const r = normalizePartStyles({
      "acc.name": { all: { size: 500, weight: 650, color: "brand", bg: "red", font: "Kanit", align: "center", upper: true, junk: 1 }, mobile: { size: 3, color: "#ABCDEF" } },
      "acc.tab": { all: { radius: 999, activeBg: "none", shadow: 9 } },
    });
    expect(r["acc.name"].all).toEqual({ size: 120, weight: 650, color: "brand", font: "Kanit", align: "center", upper: true });
    expect(r["acc.name"].mobile).toEqual({ size: 8, color: "#ABCDEF" });
    expect(r["acc.tab"].all).toEqual({ radius: 999, shadow: 3, activeBg: "none" });
  });
  it("คีย์แปลก/ค่าว่าง/ฟอนต์อันตราย ถูกตัดทิ้ง", () => {
    const r = normalizePartStyles({ "Bad Key": { all: { size: 12 } }, 'acc.x"]{}': { all: { size: 12 } }, "acc.empty": { all: {} }, "acc.ok": { all: { font: "Kanit;}body{" } } });
    expect(r).toEqual({});
    expect(normalizePartStyles(null)).toEqual({});
  });
});

describe("normalizeAccount", () => {
  it("ไม่มีค่า = หน้าตาเดิม (ค่าเริ่ม)", () => {
    expect(normalizeAccount(undefined)).toEqual(DEFAULT_ACCOUNT_LOOK);
    expect(normalizeSitePage({}).account).toEqual(DEFAULT_SITE_PAGE.account);
  });
  it("แท็บ: ครบ 6 ไม่ซ้ำ · ซ่อนโปรไฟล์ไม่ได้ · แท็บแรกที่ถูกซ่อน = กลับเป็นออเดอร์", () => {
    const a = normalizeAccount({ tabs: [{ key: "wishlist", label: "ของที่ชอบ", hidden: true }, { key: "wishlist" }, { key: "profile", hidden: true }, { key: "hack" }], firstTab: "wishlist" });
    expect(a.tabs.map((t) => t.key)).toEqual(["wishlist", "profile", "orders", "points", "coupons", "addresses"]);
    expect(a.tabs[0]).toMatchObject({ label: "ของที่ชอบ", hidden: true });
    expect(a.tabs[1].hidden).toBe(false);
    expect(a.firstTab).toBe("orders");
  });
  it("ลิงก์ปุ่มตอนว่าง รับเฉพาะ /หน้าในเว็บ หรือ https://", () => {
    const a = normalizeAccount({ empty: { orders: { text: "ยังไม่มี", button: "ช้อป", href: "javascript:alert(1)" }, wishlist: { href: "//evil.com" }, addresses: { href: "/shop" } } });
    expect(a.empty.orders).toEqual({ text: "ยังไม่มี", button: "ช้อป", href: "" });
    expect(a.empty.wishlist.href).toBe("");
    expect(a.empty.addresses.href).toBe("/shop");
  });
});

describe("ทะเบียนชิ้นส่วน หน้าบัญชี", () => {
  it("คีย์ไม่ซ้ำ ผ่านตัวตรวจคีย์ และทุกกลุ่มมีช่อง", () => {
    const keys = ACCOUNT_PARTS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const probe = Object.fromEntries(keys.map((k) => [k, { all: { size: 12 } }]));
    expect(Object.keys(normalizePartStyles(probe))).toEqual(keys);
    for (const p of ACCOUNT_PARTS) for (const g of p.groups) expect(PART_GROUP_FIELDS[g].length).toBeGreaterThan(0);
  });
});
