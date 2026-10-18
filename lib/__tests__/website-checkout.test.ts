import { describe, it, expect } from "vitest";
import { normalizeCheckout, checkoutText, trustItems, DEFAULT_CHECKOUT } from "../website-checkout";
import { normalizeTheme, mergeTheme } from "../website-theme";

/** 💳 ดีไซน์หน้าชำระเงิน (theme.checkout) */
describe("normalizeCheckout", () => {
  it("ไม่มีค่า = หน้าตาเดิม (ข้อความว่าง = ค่าเริ่มต้น)", () => {
    expect(normalizeCheckout(undefined)).toEqual(DEFAULT_CHECKOUT);
    expect(DEFAULT_CHECKOUT).toMatchObject({ layout: "right", boxStyle: "card", email: "opt", note: "show", trust: false });
  });

  it("ค่าแปลก ๆ = ค่าเริ่มต้น · ข้อความตัดตามเพดาน", () => {
    const c = normalizeCheckout({ layout: "diagonal", email: "req", addressDetail: "hide", note: "hide", trust: "yes", title: "x".repeat(200) });
    expect(c.layout).toBe("right");
    expect(c.email).toBe("req");
    expect(c.addressDetail).toBe("opt"); // ตำบล/อำเภอ ซ่อนไม่ได้
    expect(c.note).toBe("hide");
    expect(c.trust).toBe(false);
    expect(c.title).toHaveLength(60);
  });
});

describe("checkoutText", () => {
  it("ว่าง = ค่าเริ่มต้นตามภาษา · {shop} = ชื่อร้าน", () => {
    expect(checkoutText(DEFAULT_CHECKOUT, "confirmText", "th")).toBe("ยืนยันคำสั่งซื้อ");
    expect(checkoutText(DEFAULT_CHECKOUT, "confirmText", "en")).toBe("Place order");
    expect(checkoutText(DEFAULT_CHECKOUT, "thanksText", "th", "Louis Montini")).toBe("ขอบคุณที่อุดหนุน Louis Montini");
  });
  it("ตั้งเองชนะ (ตัดช่องว่างหัวท้าย)", () => {
    const c = normalizeCheckout({ confirmText: "  สั่งเลย  ", thanksText: "ขอบคุณจาก {shop} ค่ะ" });
    expect(checkoutText(c, "confirmText", "en")).toBe("สั่งเลย");
    expect(checkoutText(c, "thanksText", "th", "LM")).toBe("ขอบคุณจาก LM ค่ะ");
  });
});

describe("trustItems", () => {
  it("คั่นด้วย · หรือขึ้นบรรทัด · ตัดข้อว่าง · ไม่เกิน 5 ข้อ", () => {
    expect(trustItems("ปลอดภัย · ส่งไว ·  · คืนได้")).toEqual(["ปลอดภัย", "ส่งไว", "คืนได้"]);
    expect(trustItems("a\nb·c·d·e·f·g")).toHaveLength(5);
  });
});

describe("ธีม", () => {
  it("theme.checkout ผ่าน normalizeTheme + mergeTheme (บันทึกติด) + เก็บคำแปล _en", () => {
    const t = normalizeTheme({ checkout: { layout: "left", confirmText: "สั่งซื้อ", confirmText_en: "Buy now" } });
    expect(t.checkout.layout).toBe("left");
    expect((t.checkout as unknown as Record<string, unknown>).confirmText_en).toBe("Buy now");
    const merged = mergeTheme({ vars: { x: 1 } }, { checkout: { boxStyle: "flat" } }) as { checkout: { boxStyle: string }; vars: unknown };
    expect(merged.checkout.boxStyle).toBe("flat");
    expect(merged.vars).toEqual({ x: 1 });
  });
});
