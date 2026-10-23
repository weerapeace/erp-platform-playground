import { describe, it, expect } from "vitest";
import { SECTION_SCHEMAS, childPlacePatch, matchShowIf, newChildValues } from "../website-schema";
import { normalizeBlocks, newBlock, validateBlocks, blockSummary, type Block } from "../website-blocks";

/**
 * 🖱️ ข้อความใหญ่ + รูปตามเมาส์ (hover-reveal) · 🎬 แกลเลอรีแบบแถบวิดีโอ (layout tabs) — 2026-10-23
 * กันพลาด: Section ใหม่มีคำตั้งต้นให้เห็นหน้าตา · ค่ามั่ว = ค่าเริ่ม · ช่องโชว์ถูกแบบ · แกลเลอรีเดิมไม่เปลี่ยน
 */
type R = Record<string, unknown>;
const norm = (b: R) => normalizeBlocks([b])[0] as unknown as R & { items: R[] };
const msgs = (b: R) => validateBlocks([norm(b) as unknown as Block]).map((x) => x.message).join(" | ");

describe("🖱️ ข้อความใหญ่ + รูปตามเมาส์", () => {
  it("วาง Section ใหม่ = มีคำตั้งต้น 3 คำต่างกัน + ค่าเริ่มแบบตัวอย่าง", () => {
    const b = newBlock("hover-reveal", 1) as unknown as R & { items: R[] };
    expect(b.items.map((i) => i.text)).toEqual(["NEW ARRIVAL", "BEST SELLER", "OUR STORY"]);
    expect(new Set(b.items.map((i) => i.id)).size).toBe(3);
    expect(b).toMatchObject({ align: "center", font: "display", weight: "700", size: 128, sizeMobile: 52, upper: true, others: "fade", follow: "smooth", tilt: true, imgFx: "pop", layer: "front", ratio: "3:4" });
    // ชิ้นที่กด "+ เพิ่ม" ยังเป็นชิ้นเปล่าแบบเดิม (starter ใช้เฉพาะตอนวาง Section)
    expect(norm(b as R).items.length).toBe(3);
    expect(blockSummary(b as R)).toContain("NEW ARRIVAL");
  });

  it("ค่ามั่ว = ค่าเริ่ม · ขนาดถูกบีบในช่วง · เกิน 16 ชิ้นถูกตัด · ลิงก์อันตรายถูกทิ้ง", () => {
    const b = norm({ id: "h1", type: "hover-reveal", follow: "teleport", size: 9999, imgW: 5, others: "x", items: Array.from({ length: 20 }, (_, i) => ({ text: `W${i}`, href: i ? "/shop" : "javascript:alert(1)" })) });
    expect(b.follow).toBe("smooth");
    expect(b.size).toBe(260);
    expect(b.imgW).toBe(160);
    expect(b.others).toBe("fade");
    expect(b.items.length).toBe(16);
    expect(b.items[0].href).not.toContain("javascript");
  });

  it("เตือน: ไม่มีคำ = error · คำที่ไม่มีรูป = warning", () => {
    expect(msgs({ id: "h2", type: "hover-reveal", items: [{ text: " " }] })).toContain("ยังไม่ได้ใส่คำ");
    const m = msgs({ id: "h3", type: "hover-reveal", items: [{ text: "A", imageKey: "a/x.jpg" }, { text: "B" }] });
    expect(m).toContain("1 คำยังไม่มีรูป");
    expect(msgs({ id: "h4", type: "hover-reveal", items: [{ text: "A", imageKey: "a/x.jpg" }] })).not.toMatch(/คำ/);
  });

  it("ช่องโชว์ตามเงื่อนไข: สีเองเฉพาะ custom · เอียงเฉพาะแบบตามเมาส์", () => {
    const fd = (k: string) => SECTION_SCHEMAS["hover-reveal"].fields.find((x) => x.key === k)!;
    expect(matchShowIf(fd("hex"), { color: "ink" })).toBe(false);
    expect(matchShowIf(fd("hex"), { color: "custom" })).toBe(true);
    expect(matchShowIf(fd("tilt"), { follow: "fixed" })).toBe(false);
    expect(matchShowIf(fd("tilt"), { follow: "snap" })).toBe(true);
  });

  it("รูปของคำเป็นช่องรูปกลาง (ผูกชุดรูปได้)", () => {
    const img = SECTION_SCHEMAS["hover-reveal"].children!.fields.find((x) => x.key === "imageKey")!;
    expect(img.type).toBe("image");
    const b = norm({ id: "h5", type: "hover-reveal", items: [{ text: "A", imageKey: "imgset/0f8fad5b-d9cb-469f-a165-70867728950e" }] });
    expect(b.items[0].imageKey).toBe("imgset/0f8fad5b-d9cb-469f-a165-70867728950e");
  });
});

