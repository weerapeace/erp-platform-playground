import { describe, it, expect } from "vitest";
import {
  canPlace, cleanSectionConfig, defaultSectionConfig, firstFreeSpot, frameSectionKind, slotInFrame, templateFrames, templatesFor, BENTO_CELL,
  type SectionBlock,
} from "@/lib/board-section-templates";

const b = (id: string, x: number, y: number, w: number, h: number): SectionBlock => ({ id, name: id, x, y, w, h, kind: "none" });

describe("เทมเพลตโซนกระดาน", () => {
  it("ยังไม่เคยตั้ง = ชุดตั้งต้น (บรีฟ + แคมเปญ)", () => {
    const c = cleanSectionConfig(null);
    expect(c.templates.map((t) => t.id)).toEqual(["tpl_brief", "tpl_campaign"]);
    expect(templatesFor(c, "brief")).toHaveLength(1);
  });
  it("ทำความสะอาดค่าที่ล้นตาราง/ชื่อว่าง", () => {
    const c = cleanSectionConfig({ templates: [{ name: " A ", boards: ["x"], blocks: [{ name: "", x: 0 }, { name: "Z", x: 9, y: -2, w: 9, h: 9, kind: "bad" }] }] });
    expect(c.templates[0].name).toBe("A");
    expect(c.templates[0].boards).toEqual(["brief", "campaign"]);
    expect(c.templates[0].blocks).toHaveLength(1);
    expect(c.templates[0].blocks[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 4, kind: "none" });
  });
  it("ห้ามวางทับกัน / ล้นขอบ", () => {
    const bl = [b("a", 0, 0, 2, 2), b("c", 2, 0, 2, 1)];
    expect(canPlace(bl, "c", { x: 1, y: 0, w: 2, h: 1 })).toBe(false);
    expect(canPlace(bl, "c", { x: 2, y: 1, w: 2, h: 1 })).toBe(true);
    expect(canPlace(bl, "c", { x: 3, y: 0, w: 2, h: 1 })).toBe(false);
    expect(firstFreeSpot(bl, 2, 1)).toEqual({ x: 2, y: 1 });
  });
  it("แปลงเป็นกรอบบนกระดาน (ขนาดตามช่อง + เก็บชนิดโซน)", () => {
    const tpl = defaultSectionConfig().templates[1];
    const fr = templateFrames(tpl);
    expect(fr).toHaveLength(tpl.blocks.length);
    expect(fr[0]).toMatchObject({ type: "frame", x: 0, y: 0, width: BENTO_CELL.w * 2 + BENTO_CELL.gap });
    expect((fr[4].customData as Record<string, unknown>).sectionKind).toBe("task");
  });
  it("ชนิดโซน: customData ก่อน · ไม่มีก็เดาจากชื่อ", () => {
    const cfg = defaultSectionConfig();
    expect(frameSectionKind({ customData: { sectionKind: "content" } }, cfg)).toBe("content");
    expect(frameSectionKind({ name: "งาน (Tasks)" }, cfg)).toBe("task");
    expect(frameSectionKind({ name: "อื่น ๆ" }, cfg)).toBe("none");
  });
  it("ตำแหน่งการ์ดในกรอบ ขึ้นแถวใหม่เมื่อเต็ม", () => {
    const f = { x: 100, y: 100, width: 600 };
    expect(slotInFrame(f, 0)).toEqual({ x: 124, y: 148 });
    expect(slotInFrame(f, 2).y).toBe(148 + 216);
  });
});

describe("โซนสำเร็จรูป (แก้ได้ในป๊อป)", () => {
  it("ยังไม่เคยตั้ง = ชื่อเดิมของกระดานแคมเปญ", () => {
    expect(cleanSectionConfig(null).presets.campaign).toContain("สินค้าใน Campaign");
  });
  it("เก็บค่าที่แก้ + ตัดซ้ำ/ว่าง · ลบหมด = ว่างได้", () => {
    const c = cleanSectionConfig({ templates: [], presets: { campaign: [" A ", "A", "", 5], brief: [] } });
    expect(c.presets.campaign).toEqual(["A"]);
    expect(c.presets.brief).toEqual([]);
  });
});
