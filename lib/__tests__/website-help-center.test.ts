import { describe, expect, it } from "vitest";
import { HELP_CENTER_PAGES, buildHelpPage, cleanPageMeta } from "@/lib/website-help-center";
import { validateBlocks } from "@/lib/website-blocks";
import { trackingOf, cleanTrackingNo } from "@/lib/parcel-tracking";
import { normalizeContactInput } from "@/lib/website-contact";
import { orderMessage } from "@/lib/customer-messages";

describe("🧭 ชุดศูนย์ช่วยเหลือ (แม่แบบ)", () => {
  const built = HELP_CENTER_PAGES.map(buildHelpPage);

  it("ครบ 6 หน้า slug ไม่ซ้ำ · ทุกหน้ามีกลุ่ม + ชื่ออังกฤษ", () => {
    expect(built.map((p) => p.slug)).toEqual(["privacy", "terms", "faq", "track", "contact", "shipping-returns"]);
    for (const p of built) {
      expect(p.seo.help).toBeTruthy();
      expect(p.seo.help_en).toBeTruthy();
      expect(p.seo.name_en).toBeTruthy();
      expect(p.blocks.length).toBeGreaterThan(0);
    }
  });

  it("ผ่านตัวทำความสะอาดโดยเนื้อหาไม่หาย (ไทย + อังกฤษ) และไม่มี error ก่อนเผยแพร่", () => {
    for (const p of built) {
      expect(validateBlocks(p.blocks, { helpPage: true }).filter((i) => i.level === "error")).toEqual([]);
      expect(validateBlocks(p.blocks, { helpPage: true }).some((i) => i.message.includes("แบนเนอร์หลัก"))).toBe(false);
    }
    const privacy = built[0].blocks[0] as unknown as { sections: { id: string; title: string; title_en?: string; body_en?: string }[]; intro_en?: string };
    expect(privacy.sections.map((s) => s.id)).toContain("delete-account"); // ลิงก์ #delete-account (Facebook Data Deletion URL)
    expect(privacy.sections.every((s) => s.title && s.title_en && s.body_en)).toBe(true);
    expect(privacy.intro_en).toContain("{shop}");
  });

  it("FAQ: คำถามจริง (ไม่ใช่ค่าตั้งต้น 'คำถาม') + หมวด 2 ภาษา", () => {
    const faq = built.find((p) => p.slug === "faq")!.blocks[0] as unknown as { items: { q: string; q_en?: string; cat: string; cat_en?: string }[] };
    expect(faq.items.length).toBe(9);
    expect(faq.items.every((i) => i.q !== "คำถาม" && i.q.endsWith("?") && i.q_en && i.cat && i.cat_en)).toBe(true);
  });

  it("นโยบายคืนสินค้า = 14 วัน (เจ้าของเลือก 2026-10-19)", () => {
    const ship = JSON.stringify(built.find((p) => p.slug === "shipping-returns")!.blocks);
    expect(ship).toContain("14 วัน");
    expect(ship).toContain("14 days");
  });

  it("cleanPageMeta: ข้อมูลเก่า (มีแค่ title/description) ได้ช่องใหม่เป็นค่าว่าง", () => {
    expect(cleanPageMeta({ title: "  A ", description: "B" })).toEqual({ title: "A", description: "B", title_en: "", description_en: "", name_en: "", help: "", help_en: "", publishAt: "", bare: false, cover: "", excerpt: "", excerpt_en: "", tags: [], author: "" });
    expect(cleanPageMeta(null).help).toBe("");
  });
});

describe("🚚 เลขพัสดุ", () => {
  it("ทำความสะอาดเลข + สร้างลิงก์ตามขนส่ง", () => {
    expect(cleanTrackingNo(" th 123-45 ")).toBe("TH123-45");
    expect(trackingOf("kerry", "kex1")).toEqual({ carrier: "kerry", carrierLabel: "Kerry Express (KEX)", number: "KEX1", url: "https://th.kex-express.com/th/track/?track=KEX1" });
    expect(trackingOf("other", "X1")?.url).toBeNull();
    expect(trackingOf("weird", "X1")?.carrier).toBe("other");
    expect(trackingOf("kerry", "")).toBeNull();
  });

  it("ข้อความ 'จัดส่งแล้ว' แนบเลขพัสดุ + ลิงก์ (ไทย/อังกฤษ)", () => {
    const base = { orderNo: "LM-1", customerName: "ก", paymentMethod: "cod", paymentStatus: "unpaid", items: [], subtotal: 0, shippingFee: 0, discount: 0, grandTotal: 0, note: "", promptpay: null };
    const tracking = { carrierLabel: "Flash Express", number: "TH9", url: "https://x/TH9" };
    const th = orderMessage("shipped", { ...base, tracking }, { name: "ร้าน", siteUrl: null }, "th").text;
    expect(th).toContain("เลขพัสดุ: Flash Express TH9");
    expect(th).toContain("ตามพัสดุ: https://x/TH9");
    expect(orderMessage("shipped", { ...base, tracking }, { name: "S", siteUrl: null }, "en").text).toContain("Tracking number: Flash Express TH9");
    expect(orderMessage("placed", { ...base, tracking }, { name: "S", siteUrl: null }, "th").text).not.toContain("เลขพัสดุ");
  });
});

describe("✉️ ฟอร์มติดต่อ", () => {
  it("บอกว่าขาดอะไร (ภาษาของลูกค้า)", () => {
    expect(normalizeContactInput({})).toEqual({ ok: false, error: "กรอกชื่อ" });
    expect(normalizeContactInput({ firstName: "A", lang: "en" })).toEqual({ ok: false, error: "Enter your email" });
    expect(normalizeContactInput({ firstName: "A", email: "bad" })).toEqual({ ok: false, error: "อีเมลไม่ถูกต้อง" });
    expect(normalizeContactInput({ firstName: "A", email: "a@b.co", message: "hi" })).toEqual({ ok: false, error: "พิมพ์ข้อความที่ต้องการติดต่อ" });
    expect(normalizeContactInput({ firstName: "A", email: "a@b.co", message: "hello there" }, { phoneRequired: true })).toEqual({ ok: false, error: "กรอกเบอร์โทร" });
    expect(normalizeContactInput({ firstName: "A", email: "a@b.co", phone: "12", message: "hello there" })).toEqual({ ok: false, error: "เบอร์โทรไม่ถูกต้อง" });
  });

  it("ผ่าน = ตัดช่องว่าง/อีเมลตัวเล็ก", () => {
    const r = normalizeContactInput({ firstName: " สมชาย ", email: "A@B.CO", phone: "081-234-5678", message: " สอบถามครับ ", topic: "สินค้า", lang: "en" });
    expect(r).toEqual({ ok: true, input: { firstName: "สมชาย", lastName: "", email: "a@b.co", phone: "081-234-5678", topic: "สินค้า", message: "สอบถามครับ", lang: "en", page: "" } });
  });
});