describe("⬚ กรอบล่องหน + 🖼 รูปตอนชี้พื้นหลัง (hover-reveal รอบ 2)", () => {
  const sch = SECTION_SCHEMAS["hover-reveal"];
  const child = (k: string) => sch.children!.fields.find((x) => x.key === k)!;

  it("Section เดิม (ไม่มี kind) = คำทั้งหมด · ไม่มีรูปพื้นหลัง (หน้าตาเดิม)", () => {
    const b = norm({ id: "z0", type: "hover-reveal", items: [{ text: "A", imageKey: "a/x.jpg" }] });
    expect(b.items[0].kind).toBe("word");
    expect(b.bgImageKey).toBeNull();
    expect(b.bgHref).toBe("");
  });

  it("กรอบ: ค่าเริ่ม x/y/w/h · ค่าเกินช่วงถูกบีบ · ช่องข้อความซ่อน ช่องตำแหน่งโชว์", () => {
    const b = norm({ id: "z1", type: "hover-reveal", items: [{ kind: "zone", imageKey: "a/z.jpg" }, { kind: "zone", x: -5, w: 500, h: 1 }] });
    expect(b.items[0]).toMatchObject({ kind: "zone", x: 4, y: 8, w: 24, h: 30 });
    expect(b.items[1]).toMatchObject({ x: 0, w: 100, h: 3 });
    expect(matchShowIf(child("text"), { kind: "zone" })).toBe(false);
    expect(matchShowIf(child("text"), { kind: "word" })).toBe(true);
    expect(matchShowIf(child("x"), { kind: "zone" })).toBe(true);
    expect(matchShowIf(child("x"), { kind: "word" })).toBe(false);
  });

  it("มีแต่กรอบ (ไม่มีคำ) ก็เผยแพร่ได้ · กรอบไม่มีรูป/ลิงก์ที่ว่างไม่มีรูป = เตือน", () => {
    expect(msgs({ id: "z2", type: "hover-reveal", items: [{ kind: "zone", imageKey: "a/z.jpg" }] })).not.toMatch(/ยังไม่ได้ใส่/);
    expect(msgs({ id: "z3", type: "hover-reveal", items: [] })).toContain("ยังไม่ได้ใส่คำหรือกรอบ");
    const m = msgs({ id: "z4", type: "hover-reveal", bgHref: "/shop", items: [{ text: "A", imageKey: "a/x.jpg" }, { kind: "zone" }] });
    expect(m).toContain("1 กรอบยังไม่มีรูป");
    expect(m).toContain("ยังไม่มีรูปพื้นหลัง");
  });

  it("สรุป: นับคำ + กรอบ + รูปพื้นหลัง", () => {
    const b = norm({ id: "z5", type: "hover-reveal", bgImageKey: "a/bg.jpg", items: [{ text: "A" }, { kind: "zone" }, { kind: "zone" }] });
    expect(blockSummary(b)).toBe("1 คำ · A · 2 กรอบ · รูปพื้นหลัง");
    expect(sch.children!.summary({ kind: "zone", alt: "กระเป๋า" })).toContain("⬚ กระเป๋า");
  });

  it("＋ เพิ่มกรอบ: ปุ่มเพิ่มแบบอื่นของ schema → ชิ้นใหม่เป็นกรอบกลาง Section · ปุ่มหลักยังเป็นคำ", () => {
    const spec = sch.children!;
    expect(spec.addOptions?.map((o) => o.label)).toEqual(["กรอบล่องหน"]);
    const zone = newChildValues(spec, spec.addOptions![0]);
    expect(zone).toMatchObject({ kind: "zone", text: "", x: 38, y: 35, w: 24, h: 30, imageKey: null, href: "" });
    expect(newChildValues(spec)).toMatchObject({ kind: "word", text: "NEW WORD" });
    // ผ่านการทำความสะอาดแล้วค่ายังอยู่ครบ (บันทึกได้)
    const b = norm({ id: "z6", type: "hover-reveal", items: [{ id: "n1", ...zone }] });
    expect(b.items[0]).toMatchObject({ kind: "zone", x: 38, y: 35, w: 24, h: 30 });
    expect(SECTION_SCHEMAS.faq.children!.addOptions).toBeUndefined();
    expect([spec.itemLabelOf!(zone), spec.itemLabelOf!({ kind: "word" })]).toEqual(["กรอบล่องหน", "คำ"]);
  });

  it("childPlacePatch (ลากในพรีวิว): รับเฉพาะช่องที่มี · บีบช่วง · ปัด 1 ตำแหน่ง · ค่ามั่วไม่แตะ", () => {
    expect(childPlacePatch(sch.children!, { x: 12.345, y: -3, w: 140, h: "abc", z: 9 })).toEqual({ x: 12.3, y: 0, w: 100 });
    expect(childPlacePatch(SECTION_SCHEMAS.faq.children!, { x: 10, y: 10 })).toEqual({});
  });
});

