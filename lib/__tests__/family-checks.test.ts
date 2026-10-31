import { describe, expect, it } from "vitest";

import { FAMILY_DEFAULT_OPTIONS, buildFamilySheet, familyHtmlData, type FamilyBuyLine, type FamilyInput } from "@/lib/family-print";
import { familyIssues, issueFlags } from "@/lib/family-checks";

// ข้อมูลจริงจาก DB (2026-10-31) — รุ่น BPU04 · 3 จุดที่เจ้าของอยากแก้จากหน้าพิมพ์
const BP = ["06", "07", "11", "21", "22"];
const mo = (s: string) => `MO-2026-004${79 + BP.indexOf(s)}`;
const L = (s: string, code: string, name: string, type: string | null, uom: string, per: number, seq: number): FamilyBuyLine => ({
  mo_no: mo(s), code, name, type, uom, qty_per: per, required: per * 30, remaining: per * 30, status: "buy", po_nos: [], seq, image_url: null,
});
function bpu04(): FamilyInput {
  const pu: [string, string, string][] = [["06", "352", "สีเขียว"], ["07", "232", "สีชมพู"], ["11", "240", "สีเขียวขี้ม้า"], ["21", "266", "สีชมพูพีช"], ["22", "258", "สีส้ม"]];
  return {
    key: "BPU04", parent: { code: "BPU04", name: null, image_url: null },
    mos: BP.map((s) => ({ id: s, mo_no: mo(s), product_sku: `BPU04-${s}`, qty: 30 })),
    skus: BP.map((s) => ({ code: `BPU04-${s}`, variant: s === "21" || s === "22" ? "Rosewood PU (21)" : `สี ${s}`, image_url: null })),
    buy: [
      ...pu.map(([s, n, c]) => L(s, `PU-HRH-7261#${n}`, `พียู(PU) HRH-7261 เบอร์#${n} ${c}`, "PU", "หลา", 0.1556, 1)),
      L("06", "ZIP-N-NO.5#D221-22IN", "ซิปไนล่อน#5#D221 สีชมพูนู้ด ตัด22นิ้ว", "ซิป", "หลา", 0.289, 3),
      L("07", "ZIP-N-NO.3#G369", "ซิปไนล่อน#5 #G369 สีชมพู", "ซิป", "หลา", 0.289, 5),
      L("22", "ZIP-N-NO.5#G283", "ซิปไนล่อน#5 #G283 สีแทน", "ซิป", "หลา", 0.289, 4),
      L("11", "ZIP-N-NO.5#G515", "ZIP-N-NO.5#G515", "ซิป", "Units", 0.2889, 6),
      L("21", "ZIP-N-NO.5#G380", "ซิปไนล่อน#5 #G380 สีชมพู", null, "หลา", 0.289, 4),
      ...BP.map((s) => L(s, "ZH-NL-NO.5-PK+P", "หัวซิปไนล่อน#5 พร้อมหางสีชมพู YKK", "อะไหล่", "Units", 1, 2)),
      ...BP.map((s) => L(s, "ETC00005", "กระดาษขาวแข็ง", "ตัวเสริม", "Units", s === "06" ? 0 : 1, 7)),
    ],
    cut: [],
    masters: {
      components: {
        "ZIP-N-NO.5#G515": { id: "sku-g515", name: "ZIP-N-NO.5#G515", uom: "Units", type: "ซิป", color: "#515 เขียวทหาร" },
        "ZIP-N-NO.5#G380": { id: "sku-g380", name: "ซิปไนล่อน#5 #G380 สีชมพู", uom: "หลา", type: null, color: "#380 ชมพูพีชตุ่น" },
      },
      products: { "BPU04-21": { id: "p21", color: "Rosewood PU (21)" }, "BPU04-22": { id: "p22", color: "Rosewood PU (21)" } },
      bom_by_mo: Object.fromEntries(BP.map((s) => [mo(s), `BOM-BPU04-${s}`])),
    },
  };
}

