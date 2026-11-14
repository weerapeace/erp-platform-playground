import { describe, expect, it } from "vitest";
import {
  allSkuIds, applyColorway, bagWord, bothUnits, cleanPrompts, fillPromptVars, promptContext, resolvePrompts, teamPromptSettings, handleCountText, handleText, panelSize, sizeKnown, sizePhrase, colorwayLabel, compareRecipes, setColorwayPick, buildBriefHtml, buildPrompts, cleanSpec, dlDraftOf, handleLength, nextTemplateCode, pickInfo, pocketPanelSvg, ruleHits, specSkuIds, stockHits, toStudioParams, type Choice, type Spec,
} from "./design-library";

const ch = (list_key: Choice["list_key"], code: string, name: string, extra: Partial<Choice> = {}): Choice =>
  ({ id: `${list_key}-${code}`, list_key, code, name, name_en: null, hex: null, config: {}, sort_order: 0, is_active: true, ...extra });

const CHOICES: Choice[] = [
  ch("category", "body", "ตัวกระเป๋า", { name_en: "Body material", config: { source: "swatch" } }),
  ch("category", "hw", "อะไหล่", { name_en: "Hardware", config: { source: "sku", hw: true } }),
  ch("category", "zip", "ซิป", { name_en: "Zipper", config: { source: "swatch" } }),
  ch("category", "handle", "หูหิ้ว", { name_en: "Handle", config: { source: "swatch" } }),
  ch("category", "thread", "ด้าย", { name_en: "Stitching thread", config: { source: "color" } }),
  ch("hw_color", "silver", "เงิน", { name_en: "silver", hex: "#b8b8b8" }),
  ch("pocket_type", "zip", "ซิป", { name_en: "zip" }),
  ch("rule", "r1", "ซิปทองไม่คู่อะไหล่เงิน", { config: { a: "zip:ZP-5G", b: "hw_color:silver", reason: "ซิปทองห้ามคู่อะไหล่เงิน" } }),
];

const SPEC: Spec = cleanSpec({
  size: { w: 30, h: 35, d: 12, strap: 110 },
  handle: { drop: 18, w: 3, gap: 12, count: 2 },
  hw_color: "silver",
  pins: [
    { id: "p1", x: 40, y: 50, cat: "body", note: "", pick: { kind: "swatch", swatch_id: "s1", swatch_name: "แผงผ้า A", image_key: "k/panel.jpg", image_w: 2000, image_h: 1000, x: 10, y: 20, w: 5, h: 10, sku_id: "11111111-1111-1111-1111-111111111111", code: "PU-S12", name: "ซาฟเฟียโน่ มิ้นต์" } },
    { id: "p2", x: 30, y: 40, cat: "hw", note: "อยากได้แบบนี้", pick: { kind: "sku", sku_id: "22222222-2222-2222-2222-222222222222", code: "ABC-001", name: "กุญแจ เบอร์ 3", image_key: null } },
    { id: "p3", x: 70, y: 10, cat: "zip", note: "", pick: { kind: "swatch", swatch_id: "s2", swatch_name: "แผงซิป", image_key: null, image_w: null, image_h: null, x: 0, y: 0, w: 10, h: 10, sku_id: null, code: "ZP-5G", name: "ซิปทอง" } },
    { id: "p4", x: 50, y: 5, cat: "handle", note: "", pick: { kind: "same_as_body" } },
  ],
  pockets: { front: [{ id: "b1", x: 7, y: 12, w: 16, h: 14, type: "zip", note: "ใส่โทรศัพท์" }], inside_front: [{ id: "b2", x: 2, y: 3, w: 10, h: 8, type: "zip", note: "" }, { id: "b3", x: 15, y: 3, w: 10, h: 8, type: "zip", note: "" }] },
});