describe("🎬 แกลเลอรีแบบแถบวิดีโอ (layout tabs)", () => {
  const sch = SECTION_SCHEMAS.gallery;
  const shown = (b: R) => sch.fields.filter((x) => matchShowIf(x, b)).map((x) => x.key);
  const child = (k: string) => sch.children!.fields.find((x) => x.key === k)!;

  it("แกลเลอรีเดิม (ไม่ได้ตั้ง layout) = ตารางเหมือนเดิม · ไม่เห็นช่อง tabs*", () => {
    const b = norm({ id: "g1", type: "gallery", items: [{ imageKey: "a/1.jpg" }] });
    expect(b.layout).toBe("grid");
    const keys = shown(b);
    expect(keys.some((k) => k.startsWith("tabs"))).toBe(false);
    expect(keys).toContain("columns");
  });

  it("เลือกแถบวิดีโอ = ค่าเริ่มแบบตัวอย่าง + เห็นช่อง tabs* ไม่เห็นช่องของตาราง/แถวรูป", () => {
    const b = norm({ id: "g2", type: "gallery", layout: "tabs", items: [{ media: "video", videoKey: "v/1.mp4" }, { imageKey: "a/2.jpg" }] });
    expect(b).toMatchObject({ layout: "tabs", tabsH: 560, tabsActive: 64, tabsSliver: "pixel", tabsCycle: true, tabsCycleSec: "6", tabsCap: "scramble", tabsCapPos: "below", tabsNum: true, tabsFont: "mono", tabsClick: "auto", tabsCursor: "[ VIEW FULLSCREEN ]", tabsMobile: "row" });
    const keys = shown(b);
    expect(keys).toEqual(expect.arrayContaining(["tabsH", "tabsActive", "tabsSliver", "tabsCycle", "tabsCycleSec", "tabsCap", "tabsCapPos", "tabsCursor"]));
    expect(keys).not.toContain("columns");
    expect(keys).not.toContain("stripW");
    expect(keys).not.toContain("capPos");
    expect(b.items[0]).toMatchObject({ media: "video", videoKey: "v/1.mp4" });
  });

  it("ชิ้นเป็นวิดีโอได้ทั้งตาราง + แถบวิดีโอ (แถวรูปลุคบุ๊กยังไม่ได้)", () => {
    // เหมือนแผงตั้งค่า (website-schema-form): showIfParent เทียบกับค่าของ Section แม่
    const byParent = (k: string, parent: R) => matchShowIf({ ...child(k), showIf: child(k).showIfParent }, parent);
    expect(byParent("media", { layout: "tabs" })).toBe(true);
    expect(byParent("media", { layout: "grid" })).toBe(true);
    expect(byParent("media", {})).toBe(true);
    expect(byParent("media", { layout: "strip" })).toBe(false);
    expect(byParent("videoKey", { layout: "tabs" }) && matchShowIf(child("videoKey"), { media: "video" })).toBe(true);
  });

  it("ค่ามั่ว = ค่าเริ่ม · ช่วงถูกบีบ · ปิดวนแล้วไม่เห็นช่องวินาที · ไม่มีข้อความแล้วไม่เห็นตำแหน่งข้อความ", () => {
    const b = norm({ id: "g3", type: "gallery", layout: "tabs", tabsActive: 300, tabsSliver: "glitch", tabsCycle: false, tabsCap: "none", items: [{ imageKey: "a/1.jpg" }] });
    expect(b.tabsActive).toBe(86);
    expect(b.tabsSliver).toBe("pixel");
    const keys = shown(b);
    expect(keys).not.toContain("tabsCycleSec");
    expect(keys).not.toContain("tabsCapPos");
  });

  it("เตือน: แถบวิดีโอมีช่องเดียว · ไม่เตือนเรื่องเปลี่ยนรูปเองของตาราง", () => {
    const m = msgs({ id: "g4", type: "gallery", layout: "tabs", rotate: "slide", items: [{ imageKey: "a/1.jpg", alt: "x" }] });
    expect(m).toContain("แถบวิดีโอต้องมีอย่างน้อย 2 ช่อง");
    expect(m).not.toContain("เปลี่ยนรูปเอง");
    expect(blockSummary(norm({ id: "g5", type: "gallery", layout: "tabs", items: [{ imageKey: "a/1.jpg" }] }))).toContain("แถบวิดีโอ");
  });
});

