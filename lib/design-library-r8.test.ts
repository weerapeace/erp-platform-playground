import { describe, expect, it } from "vitest";
import {
  accessoryLabel, accessoriesText, buildBriefHtml, cleanSpec, dimText, frameForImage, logoBoxPct, logoColorEn, logoText, nextAccessoryCode, pinExtraText, pinFromClipboard, pinsFromClipboard,
  pinsToClipboard, pinToClipboard, placeGroup, recipeChecks, sizeFromName, viewsCalloutHtml, type BriefInput, type Choice,
} from "./design-library";
import { cleanCost, estimateCost } from "./design-library-cost";

const ch = (list_key: Choice["list_key"], code: string, name: string, extra: Partial<Choice> = {}): Choice =>
  ({ id: `${list_key}-${code}`, list_key, code, name, name_en: null, hex: null, config: {}, sort_order: 0, is_active: true, ...extra });
const CHOICES: Choice[] = [
  ch("category", "body", "ตัวกระเป๋า", { config: { source: "swatch" } }),
  ch("category", "logo", "โลโก้", { config: { source: "logo" } }),
  ch("category", "zip", "ซิป", { config: { source: "sku" } }),
  ch("category", "hw", "อะไหล่", { config: { source: "sku", hw: true } }),
  ch("category", "tape", "เทป", { config: { source: "sku" } }),
  ch("logo_method", "emboss", "Embossed", { name_en: "Embossed", config: { options: [{ code: "gold", name: "ฟอยล์ทอง", name_en: "Gold foil" }], block_fee: 800, unit_fee: 3 } }),
  ch("logo_method", "metal", "โลโก้โลหะสำเร็จ", { name_en: "Metal plate", config: { needs_material: true, no_artwork: true } }),
];
const ZIP = "33333333-3333-3333-3333-333333333333", KC = "44444444-4444-4444-4444-444444444444";

describe("รอบ 8 — ขนาดโลโก้ / สี / ข้อความ", () => {
  it("อ่านขนาดจากชื่อ SKU (cm / mm / ไม่มีหน่วย / X ใหญ่)", () => {
    expect(sizeFromName("โลโก้แผ่นใหญ่ 4.5 x 2 cm. สีทอง")).toEqual({ w: 4.5, h: 2 });
    expect(sizeFromName("โลโก้เหล็ก 35 x 6 mm. สีรมดำ")).toEqual({ w: 3.5, h: 0.6 });
    expect(sizeFromName("โลโก้ Kaew Kanda 5 X 3.9 cm.")).toEqual({ w: 5, h: 3.9 });
    expect(sizeFromName("ป้าย 3*1.5")).toEqual({ w: 3, h: 1.5 });
    expect(sizeFromName("โลโก้ Pixie Dustie สีทอง")).toBeNull();
    expect(sizeFromName(null)).toBeNull();
  });
  it("สีโลโก้เข้า prompt เป็นอังกฤษ · ข้อความไทยมี สี…", () => {
    const p = { kind: "logo" as const, image_key: "k", name: "L", asset_id: null, method: "emboss", option: "gold", color: "ทอง" };
    expect(logoText(p, CHOICES)).toBe("Embossed · ฟอยล์ทอง · สีทอง");
    expect(logoText(p, CHOICES, "en")).toBe("Gold foil Embossed logo in gold");
    expect(logoColorEn("สีรมดำ")).toBe("gunmetal");
    expect(logoColorEn("Pantone 871C")).toBe("Pantone 871C");
  });
  it("จำนวน/ยาว/ขนาดของจุดเป็นข้อความ", () => {
    expect(pinExtraText({ id: "a", x: 0, y: 0, cat: "hw", pick: null, note: "", qty: 4 })).toBe("4 ชิ้น");
    expect(pinExtraText({ id: "a", x: 0, y: 0, cat: "zip", pick: null, note: "", len: 28 }, "en")).toBe("28 cm (11 in) long");
    expect(pinExtraText({ id: "a", x: 0, y: 0, cat: "logo", pick: null, note: "", dim: { w: 4.5, h: 2 } })).toBe("ขนาด 4.5 × 2 ซม.");
    expect(dimText({ w: 3.5, h: 0.6 }, "en")).toBe("3.5 x 0.6 cm (1.4 x 0.2 in)");
  });
});

