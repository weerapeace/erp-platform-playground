import { describe, it, expect } from "vitest";
import { appendBriefTemplate, sortBriefTemplates, matchBriefTemplate, parseTags, cleanBriefTemplateInput } from "@/lib/brief-templates";

const tpl = { brief: "<p><strong>Editorial</strong> Warm</p>", ref_image_keys: ["a.jpg", "b.jpg"], ref_links: [{ url: "https://tiktok.com/x" }] };

describe("brief-templates", () => {
  it("appendBriefTemplate: โน้ตว่าง = ใส่ของเทมเพลต · Ref เติมให้", () => {
    const r = appendBriefTemplate({ html: "<p></p>", images: [], links: [] }, tpl);
    expect(r.html).toBe("<p><strong>Editorial</strong> Warm</p>");
    expect(r.images).toEqual(["a.jpg", "b.jpg"]);
    expect(r.links).toEqual([{ url: "https://tiktok.com/x" }]);
    expect(r.skipped).toBe(0);
  });

  it("appendBriefTemplate: มีข้อความแล้ว = ต่อท้าย · Ref ตัดซ้ำ + ไม่เกิน 6", () => {
    const cur = { html: "<p>เดิม</p>", images: ["a.jpg", "c.jpg", "d.jpg", "e.jpg"], links: [{ url: "https://ig.com/1" }] };
    const r = appendBriefTemplate(cur, tpl);
    expect(r.html).toBe("<p>เดิม</p><p><strong>Editorial</strong> Warm</p>");
    expect(r.images).toEqual(["a.jpg", "c.jpg", "d.jpg", "e.jpg", "b.jpg"]);   // a ซ้ำ ข้าม · b ได้ช่องสุดท้าย
    expect(r.links).toEqual([{ url: "https://ig.com/1" }]);
    expect(r.skipped).toBe(1);   // ลิงก์ tiktok ไม่มีที่
  });

  it("appendBriefTemplate: เทมเพลตข้อความธรรมดา → แปลงเป็นย่อหน้า · เทมเพลตไม่มีโน้ต = คงของเดิม", () => {
    expect(appendBriefTemplate({ html: "", images: [], links: [] }, { brief: "แสงอุ่น\n- 15 วิ", ref_image_keys: [], ref_links: [] }).html)
      .toBe("<p>แสงอุ่น</p><ul><li><p>15 วิ</p></li></ul>");
    expect(appendBriefTemplate({ html: "<p>x</p>", images: [], links: [] }, { brief: null, ref_image_keys: [], ref_links: [] }).html).toBe("<p>x</p>");
  });

  it("sortBriefTemplates: แบรนด์ของโพสต์ → ทุกแบรนด์ → แบรนด์อื่น", () => {
    const list = [
      { name: "B", brand_id: "other", sort_order: 0 },
      { name: "A", brand_id: null, sort_order: 1 },
      { name: "C", brand_id: "lm", sort_order: 5 },
      { name: "D", brand_id: null, sort_order: 0 },
    ];
    expect(sortBriefTemplates(list, "lm").map((x) => x.name)).toEqual(["C", "D", "A", "B"]);
    expect(sortBriefTemplates(list, null).map((x) => x.name)).toEqual(["D", "A", "B", "C"]);
  });

  it("matchBriefTemplate + parseTags", () => {
    const t = { name: "Video Editorial Fashion", tags: ["Warm", "Video"] };
    expect(matchBriefTemplate(t, "warm video")).toBe(true);
    expect(matchBriefTemplate(t, "cool")).toBe(false);
    expect(parseTags(" Video, warm ,Video,, Editorial ")).toEqual(["Video", "warm", "Editorial"]);
  });

  it("cleanBriefTemplateInput: ตรวจชื่อ/แบรนด์/Ref + ทำความสะอาดลิงก์", () => {
    expect(cleanBriefTemplateInput({ name: " " })).toEqual({ error: "ใส่ชื่อเทมเพลตก่อน" });
    expect(cleanBriefTemplateInput({ name: "x", brand_id: "abc" })).toEqual({ error: "แบรนด์ไม่ถูกต้อง" });
    const ok = cleanBriefTemplateInput({ name: " Warm ", brief: "<p></p>", ref_links: [{ url: "javascript:x" }, { url: "https://a.com" }], tags: ["a", "A"], brand_id: "" });
    expect(ok).toEqual({ row: { name: "Warm", brief: null, ref_links: [{ url: "https://a.com/" }], tags: ["a"], brand_id: null } });
    expect(cleanBriefTemplateInput({ is_active: false }, true)).toEqual({ row: { is_active: false } });
  });
});
