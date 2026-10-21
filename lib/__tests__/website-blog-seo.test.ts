import { describe, it, expect } from "vitest";
import { cleanRedirects } from "../website-site-info";
import { cleanListingSeo } from "../website-listing-patch";
import { cleanPageMeta, pageLive } from "../website-help-center";

/** 📝 บล็อก · ⏰ ตั้งเวลา · 🔀 ย้ายลิงก์ · 🔎 SEO รายสินค้า (ชุด 7 · 2026-10-22) */
describe("🔀 ย้ายลิงก์เก่า", () => {
  it("รับหลายรูปแบบ (-> → => เว้นวรรค) · ตัด / ท้าย · ตัดซ้ำ/วนตัวเอง/หน้าแรก · ลิงก์ใหม่ = /… หรือ https", () => {
    const raw = ["/products/roar-bag -> /product/roar01", "/old/ → /new", "/a  /b", "/a -> /c", "/same -> /same/", "/ -> /shop", "javascript:x -> /y", "/x -> javascript:alert(1)", "/ext => https://shop.co/p"].join("\n");
    expect(cleanRedirects(raw)).toBe(["/products/roar-bag -> /product/roar01", "/old -> /new", "/a -> /b", "/ext -> https://shop.co/p"].join("\n"));
    expect(cleanRedirects(null)).toBe("");
  });
});

describe("🔎 SEO รายสินค้า", () => {
  it("ตัดแท็ก/ช่องว่างซ้ำ · จำกัดความยาว · ว่างหมด = null (ใช้ชื่อสินค้าตามเดิม)", () => {
    expect(cleanListingSeo({ title: "  กระเป๋า <b>หนัง</b>  แท้ ", description: "x".repeat(400) })).toEqual({ title: "กระเป๋า หนัง แท้", description: "x".repeat(320), title_en: "", description_en: "" });
    expect(cleanListingSeo({ title: " ", description: "" })).toBeNull();
    expect(cleanListingSeo(null)).toBeNull();
  });
});

describe("📝 บทความ + ⏰ ตั้งเวลาเผยแพร่", () => {
  it("ข้อมูลบทความ: รูปปกต้องเป็น r2 key ปลอดภัย · แท็กตัดซ้ำ ≤10 · เวลาอ่านไม่ได้ = ว่าง", () => {
    const m = cleanPageMeta({ cover: "storefront/blog/a.jpg", tags: "หนัง, ของขวัญ, หนัง", publishAt: "2026-11-01T09:00:00+07:00", bare: true, author: "ทีมงาน" });
    expect(m).toMatchObject({ cover: "storefront/blog/a.jpg", tags: ["หนัง", "ของขวัญ"], publishAt: "2026-11-01T02:00:00.000Z", bare: true, author: "ทีมงาน" });
    expect(cleanPageMeta({ cover: "../../etc/passwd" }).cover).toBe("");
    expect(cleanPageMeta({ cover: "https://evil.com/x.jpg" }).cover).toBe("");
    expect(cleanPageMeta({ publishAt: "พรุ่งนี้" }).publishAt).toBe("");
    expect(cleanPageMeta({}).bare).toBe(false);
  });

  it("ถึงเวลาแล้วถึงโชว์ · ไม่ตั้งเวลา = โชว์เลย", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    expect(pageLive({ publishAt: "" }, now)).toBe(true);
    expect(pageLive({ publishAt: "2026-10-22T09:59:00.000Z" }, now)).toBe(true);
    expect(pageLive({ publishAt: "2026-10-23T00:00:00.000Z" }, now)).toBe(false);
  });
});