describe("cleanSpec", () => {
  it("บีบค่าให้อยู่ในช่วง + ตัดของแปลกทิ้ง", () => {
    const s = cleanSpec({ size: { w: -5, h: 999, d: "x", strap: 20 }, pins: [{ x: 150, y: -3, cat: "body", pick: { kind: "bogus" } }, "junk"], pockets: { front: [{ x: 100, y: 0, w: 50, h: 3 }], nope: [{}] } });
    expect(s.size).toEqual({ w: 0, h: 200, d: 0, strap: 20 });   // รอบ 6: ค่าแปลก/ติดลบ = 0 (ยังไม่ระบุ)
    expect(s.pins).toHaveLength(1);
    expect(s.pins[0]).toMatchObject({ x: 100, y: 0, pick: null });
    // กล่องช่องกว้างเกินกระเป๋า → บีบให้พอดี
    expect(s.pockets.front[0]).toMatchObject({ x: 0, w: 30 });   // กว้างยังไม่ระบุ = บีบในกรอบตัวอย่าง 30
    expect(Object.keys(s.pockets).sort()).toEqual(["back", "front", "inside_back", "inside_front"]);
  });
  it("ช่องข้างในมีได้หลายกล่องทั้ง 2 ฝั่ง", () => {
    expect(SPEC.pockets.inside_front).toHaveLength(2);
    expect(SPEC.pockets.inside_back).toHaveLength(0);
  });
});

describe("pickInfo / SKU", () => {
  it("หูหิ้วใช้วัสดุเดียวกับตัวกระเป๋า → อ้างชื่อตัวกระเป๋า", () => {
    expect(pickInfo(SPEC.pins[3].pick, { bodyPick: SPEC.pins[0].pick }).name).toContain("ซาฟเฟียโน่ มิ้นต์");
  });
  it("รวม SKU ไม่ซ้ำ (ข้ามชิ้นที่ไม่มี SKU)", () => {
    expect(specSkuIds(SPEC)).toHaveLength(2);
  });
});

describe("กฎห้ามคู่ + สต็อก", () => {
  it("ซิปทอง + อะไหล่เงิน = เตือน", () => {
    expect(ruleHits(SPEC, CHOICES).map((h) => h.reason)).toEqual(["ซิปทองห้ามคู่อะไหล่เงิน"]);
    expect(ruleHits({ ...SPEC, hw_color: "gold" }, CHOICES)).toEqual([]);
  });
  it("หมด / เหลือน้อย", () => {
    const r = stockHits(SPEC, { "11111111-1111-1111-1111-111111111111": 0, "22222222-2222-2222-2222-222222222222": 4 });
    expect(r.out.map((x) => x.code)).toEqual(["PU-S12"]);
    expect(r.low.map((x) => x.code)).toEqual(["ABC-001"]);
  });
});

describe("prompt 3 ชุด", () => {
  const ps = buildPrompts({ name: "TOTE-01", category: "tote bag" }, SPEC, CHOICES);
  it("มี 4 มุมรวมรูปเดียว · ข้างใน · คนสะพาย", () => {
    expect(ps.map((p) => p.key)).toEqual(["grid4", "inside", "model", "line", "3d"]);
    expect(ps[0].text).toContain("2x2 grid");
    expect(ps[0].text).toContain("12 cm (4.7 in) gusset");
  });
  it("อ้างเลขจุด + สีอะไหล่ + โน้ต + ช่อง", () => {
    expect(ps[0].text).toContain("Hardware: กุญแจ เบอร์ 3 (ABC-001), silver finish - note: อยากได้แบบนี้ [ref 2]");
    expect(ps[0].text).toContain("front outer zip pocket 16 cm (6.3 in) wide x 14 cm (5.5 in) high");
    expect(ps[1].text).toContain("inside front wall zip pocket 10 cm (3.9 in) wide");
    expect(ps[2].text).toContain("long shoulder strap, 110 cm (43.3 in) long");
  });
});

