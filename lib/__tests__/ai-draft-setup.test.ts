import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES, DEFAULT_WARRANTY_OPTIONS, cleanTemplate, highlightChoices, visibleSlots, fitsFromSize, liveTemplates, mergeExtras, missingManual, missingTopics,
  normalizeExtras, normalizeSetup, pickParcelBox, templateFor, templateInstruction,
} from "@/lib/ai-draft-setup";

describe("ชุดแม่แบบ", () => {
  it("ยังไม่ตั้ง = ใช้แม่แบบเริ่มต้น", () => {
    expect(normalizeSetup(null).templates).toEqual(DEFAULT_TEMPLATES);
  });
  it("ตัดแม่แบบไม่มีชื่อ/ไม่มีหัวข้อ + id ซ้ำ", () => {
    const s = normalizeSetup({ templates: [{ id: "a", name: "A", headings: ["x"] }, { id: "a", name: "A2", headings: ["y"] }, { name: "", headings: ["z"] }, { name: "B", headings: [] }] });
    expect(s.templates.map((t) => t.name)).toEqual(["A"]);
  });
  it("ค่าเริ่มต้นต่อแบรนด์ · ไม่ตั้ง = ตัวแรก · ตัวในถังขยะไม่ถูกเลือก", () => {
    const s = normalizeSetup({ templates: [{ id: "a", name: "A", headings: ["x"] }, { id: "b", name: "B", headings: ["y"] }, { id: "c", name: "C", headings: ["z"], archived: true }], brand_default: { br1: "b", br2: "c", br3: "nope" } });
    expect(templateFor(s, "br1")?.id).toBe("b");
    expect(templateFor(s, "br2")?.id).toBe("a");
    expect(templateFor(s, null)?.id).toBe("a");
    expect(liveTemplates(s).map((t) => t.id)).toEqual(["a", "b"]);
    expect(s.brand_default.br3).toBeUndefined();
  });
  it("คำสั่ง AI เรียงหัวข้อตามแม่แบบ", () => {
    const t = cleanTemplate({ name: "แม่แบบกระเป๋า", headings: ["จุดเด่น", "วัสดุ"], format: "ใช้ - " })!;
    const s = templateInstruction(t);
    expect(s).toContain("1. จุดเด่น");
    expect(s).toContain("2. วัสดุ");
    expect(s).toContain("รูปแบบการเขียน: ใช้ -");
  });
});

describe("ค่าตั้งเพิ่มของกฎ", () => {
  it("กรองช่องกรอกมือที่ไม่รู้จัก + รวมหลายกฎไม่ซ้ำ", () => {
    expect(normalizeExtras({ manual_required: ["warranty", "hack"] }).manual_required).toEqual(["warranty"]);
    const m = mergeExtras([{ highlights: ["a", "b"], manual_required: ["warranty"] }, { highlights: ["b", "c"], manual_required: ["custom_size"] }]);
    expect(m.highlights).toEqual(["a", "b", "c"]);
    expect(m.manual_required).toEqual(["warranty", "custom_size"]);
  });
  it("หัวข้อบังคับที่ยังไม่ตอบ · หัวข้อไม่บังคับไม่นับ", () => {
    const topics = [{ th: "ซิป" }, { th: "กันน้ำ" }, { th: "สาย" }];
    expect(missingTopics(topics, { ซิป: "มี", กันน้ำ: " " }, ["สาย"])).toEqual(["กันน้ำ"]);
  });
  it("ช่องกรอกมือบังคับที่ยังว่าง ('-' = ว่าง)", () => {
    expect(missingManual(["warranty", "custom_size"], { warranty: "-", custom_size: "ได้" })).toEqual(["warranty"]);
  });
});

