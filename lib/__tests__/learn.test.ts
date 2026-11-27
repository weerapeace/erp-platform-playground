import { describe, expect, it } from "vitest";
import { cleanChecklist, cleanLessonBody, cleanSteps, formatTimeText, groupLessons, parseTimeText, parseVideoLink } from "../learn";

describe("parseTimeText / formatTimeText", () => {
  it("อ่านเวลาได้หลายแบบ", () => {
    expect(parseTimeText("1:20")).toBe(80);
    expect(parseTimeText("01:02:03")).toBe(3723);
    expect(parseTimeText("95")).toBe(95);
    expect(parseTimeText("1m20s")).toBe(80);
    expect(parseTimeText("")).toBeNull();
    expect(parseTimeText("abc")).toBeNull();
    expect(parseTimeText(-3)).toBeNull();
  });
  it("แสดงเวลา", () => {
    expect(formatTimeText(80)).toBe("1:20");
    expect(formatTimeText(3723)).toBe("1:02:03");
    expect(formatTimeText(null)).toBe("");
  });
});

describe("parseVideoLink", () => {
  it("YouTube ทุกแบบ + นาทีเริ่ม", () => {
    const a = parseVideoLink("https://www.youtube.com/watch?v=abcDEF12345", 80);
    expect(a?.kind).toBe("youtube");
    expect(a?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/abcDEF12345?start=80");
    expect(a?.watchUrl).toContain("&t=80s");
    expect(parseVideoLink("https://youtu.be/abcDEF12345?t=45")?.embedUrl).toContain("start=45");
    expect(parseVideoLink("https://youtube.com/shorts/abcDEF12345")?.embedUrl).toContain("/embed/abcDEF12345");
  });
  it("TikTok / Drive / อื่น ๆ", () => {
    expect(parseVideoLink("https://www.tiktok.com/@shop/video/7312345678901234567")?.embedUrl).toBe("https://www.tiktok.com/embed/v2/7312345678901234567");
    expect(parseVideoLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view")?.embedUrl).toBe("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview");
    expect(parseVideoLink("https://example.com/page")?.embedUrl).toBeNull();
    expect(parseVideoLink("ไม่ใช่ลิงก์")).toBeNull();
  });
});

describe("cleanChecklist / cleanSteps", () => {
  it("แตกบรรทัด ตัดเครื่องหมายหน้า ตัดซ้ำ", () => {
    expect(cleanChecklist("- เช็ดฝุ่น\n• ถอดป้าย\n\n1. เช็ดฝุ่น")).toEqual(["เช็ดฝุ่น", "ถอดป้าย"]);
    expect(cleanChecklist(["a", " ", "b"])).toEqual(["a", "b"]);
  });
  it("ขั้นว่างตัดทิ้ง · ไม่มีชื่อใส่ให้", () => {
    const s = cleanSteps([{ title: "", body: "" }, { body: "จัดไฟ", video_start_sec: "1:20" }, { title: "ถ่าย", checklist: "ก\nข" }]);
    expect(s).toHaveLength(2);
    expect(s[0].title).toBe("ขั้นตอน 1");
    expect(s[0].video_start_sec).toBe(80);
    expect(s[1].checklist).toEqual(["ก", "ข"]);
  });
});

describe("cleanLessonBody", () => {
  it("สร้างใหม่ต้องมีชื่อ · ค่าเริ่ม = ร่าง", () => {
    expect(cleanLessonBody({}).ok).toBe(false);
    const r = cleanLessonBody({ title: "ถ่ายวิดีโอ" });
    expect(r.ok && r.patch.status).toBe("draft");
  });
  it("แก้บางช่องไม่บังคับชื่อ · ตรวจสถานะ/ลิงก์", () => {
    expect(cleanLessonBody({ status: "published" }, true)).toEqual({ ok: true, patch: { status: "published" } });
    expect(cleanLessonBody({ status: "x" }, true).ok).toBe(false);
    expect(cleanLessonBody({ source_url: "ftp://x" }, true).ok).toBe(false);
  });
});

describe("groupLessons", () => {
  it("หมวดว่างไปท้าย", () => {
    const g = groupLessons([
      { title: "b", category: null, sort_order: 0 },
      { title: "a", category: "ถ่ายวิดีโอ", sort_order: 1 },
      { title: "c", category: "ถ่ายวิดีโอ", sort_order: 0 },
    ]);
    expect(g.map((x) => x.category)).toEqual(["ถ่ายวิดีโอ", "ทั่วไป"]);
    expect(g[0].lessons.map((x) => x.title)).toEqual(["c", "a"]);
  });
});
