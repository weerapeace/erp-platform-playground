import { describe, expect, it } from "vitest";
import {
  buildBriefHtml, buildPrompts, cleanSpec, pickInfo, pocketPanelSvg, ruleHits, specSkuIds, stockHits, type Choice, type Spec,
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
    expect(s.size).toEqual({ w: 1, h: 200, d: 12, strap: 20 });
    expect(s.pins).toHaveLength(1);
    expect(s.pins[0]).toMatchObject({ x: 100, y: 0, pick: null });
    // กล่องช่องกว้างเกินกระเป๋า → บีบให้พอดี
    expect(s.pockets.front[0]).toMatchObject({ x: 0, w: 1 });
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
    expect(ps.map((p) => p.key)).toEqual(["grid4", "inside", "model"]);
    expect(ps[0].text).toContain("2x2 grid");
    expect(ps[0].text).toContain("12 cm gusset");
  });
  it("อ้างเลขจุด + สีอะไหล่ + โน้ต + ช่อง", () => {
    expect(ps[0].text).toContain("Hardware: กุญแจ เบอร์ 3 (ABC-001), silver finish - note: อยากได้แบบนี้ [ref 2]");
    expect(ps[0].text).toContain("front outer zip pocket 16x14 cm");
    expect(ps[1].text).toContain("inside front wall zip pocket 10x8 cm");
    expect(ps[2].text).toContain("long shoulder strap (110 cm)");
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