describe("ใบสรุป", () => {
  it("มีเส้นชี้ ตารางสรุป ช่อง และ prompt — ข้อความผู้ใช้ถูก escape", () => {
    const spec = cleanSpec({ ...SPEC, pins: [...SPEC.pins, { id: "p5", x: 5, y: 5, cat: "hw", note: "<script>x</script>", pick: null }] });
    const html = buildBriefHtml({
      template: { code: "TOTE-01", name: "ทรงถัง", category: "tote bag", image_key: "k/tote.jpg", image_w: 350, image_h: 254, vector_image_key: null },
      recipe: { seq: 3, name: null, note: null, created_by_name: "นุ่น", updated_at: "2026-11-13T00:00:00Z" },
      spec, choices: CHOICES, stock: {}, useVector: false, img: (k, w) => `/img?k=${k}&w=${w}`, dateText: "13 พ.ย. 2569",
    });
    expect(html).toContain("DESIGN BRIEF");
    expect(html).toContain("ตารางสรุป");
    expect(html).toContain("กฎทีม: ซิปทองห้ามคู่อะไหล่เงิน");
    expect(html).toContain("2x2 grid");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    // รูปชิ้นจากแผง = ตัดด้วย viewBox ตามกรอบ (2000×1000 · x10% y20% w5% h10%)
    expect(html).toContain('viewBox="200 200 100 100"');
  });
  it("รูปช่องโชว์ทุกกล่อง", () => {
    const svg = pocketPanelSvg(SPEC, "inside_front", CHOICES);
    expect(svg.match(/<rect /g)?.length).toBe(3);   // กรอบกระเป๋า + 2 กล่อง
  });
});

describe("รอบ 4: ประเภทกระเป๋า · หู · หน่วย · สตูดิโอ", () => {
  const types: Choice[] = [ch("bag_type", "HANB", "กระเป๋าถือ", { name_en: "Handbag" })];
  it("รหัสแม่แบบถัดไปตามตัวนำหน้า", () => {
    expect(nextTemplateCode("HANB", ["HANB-001", "hanb-003", "TOTE-009"])).toBe("HANB-004");
    expect(nextTemplateCode("tote", [])).toBe("TOTE-001");
  });
  it("ชื่ออังกฤษของประเภทใช้ใน prompt · แม่แบบเก่าที่พิมพ์ทรงเองใช้ข้อความเดิม", () => {
    expect(bagWord({ category: "HANB" }, types)).toBe("handbag");
    expect(bagWord({ category: "tote bag" }, types)).toBe("tote bag");
    const p = buildPrompts({ name: "X", category: "HANB" }, SPEC, [...CHOICES, ...types]);
    expect(p[0].text).toContain("handbag (X), 30 cm (11.8 in) wide");
  });
  it("หู: ไม่มีในสูตร = ยังไม่ระบุ (รอบ 6) + ความยาวรวมประมาณได้ + ใส่เองใช้ค่าที่ใส่", () => {
    expect(cleanSpec({}).handle).toEqual({ drop: 0, w: 0, gap: 0, count: -1, total: 0 });
    expect(SPEC.handle).toEqual({ drop: 18, w: 3, gap: 12, count: 2, total: 0 });
    expect(handleLength(SPEC.handle)).toBeGreaterThan(40);
    expect(handleLength({ ...SPEC.handle, total: 52 })).toBe(52);
    expect(buildPrompts({ name: "X" }, cleanSpec({ ...SPEC, handle: { count: 0 } }), CHOICES)[0].text).toContain("no top handles");
  });
  it("2 หน่วย", () => { expect(bothUnits(30)).toBe("30 cm (11.8 in)"); });
  it("ส่งเข้าสตูดิโอ: ขนาด + หู + ช่องซิปหน้า (วัดกลางช่องจากก้น)", () => {
    const p = toStudioParams(SPEC);
    expect(p).toMatchObject({ W: 30, H: 35, D: 12, wh: 3, g: 12, win: "rect", winType: "zip", ws: 16, wy: 23 });
    expect(dlDraftOf({ dl_draft: { params: p, notice: "n" } })).toEqual({ params: p, notice: "n" });
    expect(dlDraftOf({ schema: 2 })).toBeNull();
    expect(dlDraftOf(null)).toBeNull();
  });
});

