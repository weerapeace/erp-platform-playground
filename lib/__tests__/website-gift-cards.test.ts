import { describe, it, expect } from "vitest";
import {
  normalizeGiftCards,
  normalizeOrderCard,
  readOrderCard,
  giftCardHtml,
  giftCardsPrintHtml,
  sheetGrid,
  cardFontMm,
  DEFAULT_GIFT_CARDS,
} from "../website-gift-cards";

/** 🎴 การ์ดของขวัญ — ค่าที่ร้านตั้ง / การ์ดที่ลูกค้าส่งมา / ตัววาด */
describe("website-gift-cards", () => {
  it("ยังไม่เคยตั้ง / JSON พัง = ค่าเริ่มต้น (การ์ดเรียบ 1 ลาย + โอกาส 4 แบบ)", () => {
    expect(normalizeGiftCards(null)).toEqual(DEFAULT_GIFT_CARDS);
    expect(normalizeGiftCards("{พัง")).toEqual(DEFAULT_GIFT_CARDS);
    expect(normalizeGiftCards(JSON.stringify({ maxChars: 120 })).maxChars).toBe(120);
  });

  it("ทำความสะอาด: ขนาดตามแบบ (กำหนดเองได้ 50–210 มม.) · สี/คีย์รูปผิด = ทิ้ง · id ซ้ำ = ไม่ชนกัน", () => {
    const c = normalizeGiftCards({
      size: { preset: "custom", w: 999, h: 20 },
      maxChars: 5000,
      designs: [
        { id: "a", name: "ครีม", imageKey: "gift/cream.png", color: "#112233", bg: "red", area: "bottom" },
        { id: "a", name: "ซ้ำ", imageKey: "../../etc<script>", area: "nope" },
      ],
    });
    expect(c.size).toEqual({ preset: "custom", w: 210, h: 50 });
    expect(c.maxChars).toBe(300);
    expect(c.designs[0]).toMatchObject({ id: "a", imageKey: "gift/cream.png", color: "#112233", bg: "#FFFDF8", area: "bottom" });
    expect(c.designs[1].id).not.toBe("a");
    expect(c.designs[1]).toMatchObject({ imageKey: null, area: "full" });
    expect(normalizeGiftCards({ size: { preset: "card", w: 1, h: 1 } }).size).toEqual({ preset: "card", w: 90, h: 55 });
  });

  it("การ์ดจากลูกค้า: ลายต้องเปิดอยู่ · ตัวหนังสือต้องเปิดอยู่ · ข้อความเกินความยาว/บรรทัด = บอกเหตุผล", () => {
    const cfg = normalizeGiftCards({ maxChars: 40, maxLines: 2, fonts: ["hand"], designs: [{ id: "a" }, { id: "off", enabled: false }] });
    expect(normalizeOrderCard({ design: "a", font: "hand", to: "แม่", from: "มิว" }, cfg, "สุขสันต์วันเกิด")).toMatchObject({ ok: true, card: { design: "a", font: "hand", to: "แม่", from: "มิว" } });
    expect(normalizeOrderCard({ design: "off", font: "hand" }, cfg, "")).toMatchObject({ ok: false });
    expect(normalizeOrderCard({ design: "a", font: "cute" }, cfg, "")).toMatchObject({ ok: false });
    expect(normalizeOrderCard({ design: "a", font: "hand" }, cfg, "ก".repeat(41))).toMatchObject({ ok: false });
    expect(normalizeOrderCard({ design: "a", font: "hand" }, cfg, "1\n2\n3")).toMatchObject({ ok: false });
    // ไม่ส่งการ์ดมา (เว็บรุ่นเก่า) = ไม่มีการ์ด แต่ยังตรวจความยาวข้อความ
    expect(normalizeOrderCard(null, cfg, "สั้น ๆ")).toEqual({ ok: true, card: null });
  });

  it("ไม่ระบุชื่อผู้ส่ง: ร้านเปิดให้เลือก = ตัดชื่อทิ้ง · ร้านไม่เปิด = เก็บชื่อตามปกติ", () => {
    const on = normalizeGiftCards({ designs: [{ id: "a" }] });
    expect(normalizeOrderCard({ design: "a", font: "hand", from: "มิว", anon: true }, on, "")).toMatchObject({ ok: true, card: { anon: true, from: "" } });
    const off = normalizeGiftCards({ designs: [{ id: "a" }], allowAnon: false });
    expect(normalizeOrderCard({ design: "a", font: "hand", from: "มิว", anon: true }, off, "")).toMatchObject({ ok: true, card: { anon: false, from: "มิว" } });
  });

  it("readOrderCard: ข้อมูลเก่า/เพี้ยน = null · ฟอนต์ไม่รู้จัก = เรียบ", () => {
    expect(readOrderCard(null)).toBeNull();
    expect(readOrderCard({ font: "hand" })).toBeNull();
    expect(readOrderCard({ design: "a", font: "xx" })).toMatchObject({ design: "a", font: "clean", printedAt: null });
  });

  it("ตัววาด: กันโค้ดแปลกในข้อความ · ข้อความยาวตัวเล็กลง · จัดลง A4 (หมุนการ์ดถ้าได้มากกว่า)", () => {
    const cfg = DEFAULT_GIFT_CARDS;
    const html = giftCardHtml(cfg, cfg.designs[0], { to: "<b>แม่</b>", from: "มิว", message: "<script>x</script>", font: "hand" }, null);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;แม่&lt;/b&gt;");
    expect(cardFontMm(cfg, cfg.designs[0], "ก".repeat(200), "clean")).toBeLessThan(cardFontMm(cfg, cfg.designs[0], "สุขสันต์วันเกิด", "clean"));
    expect(sheetGrid(cfg)).toEqual({ cols: 1, rows: 2, rotate: false });
    expect(sheetGrid(normalizeGiftCards({ size: { preset: "a7" } }))).toEqual({ cols: 2, rows: 2, rotate: true });
    expect(sheetGrid(normalizeGiftCards({ size: { preset: "card" } }))).toEqual({ cols: 3, rows: 3, rotate: true });
    const doc = giftCardsPrintHtml(cfg, [html, html, html], "sheet");
    expect(doc.match(/class="pg"/g)?.length).toBe(2);
    expect(giftCardsPrintHtml(normalizeGiftCards({ size: { preset: "card" } }), [html], "sheet")).toContain('class="rot"');
    expect(giftCardsPrintHtml(cfg, [html], "single")).toContain("size:148mm 105mm");
  });

  it("รูปลายการ์ด: ใส่ใน style ได้โดยไม่ทำ attribute พัง (ฟันหนูในลิงก์ถูกแปลง)", () => {
    const cfg = DEFAULT_GIFT_CARDS;
    const html = giftCardHtml(cfg, cfg.designs[0], { to: "", from: "", message: "hi", font: "clean" }, `/api/r2-image?key=a"b'c d.png&w=900`);
    const style = html.match(/^<div class="gc" style="([^"]*)"/)?.[1] ?? "";
    expect(style).toContain("url('/api/r2-image?key=a%22b%27c%20d.png&w=900')");
  });
});
