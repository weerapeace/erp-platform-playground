import { describe, expect, it } from "vitest";
import { applyColorway, cleanSpec, type Choice } from "./design-library";
import { estimateCost } from "./design-library-cost";
import { buildTechpackData, DEFAULT_DL_TECHPACK_TEMPLATE, DL_TECHPACK_SAMPLE_DATA } from "./design-library-techpack";
import { buildReportHtml } from "./template";

const ch = (list_key: Choice["list_key"], code: string, name: string, config: Record<string, unknown> = {}): Choice =>
  ({ id: `${list_key}-${code}`, list_key, code, name, name_en: null, hex: null, config, sort_order: 0, is_active: true });
const CHOICES = [ch("category", "body", "ตัวกระเป๋า", { source: "swatch" }), ch("category", "hw", "อะไหล่", { source: "sku", hw: true }), ch("hw_color", "gold", "ทอง"), ch("pocket_type", "zip", "ซิป")];

const base = cleanSpec({
  size: { w: 30, h: 22, d: 12 },
  hw_color: "gold",
  pins: [
    { id: "p1", x: 10, y: 10, cat: "body", note: "", pick: { kind: "sku", sku_id: "11111111-1111-1111-1111-111111111111", code: "PU-1", name: "PU ดำ", image_key: null } },
    { id: "p2", x: 20, y: 20, cat: "body", note: "", pick: { kind: "sku", sku_id: "11111111-1111-1111-1111-111111111111", code: "PU-1", name: "PU ดำ", image_key: null } },
    { id: "p3", x: 30, y: 30, cat: "hw", note: "<ห่วง>", pick: { kind: "sku", sku_id: "22222222-2222-2222-2222-222222222222", code: "HW-9", name: "ห่วง", image_key: null } },
  ],
  pockets: { inside_front: [{ id: "b1", x: 2, y: 2, w: 10, h: 8, type: "zip", note: "ใส่บัตร" }] },
  colorways: [{ id: "cw2", name: "สีแดง", hw_color: null, picks: { p1: { kind: "color", code: "RED", name: "แดง", hex: "#ff0000" } } }],
  cost: { price: { "code:PU-1": 987654 } },
});

const tpl = { paper_size: "A4" as const, orientation: "portrait" as const, ...DEFAULT_DL_TECHPACK_TEMPLATE };
const make = (cw: string | null) => {
  const spec = applyColorway(base, cw);
  const est = estimateCost(spec, CHOICES, { materials: {}, prices: {}, cost: base.cost });
  return buildTechpackData({
    template: { code: "HANB-001", name: "ทรงกล่อง", category: "HANB", image_key: null, image_w: null, image_h: null, vector_image_key: null },
    recipe: { seq: 3, name: null, note: null, created_by_name: "ทีม", updated_at: "2026-11-14T00:00:00Z" },
    spec, baseSpec: base, colorwayName: cw ? "สีแดง" : null, choices: CHOICES, lines: est.lines, renders: {}, img: (k) => k, dateText: "14 พ.ย.", bagType: "กระเป๋าถือ",
  });
};

describe("ใบสั่งทำตัวอย่าง", () => {
  it("วัสดุ: จำนวนจากตัวคิดปริมาณ · จุดซ้ำบอกว่ารวมในจุดแรก · สีอะไหล่ · ไม่มีราคา", () => {
    const d = make(null);
    const mats = d.materials as { qty: string; color: string; code: string }[];
    expect(Number(mats[0].qty)).toBeGreaterThan(0);
    expect(mats[1].qty).toBe("(รวมในจุดที่ 1)");
    expect(mats[2].color).toBe("สีอะไหล่ ทอง");
    const html = buildReportHtml(tpl, d, "x");
    expect(html).toContain("ใบสั่งทำตัวอย่าง");
    expect(html).not.toContain("987654");               // ราคาที่ใส่เองไม่หลุดลงใบช่าง
    expect(html).toContain("&lt;ห่วง&gt;");            // โน้ตผู้ใช้ถูก escape
    expect(html).toContain("ใส่บัตร");
    expect(html).toContain("ชุดสี (2 สี)");
  });
  it("ชุดสี: ใบของสีแดงใช้ของของชุดสีนั้น", () => {
    const d = make("cw2");
    expect((d.materials as { code: string }[])[0].code).toBe("RED");
    expect(d.colorway).toBe("สีแดง");
  });
  it("ข้อมูลตัวอย่างพิมพ์กับแม่แบบเริ่มต้นได้", () => {
    expect(buildReportHtml(tpl, DL_TECHPACK_SAMPLE_DATA, "x")).toContain("ซาฟเฟียโน่ มิ้นต์");
  });
});