describe("รอบ 8 — ทำความสะอาดสูตร (จุด / มุม / ส่วนเสริม)", () => {
  const raw = {
    views: [{ id: "v1", label: "ด้านหลัง", image_key: "b.jpg", w: 800, h: 600 }, { id: "v1", image_key: "dup.jpg" }, { image_key: "" }],
    pins: [
      { id: "p1", x: 10, y: 10, cat: "hw", pick: null, note: "", qty: 4, len: 0, view: "v1" },
      { id: "p2", x: 20, y: 20, cat: "logo", pick: { kind: "logo", image_key: null, name: "", asset_id: null, color: "ทอง" }, note: "", qty: 1, dim: { w: 4.555, h: 2 }, view: "gone" },
      { id: "p3", x: 30, y: 30, cat: "logo", pick: null, note: "", dim: { w: 3, h: 0 } },
    ],
    accessories: [{ id: "a1", code: "ACC-001", name: "พวงกุญแจ", qty: 2, pos: { x: 150, y: 20, view: "v1" } }, { id: "a2", code: "ACC-002", name: "ชาร์ม", pos: { x: 5, y: 5, view: "gone" } }],
  };
  const s = cleanSpec(raw);
  it("ใส่เฉพาะค่าที่มี · มุมที่ไม่มีแล้ว = รูปหลัก · ขนาดครึ่ง ๆ = ทิ้ง", () => {
    expect(s.views).toEqual([{ id: "v1", label: "ด้านหลัง", image_key: "b.jpg", w: 800, h: 600 }]);
    expect(s.pins[0]).toMatchObject({ qty: 4, view: "v1" });
    expect(s.pins[0]).not.toHaveProperty("len");
    expect(s.pins[1]).not.toHaveProperty("qty");
    expect(s.pins[1]).not.toHaveProperty("view");
    expect(s.pins[1].dim).toEqual({ w: 4.56, h: 2 });
    expect(s.pins[1].pick).toMatchObject({ kind: "logo", color: "ทอง" });   // โลโก้มีแต่สี ยังเก็บ
    expect(s.pins[2]).not.toHaveProperty("dim");
  });
  it("ส่วนเสริม: จำนวน + ตำแหน่ง (บีบในรูป) · มุมถูกลบ = หลุดจากรูป", () => {
    expect(s.accessories[0]).toMatchObject({ qty: 2, pos: { x: 100, y: 20, view: "v1" } });
    expect(s.accessories[1].pos ?? null).toBeNull();
    expect(accessoriesText(s)).toContain("2 x พวงกุญแจ");
    expect(accessoryLabel(1)).toBe("A2");
    expect(nextAccessoryCode(["ACC-001", "ACC-009", "X-1"])).toBe("ACC-010");
    expect(nextAccessoryCode([])).toBe("ACC-001");
  });
});

describe("รอบ 8 — คัดลอกหลายจุด + วางทั้งกลุ่ม", () => {
  const pins = [
    { id: "a", x: 10, y: 10, cat: "hw", pick: null, note: "", qty: 4 },
    { id: "b", x: 20, y: 15, cat: "zip", pick: null, note: "x", len: 28 },
  ];
  it("หลายจุด ↔ คลิปบอร์ด (1 จุด = รูปแบบเดิม)", () => {
    const back = pinsFromClipboard(pinsToClipboard(pins));
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ x: 10, y: 10, qty: 4 });
    expect(back[1]).toMatchObject({ cat: "zip", len: 28, note: "x" });
    expect(pinFromClipboard(pinsToClipboard(pins))).toBeNull();   // ตัวอ่านแบบเดิมไม่รับกลุ่ม
    expect(pinsFromClipboard(pinToClipboard(pins[0]))).toHaveLength(1);
    expect(pinsFromClipboard("hello")).toEqual([]);
  });
  it("วางกลุ่มที่ตำแหน่งเมาส์ ระยะห่างคงเดิม บีบในรูป", () => {
    expect(placeGroup(pins, { x: 50, y: 50 }).map((p) => [p.x, p.y])).toEqual([[50, 50], [60, 55]]);
    expect(placeGroup(pins, { x: 95, y: 98 }).map((p) => [p.x, p.y])).toEqual([[95, 98], [100, 100]]);
  });
});