describe("กล่องไปรษณีย์", () => {
  const boxes = [
    { id: "big", name: "E", width_cm: 45, length_cm: 55, height_cm: 30 },
    { id: "d", name: "D", width_cm: 40, length_cm: 45, height_cm: 15 },
    { id: "s", name: "A", width_cm: 14, length_cm: 20, height_cm: 6 },
    { id: "off", name: "X", width_cm: 39, length_cm: 40, height_cm: 13, is_active: false },
  ];
  it("เลือกกล่องเล็กสุดที่ใส่ได้ (หมุนสินค้าได้)", () => {
    expect(pickParcelBox({ w: 38, h: 34, d: 12 }, boxes)?.id).toBe("d");
    expect(pickParcelBox({ w: 12, h: 38, d: 34 }, boxes)?.id).toBe("d");
  });
  it("ใหญ่เกินทุกกล่อง / ขนาดไม่ครบ = null · กล่องปิดใช้งานไม่ถูกเลือก", () => {
    expect(pickParcelBox({ w: 80, h: 10, d: 10 }, boxes)).toBeNull();
    expect(pickParcelBox({ w: 38, h: 34, d: "" }, boxes)).toBeNull();
    expect(pickParcelBox({ w: 38, h: 39, d: 12 }, boxes)?.id).toBe("d");
  });
});

describe("ใส่อะไรได้จากขนาด", () => {
  it("ของชิ้นเดียว: ใส่ได้/ไม่ได้ · ของไม่มีขนาดไม่อยู่ในรายการ", () => {
    const rows = [
      { id: "a4", name: "A4", width_cm: 21, height_cm: 29.7, depth_cm: 1 },
      { id: "big", name: "ของใหญ่", width_cm: 50, height_cm: 50, depth_cm: 50 },
      { id: "x", name: "ไม่มีขนาด" },
    ];
    const r = fitsFromSize({ w: 38, h: 34, d: 12 }, rows);
    expect(r.find((x) => x.id === "a4")?.fits).toBe(true);
    expect(r.find((x) => x.id === "big")?.fits).toBe(false);
    expect(r.find((x) => x.id === "x")).toBeUndefined();
  });
  it("ของหลายขนาด: เลือกขนาดใหญ่สุดที่ใส่ได้", () => {
    const rows = [{ id: "nb", name: "โน้ตบุ๊ก", sizes: "13 นิ้ว, 15 นิ้ว, 17 นิ้ว", size_dims: { "13 นิ้ว": { w: 31, h: 22, d: 2 }, "15 นิ้ว": { w: 36, h: 25, d: 2 }, "17 นิ้ว": { w: 40, h: 27, d: 3 } } }];
    expect(fitsFromSize({ w: 38, h: 34, d: 12 }, rows)[0]).toMatchObject({ fits: true, size: "15 นิ้ว" });
  });
  it("ขนาดสินค้าไม่ครบ = ไม่คิด", () => {
    expect(fitsFromSize({ w: 38, h: 0, d: 12 }, [{ id: "a", name: "a", width_cm: 1, height_cm: 1, depth_cm: 1 }])).toEqual([]);
  });
});

describe("รอบ 3: ประกัน · จุดเด่น · ชนิดช่อง", () => {
  it("ตัวเลือกประกัน: ยังไม่ตั้ง = ค่าที่ใช้จริง · ตั้งแล้วใช้ของที่ตั้ง", () => {
    expect(normalizeSetup(null).warranty_options).toEqual(DEFAULT_WARRANTY_OPTIONS);
    expect(normalizeSetup({ warranty_options: ["1 ปี", "1 ปี", " "] }).warranty_options).toEqual(["1 ปี"]);
  });
  it("จุดเด่น: ประเภทตั้งไว้ใช้ของประเภท · ไม่ตั้งใช้คลังกลาง", () => {
    expect(highlightChoices({ highlights: ["หนังแท้"] }, ["กันน้ำ"])).toEqual({ list: ["หนังแท้"], fromType: true });
    expect(highlightChoices({ highlights: [] }, ["กันน้ำ", "กันน้ำ", ""])).toEqual({ list: ["กันน้ำ"], fromType: false });
  });
  it("ชนิดช่อง: กรองตามประเภท แต่ช่องที่ใส่จำนวนแล้วไม่หาย · ดูทั้งหมด/ไม่ตั้ง = ทุกชนิด", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(visibleSlots(items, ["a"], { c: 2 }, false).map((x) => x.id)).toEqual(["a", "c"]);
    expect(visibleSlots(items, ["a"], {}, true)).toHaveLength(3);
    expect(visibleSlots(items, [], {}, false)).toHaveLength(3);
  });
  it("รวมชนิดช่องจากหลายกฎ", () => {
    expect(mergeExtras([{ slot_ids: ["a"] }, { slot_ids: ["a", "b"] }]).slot_ids).toEqual(["a", "b"]);
  });
});
