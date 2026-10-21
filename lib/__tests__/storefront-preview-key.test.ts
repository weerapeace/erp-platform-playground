import { describe, it, expect, beforeAll } from "vitest";
import { issuePreviewKey, verifyPreviewKey } from "../storefront-preview-key";
import { withPreviewKey } from "../storefront-preview-link";

/** 🔑 รหัสพรีวิวเว็บร้าน (audit 2026-10-21 ขั้นที่ 5 เฟส 2) */
beforeAll(() => {
  process.env.STOREFRONT_PREVIEW_SECRET = "test-secret-for-preview-key-0123456789";
});

const H = 3600 * 1000;
const T0 = Date.UTC(2026, 9, 21, 3, 0, 0);

describe("รหัสพรีวิว", () => {
  it("ออกแล้วตรวจผ่าน · คนละร้าน = ไม่ผ่าน", () => {
    const pk = issuePreviewKey("louismontini", T0)!;
    expect(pk).toMatch(/^[0-9a-z]+\.[A-Za-z0-9_-]{32}$/);
    expect(verifyPreviewKey("louismontini", pk, T0)).toBe(true);
    expect(verifyPreviewKey("pixiedustie", pk, T0)).toBe(false);
  });

  it("รหัสเหมือนเดิมตลอดช่วง 6 ชม. (iframe ไม่รีโหลดเองตอนโหลดข้อมูลใหม่)", () => {
    const start = Date.UTC(2026, 9, 21, 0, 0, 0);
    expect(issuePreviewKey("louismontini", start + 1000)).toBe(issuePreviewKey("louismontini", start + 5 * H));
  });

  it("ใช้ได้อย่างน้อย 12 ชม. แล้วหมดอายุ", () => {
    const pk = issuePreviewKey("louismontini", T0)!;
    expect(verifyPreviewKey("louismontini", pk, T0 + 12 * H)).toBe(true);
    expect(verifyPreviewKey("louismontini", pk, T0 + 19 * H)).toBe(false);
  });

  it("แก้ลายเซ็น / แก้วันหมดอายุ / รูปแบบผิด = ไม่ผ่าน", () => {
    const pk = issuePreviewKey("louismontini", T0)!;
    const [exp, sig] = pk.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyPreviewKey("louismontini", `${exp}.${flipped}`, T0)).toBe(false);
    expect(verifyPreviewKey("louismontini", `${(parseInt(exp, 36) + 3600).toString(36)}.${sig}`, T0)).toBe(false);
    for (const bad of ["", "1", "abc.def", null, undefined, 123, "x".repeat(200)]) expect(verifyPreviewKey("louismontini", bad, T0)).toBe(false);
  });

  it("ไม่มีกุญแจลับ = ไม่ออกรหัส + ไม่ผ่านทุกรหัส", () => {
    const pk = issuePreviewKey("louismontini", T0)!;
    const saved = { a: process.env.STOREFRONT_PREVIEW_SECRET, b: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.STOREFRONT_PREVIEW_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(issuePreviewKey("louismontini", T0)).toBeNull();
      expect(verifyPreviewKey("louismontini", pk, T0)).toBe(false);
    } finally {
      process.env.STOREFRONT_PREVIEW_SECRET = saved.a;
      if (saved.b !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.b;
    }
  });

  it("ต่อ pk เข้าลิงก์ถูกที่ (มี ? / ไม่มี ? / มี #)", () => {
    expect(withPreviewKey("https://x.co/?preview=1", "a.b")).toBe("https://x.co/?preview=1&pk=a.b");
    expect(withPreviewKey("https://x.co/belt", "a.b")).toBe("https://x.co/belt?pk=a.b");
    expect(withPreviewKey("https://x.co/p?preview=1#top", "a.b")).toBe("https://x.co/p?preview=1&pk=a.b#top");
    expect(withPreviewKey("https://x.co/?preview=1", null)).toBe("https://x.co/?preview=1");
  });
});