describe("รอบ 5: ชุดสี + เทียบสูตร", () => {
  const RED = { kind: "color" as const, code: "TH-RED", name: "แดง", hex: "#cc0000" };
  const withCw = cleanSpec({ ...SPEC, colorways: [
    { id: "cw2", name: "สีแดง", hw_color: "gold", picks: { p1: { kind: "sku", sku_id: "33333333-3333-3333-3333-333333333333", code: "PU-RED", name: "PU แดง", image_key: null }, ghost: RED } },
    { id: "cw2", name: "ซ้ำ", hw_color: null, picks: {} },
    { id: "cw3", name: "", hw_color: null, picks: {} },
  ] });
  it("ทำความสะอาด: ตัดจุดที่ไม่มีแล้ว · id ซ้ำทิ้ง · ชื่อว่างตั้งให้", () => {
    expect(withCw.colorways.map((c) => c.id)).toEqual(["cw2", "cw3"]);
    expect(Object.keys(withCw.colorways[0].picks)).toEqual(["p1"]);
    expect(withCw.colorways[1].name).toBe("สี 3");
    expect(cleanSpec({ ...SPEC }).colorways).toEqual([]);   // สูตรเก่าไม่มีชุดสี
  });
  it("applyColorway: เปลี่ยนเฉพาะจุดที่ตั้ง + สีอะไหล่ · จุดอื่นเหมือนสีหลัก", () => {
    const v = applyColorway(withCw, "cw2");
    expect(pickInfo(v.pins[0].pick).code).toBe("PU-RED");
    expect(pickInfo(v.pins[1].pick).code).toBe("ABC-001");
    expect(v.hw_color).toBe("gold");
    expect(applyColorway(withCw, "cw3").hw_color).toBe("silver");
    expect(applyColorway(withCw, null)).toBe(withCw);
    expect(colorwayLabel(withCw, "cw2")).toBe("สีแดง");
    expect(colorwayLabel(withCw, null)).toBe("สีหลัก");
  });
  it("setColorwayPick: ตั้ง / กลับเป็นเหมือนสีหลัก / แก้สีหลักตรงจุด", () => {
    const a = setColorwayPick(withCw, "cw3", "p3", RED);
    expect(a.colorways[1].picks.p3).toEqual(RED);
    expect("p3" in setColorwayPick(a, "cw3", "p3", undefined).colorways[1].picks).toBe(false);
    expect(setColorwayPick(withCw, null, "p3", RED).pins[2].pick).toEqual(RED);
  });
  it("SKU รวมทุกชุดสี", () => {
    expect(allSkuIds(withCw)).toContain("33333333-3333-3333-3333-333333333333");
    expect(allSkuIds(withCw)).toContain("11111111-1111-1111-1111-111111111111");
  });
  it("ใบสรุปมีตารางชุดสี + ชื่อชุดสีที่หัวใบ", () => {
    const html = buildBriefHtml({ template: { code: "T-01", name: "ทรง", category: null, image_key: null, image_w: null, image_h: null, vector_image_key: null },
      recipe: { seq: 1, name: null, note: null, created_by_name: null, updated_at: "2026-11-14T00:00:00Z" }, spec: applyColorway(withCw, "cw2"), baseSpec: withCw, colorwayName: "สีแดง",
      choices: CHOICES, stock: {}, useVector: false, img: (k) => k, dateText: "14 พ.ย." });
    expect(html).toContain("ชุดสี (3 สี)");
    expect(html).toContain("PU-RED");
    expect(html).toContain("<b>สีแดง</b>");
  });
  it("เทียบข้ามแม่แบบ: จับคู่ตามหมวด · บอกบรรทัดที่ต่าง", () => {
    const B = cleanSpec({ size: { w: 30, h: 40, d: 12 }, hw_color: "silver", pins: [
      { id: "q1", x: 80, y: 80, cat: "body", note: "", pick: { kind: "sku", sku_id: "33333333-3333-3333-3333-333333333333", code: "PU-RED", name: "PU แดง", image_key: null } },
      { id: "q2", x: 10, y: 10, cat: "zip", note: "", pick: { kind: "swatch", swatch_id: "s2", swatch_name: "แผงซิป", image_key: null, image_w: null, image_h: null, x: 0, y: 0, w: 10, h: 10, sku_id: null, code: "ZP-5G", name: "ซิปทอง" } },
    ] });
    const rows = compareRecipes({ spec: SPEC, choices: CHOICES, template: { code: "A-1", name: "ทรง A" } }, { spec: B, choices: CHOICES, template: { code: "B-1", name: "ทรง B" } });
    const row = (l: string) => rows.find((r) => r.label === l)!;
    expect(row("กว้าง").same).toBe(true);
    expect(row("สูง").same).toBe(false);
    expect(row("ซิป").same).toBe(true);          // จุดอยู่คนละที่ แต่ของเหมือนกัน
    expect(row("ตัวกระเป๋า").same).toBe(false);
    expect(row("อะไหล่").b).toBe("—");           // ฝั่ง B ไม่มีหมวดนี้
    expect(row("ตัวกระเป๋า").picksB).toHaveLength(1);
  });
});