describe("ตรวจข้อมูล — BPU04 จริง", () => {
  const issues = familyIssues(bpu04());
  const by = Object.fromEntries(issues.map((i) => [i.key, i]));

  it("ซิป G515: หน่วยไม่ตรง (แนะนำหลา) + ชื่อเป็นรหัส (แนะนำชื่อไทยจากซิปตัวอื่น + สีในข้อมูลวัตถุดิบ)", () => {
    const g = by["m:ZIP-N-NO.5#G515"];
    expect(g.target).toBe("material");
    expect(g.sku_id).toBe("sku-g515");
    expect(g.fields.uom).toEqual({ current: "Units", suggest: "หลา" });
    expect(g.fields.name?.suggest).toBe("ซิปไนล่อน#5 #G515 สีเขียวทหาร");
    expect(g.mos).toEqual(["MO-2026-00481"]);
    expect(g.bom_codes).toEqual(["BOM-BPU04-11"]);
  });

  it("ซิป G380: ยังไม่ตั้งชนิด → แนะนำ 'ซิป'", () => {
    expect(by["m:ZIP-N-NO.5#G380"].fields.type).toEqual({ current: null, suggest: "ซิป" });
  });

  it("ชื่อสีซ้ำ: -21 ถูก (ตรงกับ '(21)') · -22 ต้องแก้ → แนะนำจากสี PU หลัก", () => {
    expect(by["p:BPU04-21"]).toBeUndefined();
    expect(by["p:BPU04-22"].fields.color).toEqual({ current: "Rosewood PU (21)", suggest: "สีส้ม (22)" });
    expect(by["p:BPU04-22"].sku_id).toBe("p22");
  });

  it("BOM ใส่จำนวน 0 → ต้องเปิดตัวแก้ BOM ของสีนั้น · ของที่ถูกต้องไม่ถูกจับ", () => {
    expect(by["q:BPU04-06"]).toMatchObject({ target: "bom", products: ["BPU04-06"], flag_codes: ["ETC00005"], bom_codes: ["BOM-BPU04-06"] });
    expect(by["m:ZH-NL-NO.5-PK+P"]).toBeUndefined();   // อะไหล่ Units เหมือนกันหมด = ปกติ
    expect(by["m:PU-HRH-7261#352"]).toBeUndefined();
    expect(issues.map((i) => i.target)).toEqual(["material", "material", "product", "bom"]);
  });
});

describe("แบบ B — กรอบเหลือง + ปุ่ม 'แก้' บนเอกสาร (เฉพาะบนจอ)", () => {
  const inp = bpu04();
  const flags = issueFlags(familyIssues(inp));
  const html = familyHtmlData(buildFamilySheet(inp), { ...FAMILY_DEFAULT_OPTIONS, flags });

  it("หน่วยต่างแต่เป็นคนละของ (กระดาษเป็นแผ่น · พลาสติกเป็นหลา) → ไม่จับผิด — เคสจริง PIX21", () => {
    const base = bpu04();
    const sheet = (s: string, code: string, name: string, uom: string) => L(s, code, name, "ตัวเสริม", uom, 1, 8);
    const inp = { ...base, buy: [...base.buy.filter((l) => l.code !== "ETC00005"),
      sheet("06", "ETC00026-1", "พลาสติกใส 0.5 mm.(สโนลอย)", "หลา"), sheet("07", "ETC00026/0.30*54", "พลาสติกใส 0.30*54 Y", "หลา"), sheet("11", "SP-0006", "กระดาษขาวแข็ง 450 แกรม", "Units")] };
    expect(familyIssues(inp).map((i) => i.key)).not.toContain("m:SP-0006");
  });

  it("แถว/การ์ดที่มีปัญหาติด data-fix · ไม่มีธง = ไม่มีอะไรเพิ่ม", () => {
    expect(html.body_html as string).toContain('class="fp-flag" data-fix="m:ZIP-N-NO.5#G515"');
    expect(html.body_html as string).toContain('<span class="fp-pen" data-fix="m:ZIP-N-NO.5#G380">แก้</span>');
    expect(html.head_html as string).toContain('fp-card fp-flag" data-fix="p:BPU04-22"');
    const clean = familyHtmlData(buildFamilySheet(inp), FAMILY_DEFAULT_OPTIONS);
    expect(`${clean.head_html}${clean.body_html}`).not.toContain("data-fix");
  });
});