describe("รอบ 8 — โลโก้ขนาดจริงบนรูป", () => {
  const s = cleanSpec({ size: { w: 30, h: 20, d: 10 }, pocket_bg: { front: { key: "t.jpg", w: 1000, h: 1000, frame: { x: 10, y: 20, w: 60, h: 40 } } } });
  it("ใช้กรอบของรูปเดียวกัน · กล่องโลโก้ = ขนาด ÷ ขนาดกระเป๋า × กรอบ", () => {
    const fr = frameForImage(s, "t.jpg");
    expect(fr).toEqual({ frame: { x: 10, y: 20, w: 60, h: 40 }, w: 30, h: 20 });
    expect(frameForImage(s, "other.jpg")).toBeNull();
    const box = logoBoxPct({ id: "p", x: 40, y: 40, cat: "logo", pick: null, note: "", dim: { w: 6, h: 2 } }, fr);
    expect(box).toEqual({ x: 34, y: 38, w: 12, h: 4 });
    expect(logoBoxPct({ id: "p", x: 40, y: 40, cat: "logo", pick: null, note: "" }, fr)).toBeNull();
    expect(frameForImage(cleanSpec({ pocket_bg: s.pocket_bg }), "t.jpg")).toBeNull();   // ยังไม่ใส่ขนาด = วัดไม่ได้
  });
});

describe("รอบ 8 — ตรวจก่อนส่ง", () => {
  it("โลโก้ขาดวิธี/แบบ/ขนาด/ไฟล์ · โลหะไม่ต้องมีไฟล์แต่ต้องมี SKU · ส่วนเสริมไม่มีรูป", () => {
    const s = cleanSpec({
      size: { w: 30, h: 20, d: 10 },
      pins: [
        { id: "a", x: 1, y: 1, cat: "logo", note: "", pick: { kind: "logo", image_key: "k", name: "", asset_id: null, method: "emboss" } },
        { id: "b", x: 1, y: 1, cat: "logo", note: "", pick: { kind: "logo", image_key: null, name: "", asset_id: null, method: "metal" }, dim: { w: 4, h: 2 } },
        { id: "c", x: 1, y: 1, cat: "logo", note: "", pick: null },
      ],
      accessories: [{ id: "x", code: "ACC-001", name: "ชาร์ม" }],
    });
    const t = recipeChecks(s, CHOICES).map((c) => c.text);
    expect(t).toContain("จุด 1 โลโก้ยังไม่เลือกแบบของ Embossed");
    expect(t).toContain("จุด 1 โลโก้ยังไม่ใส่ขนาด");
    expect(t).not.toContain("จุด 1 โลโก้ยังไม่มีไฟล์โลโก้");
    expect(t).toContain("จุด 2 โลโก้ โลโก้โลหะสำเร็จ ยังไม่เลือกวัสดุ");
    expect(t).not.toContain("จุด 2 โลโก้ยังไม่มีไฟล์โลโก้");
    expect(t.some((x) => x.startsWith("จุด 3"))).toBe(false);   // ยังไม่เลือกอะไร = ตัวตรวจเดิมเตือนแล้ว
    expect(t).toContain("ส่วนเสริม ชาร์ม ยังไม่มีรูป");
  });
});