describe("รอบ 6: ขนาด/หูไม่บังคับ", () => {
  const EMPTY = cleanSpec({ ...SPEC, size: {}, handle: {} });
  it("สูตร/แม่แบบใหม่ = ว่าง · ใส่ครบไหม · กรอบช่องตัวอย่าง", () => {
    expect(cleanSpec({}).size).toEqual({ w: 0, h: 0, d: 0, strap: 0 });
    expect(sizeKnown(SPEC.size)).toBe(true);
    expect(sizeKnown({ w: 30, h: 35, d: 0, strap: 0 })).toBe(false);
    expect(panelSize(EMPTY.size)).toEqual({ w: 30, h: 35, placeholder: true });
    expect(EMPTY.pockets.front[0]).toMatchObject({ w: 16, h: 14 });                  // ช่องไม่หายเพราะยังไม่ใส่ขนาด
    expect(pocketPanelSvg(EMPTY, "front", CHOICES)).toContain("ยังไม่ใส่ขนาด");
  });
  it("prompt ไม่เขียน 0 cm · ข้ามขนาด/หูที่ไม่ระบุ (บั๊กจากรูปเจ้าของ)", () => {
    const ps = buildPrompts({ name: "X" }, EMPTY, CHOICES);
    for (const p of ps) { expect(p.text).not.toMatch(/0 cm/); expect(p.text).not.toContain("top handle"); expect(p.text).not.toContain("Real-world scale"); }
    expect(ps[0].text).toContain("side view.");
    const one = buildPrompts({ name: "X" }, cleanSpec({ ...SPEC, size: { w: 24.5, h: 15.5 }, handle: { count: 1 } }), CHOICES)[0].text;
    expect(one).toContain("24.5 cm (9.6 in) wide x 15.5 cm (6.1 in) high, 1 top handle.");
    expect(one).not.toContain("deep");
    expect(sizePhrase({ w: 0, h: 0, d: 0, strap: 0 })).toBe("");
    expect(handleText({ drop: 0, w: 2, gap: 0, count: 2, total: 0 })).toBe("2 top handles, each 2 cm (0.8 in) wide");
    expect(handleCountText(-1)).toBe("ยังไม่ระบุ");
  });
  it("ใบสรุป + เทียบสูตร แสดง — แทน 0", () => {
    const html = buildBriefHtml({ template: { code: "T", name: "X", category: null, image_key: null, image_w: null, image_h: null, vector_image_key: null }, recipe: { seq: 1, name: null, note: null, created_by_name: null }, spec: EMPTY, choices: CHOICES, stock: {}, useVector: false, img: (k: string) => k, dateText: "" } as never);
    expect(html).toContain("—×—×— ซม.");
    expect(html).toContain("ยังไม่ระบุ");
  });
});