describe("🗂 แถบวิดีโอ หน้าตาแฟ้มเอกสาร (tabsLook folder)", () => {
  const sch = SECTION_SCHEMAS.gallery;
  const shown = (b: R) => sch.fields.filter((x) => matchShowIf(x, b)).map((x) => x.key);
  const child = (k: string) => sch.children!.fields.find((x) => x.key === k)!;
  const byParent = (k: string, parent: R) => matchShowIf({ ...child(k), showIf: child(k).showIfParent }, parent);
  const tabs = (b: R) => norm({ id: "f1", type: "gallery", layout: "tabs", items: [{ imageKey: "a/1.jpg" }, { imageKey: "a/2.jpg" }], ...b });

  it("แถบวิดีโอเดิม = แบบเดิม (plain) · ไม่เห็นช่องแฟ้ม · ช่องเดิมครบ", () => {
    const b = tabs({});
    expect(b.tabsLook).toBe("plain");
    const keys = shown(b);
    expect(keys.some((k) => k.startsWith("folder") || k.startsWith("cover"))).toBe(false);
    expect(keys).toEqual(expect.arrayContaining(["tabsActive", "tabsGap", "tabsRadius", "tabsSliver", "tabsMobile", "tabsNum", "tabsCapPos"]));
  });

  it("แฟ้ม: ค่าเริ่มแบบตัวอย่าง (แนวนอน · แฟ้มจริง · สลับซ้ายขวา · เส้นบาง · เงา 2 · มุม 14 · พาสเทล · โพลารอยด์ · ดึงขึ้น)", () => {
    const b = tabs({ tabsLook: "folder" });
    expect(b).toMatchObject({ folderDir: "h", folderShape: "real", folderPos: "alt", folderTex: "lines", folderShadow: 2, folderRadius: 14, folderPal: "pastel", folderLabel: "auto", folderMedia: "pol", folderPeek: 56, folderLift: true, folderCover: false, coverFont: "display", coverFont2: "Great Vibes", coverSize: 56, coverLogo: null });
  });

  it("แฟ้มแนวนอน = ซ่อนช่องของแถบ (กว้าง/แถบบาง/มือถือ/ตัวนับ) · แนวตั้ง = โชว์ (ยกเว้นระยะห่าง/มุมของแบบเดิม)", () => {
    const h = shown(tabs({ tabsLook: "folder", folderDir: "h" }));
    expect(h).toEqual(expect.arrayContaining(["folderDir", "folderShape", "folderPos", "folderTex", "folderShadow", "folderRadius", "folderPal", "folderLabel", "folderMedia", "folderPeek", "folderLift", "folderCover"]));
    for (const k of ["tabsActive", "tabsSliver", "tabsMobile", "tabsNum", "tabsCapPos", "tabsGap", "tabsRadius"]) expect(h).not.toContain(k);
    const v = shown(tabs({ tabsLook: "folder", folderDir: "v" }));
    expect(v).toEqual(expect.arrayContaining(["tabsActive", "tabsSliver", "tabsNum"]));
    expect(v).not.toContain("tabsMobile"); // มือถือเรียงแนวตั้ง = แบบเดิมเท่านั้น (แฟ้มใช้แนวนอนแทน)
    expect(v).not.toContain("folderPeek");
    expect(v).not.toContain("tabsGap");
  });

  it("แฟ้มปก: ช่องชื่อ/ฟอนต์/โลโก้ โชว์เมื่อเปิดแฟ้มปก · สีเองโชว์เมื่อเลือกสีเอง", () => {
    expect(shown(tabs({ tabsLook: "folder" }))).not.toContain("coverTitle");
    const c = shown(tabs({ tabsLook: "folder", folderCover: true, folderPal: "custom" }));
    expect(c).toEqual(expect.arrayContaining(["coverTitle", "coverTitle2", "coverFont", "coverFont2", "coverSize", "coverLogo", "folderHex"]));
  });

  it("ค่ามั่ว = ค่าเริ่ม · ช่วงถูกบีบ · ชิ้นมีป้ายหูแฟ้ม + สีแฟ้มรายช่อง (โชว์เฉพาะหน้าตาแฟ้ม)", () => {
    const b = tabs({ tabsLook: "folder", folderShape: "blob", folderShadow: 9, folderRadius: -4, folderPal: "neon", items: [{ imageKey: "a/1.jpg", tabLabel: "TO DO LIST", folderColor: "#EBCFD0" }] });
    expect([b.folderShape, b.folderShadow, b.folderRadius, b.folderPal]).toEqual(["real", 3, 0, "pastel"]);
    expect(b.items[0]).toMatchObject({ tabLabel: "TO DO LIST", folderColor: "#ebcfd0" });
    expect(byParent("tabLabel", { layout: "tabs", tabsLook: "folder" })).toBe(true);
    expect(byParent("tabLabel", { layout: "tabs", tabsLook: "plain" })).toBe(false);
    expect(byParent("folderColor", { layout: "grid" })).toBe(false);
  });
});