describe("รอบ 8 — ทุน: จำนวน/ยาวต่อจุด · ส่วนเสริม · ค่าทำโลโก้ · ค่าครั้งแรก", () => {
  const spec = cleanSpec({
    size: { w: 30, h: 20, d: 10 },
    pins: [
      { id: "z", x: 1, y: 1, cat: "zip", note: "", pick: { kind: "sku", sku_id: ZIP, code: "ZIP-5", name: "ซิปม้วน", image_key: null }, len: 28, qty: 2 },
      { id: "h", x: 1, y: 1, cat: "hw", note: "", pick: { kind: "sku", sku_id: "55555555-5555-5555-5555-555555555555", code: "EY-1", name: "ตาไก่", image_key: null }, qty: 4 },
      { id: "t", x: 1, y: 1, cat: "tape", note: "", pick: { kind: "text", text: "เทป" }, len: 50 },
      { id: "l", x: 1, y: 1, cat: "logo", note: "", pick: { kind: "logo", image_key: "logo.png", name: "L", asset_id: null, method: "emboss" } },
      { id: "l2", x: 1, y: 1, cat: "logo", note: "", pick: { kind: "logo", image_key: "logo.png", name: "L", asset_id: null, method: "emboss" } },
    ],
    accessories: [{ id: "a", code: "ACC-001", name: "พวงกุญแจ", sku_id: KC, sku_code: "KC-1", qty: 2 }, { id: "b", code: "ACC-002", name: "ชาร์ม" }],
  });
  const mats = { [ZIP]: { code: "ZIP-5", name: "ซิปม้วน", uom: "เมตร", face_width_cm: null } };
  it("ซิปขายเป็นเมตร = ยาว × จำนวน ÷ 100 · อะไหล่ = จำนวนต่อจุด · เทปใช้ความยาวที่ใส่", () => {
    const e = estimateCost(spec, CHOICES, { materials: mats, prices: {} });
    const zip = e.lines.find((l) => l.key === "pin:z")!;
    expect(zip.autoQty).toBeCloseTo(0.56, 4);
    expect(zip.detail).toContain("× 2");
    expect(e.lines.find((l) => l.key === "pin:h")!.autoQty).toBe(4);
    expect(e.lines.find((l) => l.key === "pin:t")!.detail).toContain("ยาว 50");
  });
  it("ส่วนเสริมเข้าทุน (SKU ราคา × จำนวน) · ไม่ผูก SKU = ใส่เอง", () => {
    const e = estimateCost(spec, CHOICES, { materials: mats, prices: { [KC]: 15 } });
    const kc = e.lines.find((l) => l.key === "acc:ACC-001")!;
    expect(kc).toMatchObject({ qty: 2, unitPrice: 15, priceSource: "sku", amount: 30 });
    expect(e.lines.find((l) => l.key === "acc:ACC-002")!.priceSource).toBe("none");
  });
  it("ค่าทำต่อชิ้นของวิธีโลโก้ = ราคาเมื่อไม่มีราคาอื่น · ค่าบล็อก 1 ครั้งต่อไฟล์ · หารตามล็อต", () => {
    const e = estimateCost(spec, CHOICES, { materials: mats, prices: {} });
    const logo = e.lines.find((l) => l.key === "pin:l")!;
    expect(logo).toMatchObject({ unitPrice: 3, priceSource: "fee" });
    expect(e.once).toHaveLength(1);
    expect(e.once[0]).toMatchObject({ amount: 800, source: "fee" });
    expect(e.once[0].key.length).toBeLessThanOrEqual(120);
    expect(e.oncePerBag).toBe(0);
    const k = e.once[0].key;
    const cost = cleanCost({ price: { [k]: 1000 }, once: [{ label: "แม่พิมพ์", amount: 200 }, { label: "", amount: 0 }], batch: 100 });
    expect(cost.once).toHaveLength(1);
    const e2 = estimateCost(spec, CHOICES, { materials: mats, prices: {}, cost });
    expect(e2.onceTotal).toBe(1200);
    expect(e2.oncePerBag).toBe(12);
    expect(e2.total).toBeCloseTo(e2.materials + 12, 2);
  });
});

describe("รอบ 8 — ใบสรุป: มุมเพิ่ม + ป้ายส่วนเสริม", () => {
  it("ภาพเส้นชี้แยกมุม (เฉพาะมุมที่มีจุด) · ป้าย A1 · ตารางส่วนเสริมมีจำนวน", () => {
    const spec = cleanSpec({
      views: [{ id: "v1", label: "ด้านหลัง", image_key: "back.jpg", w: 800, h: 600 }, { id: "v2", label: "ด้านข้าง", image_key: "side.jpg" }],
      pins: [{ id: "a", x: 30, y: 30, cat: "hw", note: "", pick: null }, { id: "b", x: 60, y: 40, cat: "hw", note: "", pick: null, view: "v1", qty: 3 }],
      accessories: [{ id: "x", code: "ACC-001", name: "พวงกุญแจ", qty: 2, pos: { x: 20, y: 20, view: "v1" } }],
    });
    const b: BriefInput = {
      template: { code: "T-1", name: "โท้ท", category: null, image_key: "main.jpg", image_w: 1000, image_h: 1000, vector_image_key: null },
      recipe: { seq: 1, name: null, note: null, created_by_name: null, updated_at: "" }, spec, choices: CHOICES, stock: {}, useVector: false, img: (k) => `/img/${k}`, dateText: "",
    };
    const v = viewsCalloutHtml(b);
    expect(v).toContain("/img/back.jpg");
    expect(v).not.toContain("side.jpg");
    expect(v).toContain(">A1<");
    expect(v).toContain(">2<");   // เลขจุดเดิมทั้งสูตร (จุดที่ 2 อยู่มุมหลัง)
    const html = buildBriefHtml(b);
    expect(html).toContain("มุม: ด้านหลัง");
    expect(html).toContain("3 ชิ้น");
  });
});