describe("รอบ 6: prompt เปิด/ปิด · แก้ · เพิ่ม · แม่แบบทีม", () => {
  const TEAM = [...CHOICES,
    ch("prompt", "3d", "3D", { config: { default_on: false } }),
    ch("prompt", "desk", "บนโต๊ะไม้", { config: { text: "Photo of the {กระเป๋า} on a wooden table. Size {ขนาด}. {ไม่รู้จัก}", default_on: true } }),
    ch("prompt", "night", "กลางคืน", { config: { text: "Night shot {ประเภท}", default_on: false } }),
  ];
  it("ค่าเริ่มของทีม: ปิด 3D · แม่แบบทีมเติมคำแทน (คำไม่รู้จักคงไว้)", () => {
    const t = teamPromptSettings(TEAM);
    expect(t.defaults).toEqual({ "3d": false });
    expect(t.templates.map((x) => x.key)).toEqual(["team:desk", "team:night"]);
    const list = resolvePrompts({ name: "X" }, SPEC, TEAM);
    expect(list.map((p) => [p.key, p.on])).toEqual([["grid4", true], ["inside", true], ["model", true], ["line", true], ["3d", false], ["team:desk", true], ["team:night", false]]);
    const desk = list.find((p) => p.key === "team:desk")!;
    expect(desk.text).toContain("30 cm (11.8 in) wide x 35 cm (13.8 in) high x 12 cm (4.7 in) deep");
    expect(desk.text).toContain("{ไม่รู้จัก}");
    expect(fillPromptVars("{ ชื่อแม่แบบ }", promptContext({ name: "TOTE" }, SPEC, TEAM))).toBe("TOTE");
  });
  it("สูตรปรับสวิตช์ทับทีม · แก้ข้อความ + เตือนเมื่อสูตรเปลี่ยน · prompt ของสูตร · ใบสรุปพิมพ์เฉพาะที่เปิด", () => {
    const base = resolvePrompts({ name: "X" }, SPEC, TEAM).find((p) => p.key === "grid4")!;
    const spec = cleanSpec({ ...SPEC, prompts: { on: { "3d": true, grid4: false, bogus: true }, edits: { inside: { text: "my inside", base: resolvePrompts({ name: "X" }, SPEC, TEAM)[1].generated }, "own:x": { text: "no" } }, custom: [{ id: "c1", title: "มุมบน", text: "Top view of {ประเภท}" }, { id: "c1", text: "dup" }, { text: "" }] } });
    expect(Object.keys(spec.prompts.on)).toEqual(["3d", "grid4"]);
    expect(Object.keys(spec.prompts.edits)).toEqual(["inside"]);
    expect(spec.prompts.custom).toHaveLength(1);
    const list = resolvePrompts({ name: "X" }, spec, TEAM);
    expect(list.find((p) => p.key === "grid4")!.on).toBe(false);
    expect(list.find((p) => p.key === "3d")!.on).toBe(true);
    const inside = list.find((p) => p.key === "inside")!;
    expect(inside).toMatchObject({ text: "my inside", edited: true, stale: false });
    const changed = resolvePrompts({ name: "X" }, cleanSpec({ ...spec, size: { w: 40, h: 35, d: 12 } }), TEAM).find((p) => p.key === "inside")!;
    expect(changed.stale).toBe(true);
    expect(list.at(-1)).toMatchObject({ key: "own:c1", source: "recipe", on: true, text: "Top view of bag" });   // แม่แบบ {name:"X"} ไม่มีประเภท → "bag"
    expect(base.edited).toBe(false);
    const html = buildBriefHtml({ template: { code: "T", name: "X", category: null, image_key: null, image_w: null, image_h: null, vector_image_key: null }, recipe: { seq: 1, name: null, note: null, created_by_name: null }, spec, choices: TEAM, stock: {}, useVector: false, img: (k: string) => k, dateText: "" } as never);
    expect(html).toContain("my inside");
    expect(html).not.toContain("Create ONE image arranged");   // grid4 ปิด = ไม่พิมพ์
    expect(cleanPrompts(null)).toEqual({ on: {}, edits: {}, custom: [] });
  });
});
