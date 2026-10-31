import { describe, expect, it } from "vitest";

import { buildReportHtmlMulti } from "@/lib/template";
import {
  FAMILY_DEFAULT_OPTIONS, buildFamilySheet, buildFamilyTemplate, colourWord, familyHtmlData, familyOrientation, sharedLabel, shortCodes,
  type FamilyBuyLine, type FamilyCutLine, type FamilyInput,
} from "@/lib/family-print";

// ข้อมูลจริงจาก DB (2026-10-31) — รุ่น PIX25 ใบเปิด 6 ใบ (สีละใบ)
const SKUS: [string, number, string][] = [["01", 20, "00292"], ["02", 10, "00293"], ["03", 10, "00294"], ["04", 10, "00295"], ["05", 20, "00296"], ["06", 20, "00297"]];
const PU: Record<string, [string, string]> = { "01": ["M638-19-4004", "สีดำ"], "02": ["M638-16-2124", "สีชมพูบานเย็น"], "03": ["M638-12-2903", "สีม่วง"], "04": ["M638-14-4506", "สีฟ้า"], "05": ["M638-20-0095", "สีชมพู"], "06": ["M638-20-0082", "สีขาว"] };
const ZIP: Record<string, string> = { "01": "BT-NO.5#G322", "02": "BT-NO.5#G141", "03": "BT-NO.5#G412", "04": "BT-NO.5#G183", "05": "BT-NO.5#G365", "06": "BT-NO.5#G101" };

const mo = (s: string) => `MO-2026-${SKUS.find((x) => x[0] === s)![2]}`;
const qty = (s: string) => SKUS.find((x) => x[0] === s)![1];
const buy = (s: string, p: Partial<FamilyBuyLine>): FamilyBuyLine => ({
  mo_no: mo(s), code: null, name: null, type: null, uom: "หลา", qty_per: 1, required: 0, remaining: 0, status: "buy", po_nos: [], seq: 1, image_url: null, ...p,
  ...(p.required == null ? { required: (p.qty_per ?? 1) * qty(s), remaining: p.status && p.status !== "buy" ? 0 : (p.qty_per ?? 1) * qty(s) } : {}),
});
const cut = (s: string, p: Partial<FamilyCutLine>): FamilyCutLine => ({
  mo_no: mo(s), code: null, name: null, type: null, block: null, width: null, length: null, pieces: 1, size_label: null, cut_done: false, seq: 1, image_url: null, ...p,
});

function pix25(): FamilyInput {
  const lines: FamilyBuyLine[] = [];
  const cuts: FamilyCutLine[] = [];
  for (const [s] of SKUS) {
    lines.push(buy(s, { code: PU[s][0], name: `พียูหนังเทียม M638#${PU[s][0].slice(5)} ${PU[s][1]}`, type: "PU", qty_per: 0.0728, seq: 1 }));
    lines.push(buy(s, { code: ZIP[s], name: `ซิปฟันกระดูก #5 ${PU[s][1]} #${ZIP[s].slice(8)}`, type: "ซิป", qty_per: 0.33, seq: 2,
      ...(s === "06" ? {} : { status: "ordered" as const, po_nos: ["PO-2026-00185"] }) }));
    lines.push(buy(s, { code: "A025-4/12MM#N", name: "คอหมาก้นกลม 1.2 cm. สีนิเกิ้ล", type: "อะไหล่", uom: "Units", qty_per: 1, seq: 3, image_url: "/img/neck" }));
    lines.push(buy(s, { code: "B093/20MM#N", name: "ห่วงกลมกดข้าง 2 cm. สีนิเกิ้ล", type: "อะไหล่", uom: "Units", qty_per: 1, seq: 4,
      ...(s === "01" ? { status: "ordered" as const, po_nos: ["PO-2026-00166"] } : {}) }));
    lines.push(buy(s, { code: "ETC00005", name: "กระดาษขาวแข็ง", type: "ตัวเสริม", uom: "Units", qty_per: 0, required: 0, remaining: 0, status: "skip", seq: 5 }));
    for (const [w, l, p] of [[11.2, 15.9, 1], [26.5, 4, 2], [26.4, 6.8, 1]] as const) {
      cuts.push(cut(s, { code: PU[s][0], name: `พียูหนังเทียม M638#${PU[s][0].slice(5)} ${PU[s][1]}`, type: "PU", width: w, length: l, pieces: p, seq: 1 }));
    }
    cuts.push(cut(s, { code: ZIP[s], name: `ซิปฟันกระดูก #5 ${PU[s][1]}`, type: "ซิป", width: 0, length: 27, pieces: 1, seq: 2 }));
    cuts.push(cut(s, { code: "ETC00005", name: "กระดาษขาวแข็ง", type: "ตัวเสริม", width: 9.5, length: 14.2, pieces: 2, seq: 5 }));
    cuts.push(cut(s, { code: "A025-4/12MM#N", name: "คอหมาก้นกลม", type: "อะไหล่", width: 0, length: 0, pieces: 1, seq: 3 }));   // อะไหล่ = ไม่ต้องตัด
  }
  return {
    key: "PIX25", parent: { code: "PIX25", name: "Pixie Cupcake Bag", image_url: "/img/parent" },
    mos: SKUS.map(([s, q, n]) => ({ id: `id-${s}`, mo_no: `MO-2026-${n}`, product_sku: `PIX25-${s}`, qty: q, due_date: null, status: "draft" })),
    skus: SKUS.map(([s]) => ({ code: `PIX25-${s}`, variant: `สี ${s}`, image_url: `/img/${s}` })),
    buy: lines, cut: cuts,
  };
}

describe("ตัวช่วยตั้งชื่อ / รหัสย่อ", () => {
  it("ตัดส่วนหน้าที่เหมือนกันที่ตัวคั่น", () => {
    const m = shortCodes(Object.values(PU).map((x) => x[0]));
    expect(m.get("M638-19-4004")).toBe("19-4004");
    expect(shortCodes(Object.values(ZIP)).get("BT-NO.5#G322")).toBe("G322");
    expect(shortCodes(["V512-27", "V512-2", "V512-12"]).get("V512-2")).toBe("2");
    expect(shortCodes(["ABC", "XYZ"]).get("ABC")).toBe("ABC");   // ไม่มีส่วนร่วม = รหัสเต็ม
  });
  it("ชื่อแถวของต่างสี = ส่วนหน้าที่เหมือนกัน", () => {
    expect(sharedLabel(["พียูหนังเทียม M638#12-2903 สีม่วง", "พียูหนังเทียม M638#19-4004 สีดำ"], "PU")).toBe("พียูหนังเทียม M638");
    expect(sharedLabel(["ผ้าขน V512 สีขาว #2 (หน้ากว้าง 150 cm.)", "ผ้าขน V512 สีดำ #27 (หน้ากว้าง 150 cm.)"], "ผ้า")).toBe("ผ้าขน V512");
    expect(sharedLabel(["หนังวัว", "ผ้าใบ"], "ผ้า")).toBe("ผ้า");
    expect(colourWord("ซิปฟันกระดูก #5 สีชมพูเข้ม #G141")).toBe("สีชมพูเข้ม");
    expect(colourWord("หมุด 6x6")).toBeNull();
  });
});

describe("buildFamilySheet — PIX25 จริง", () => {
  const s = buildFamilySheet(pix25());

  it("คอลัมน์ = 6 สี เรียงรหัส · รวม 90 ชิ้น", () => {
    expect(s.columns.map((c) => c.sku)).toEqual(["PIX25-01", "PIX25-02", "PIX25-03", "PIX25-04", "PIX25-05", "PIX25-06"]);
    expect(s.stats).toMatchObject({ skus: 6, mos: 6, qty: 90 });
  });

  it("PU ต่างสี 6 รหัส → แถวเดียว ช่องบอกรหัสย่อ + สี", () => {
    const pu = s.buy.varies.find((r) => r.type === "PU")!;
    expect(pu.label).toBe("พียูหนังเทียม M638");
    expect(pu.codes).toHaveLength(6);
    expect(pu.cells[0]).toMatchObject({ short: "19-4004", colour: "สีดำ", status: "buy" });
    expect(pu.cells[0]!.qty).toBeCloseTo(1.456);
    expect(pu.total).toBeCloseTo(6.552);
  });

  it("ซิป: 5 สีสั่งแล้ว · สีขาวยังต้องซื้อ", () => {
    const zip = s.buy.varies.find((r) => r.type === "ซิป")!;
    expect(zip.cells.map((c) => c!.status)).toEqual(["ordered", "ordered", "ordered", "ordered", "ordered", "buy"]);
    expect(zip.remaining).toBeCloseTo(6.6);
    expect(zip.cells[0]!.po_nos).toEqual(["PO-2026-00185"]);
  });

  it("ของใช้ทุกสี → แถวรหัสเดียว · ห่วงกลมสั่งแค่สีดำ ที่เหลือยังต้องซื้อ 70", () => {
    expect(s.buy.single.map((r) => r.code)).toEqual(["A025-4/12MM#N", "B093/20MM#N", "ETC00005"]);
    const ring = s.buy.single.find((r) => r.code === "B093/20MM#N")!;
    expect(ring.total).toBe(90);
    expect(ring.remaining).toBe(70);
    expect(ring.cells[0]!.status).toBe("ordered");
    expect(s.buy.single.find((r) => r.code === "ETC00005")!.missing_qty).toBe(true);
    expect(s.stats.codes).toBe(15);
    expect(s.stats.codes_to_buy).toBe(9);   // PU 6 + ซิปขาว + คอหมา + ห่วงกลม
  });

  it("บล็อกตัด: ขนาดเดียวกันทุกสีเป็นแถวเดียว · อะไหล่ไม่ต้องตัด", () => {
    expect(s.cut.map((g) => g.type)).toEqual(["PU", "ซิป", "ตัวเสริม"]);
    const pu = s.cut[0].rows;
    expect(pu).toHaveLength(3);
    const strip = pu.find((r) => r.size === "26.5 × 4")!;
    expect(strip.varies).toBe(true);
    expect(strip.cells.map((c) => c!.pcs)).toEqual([40, 20, 20, 20, 40, 40]);
    expect(strip.total).toBe(180);
    expect(strip.cells[2]).toMatchObject({ short: "12-2903", colour: "สีม่วง" });
    expect(s.cut[1].rows[0].size).toBe("ยาว 27");
    const paper = s.cut[2].rows[0];
    expect(paper).toMatchObject({ varies: false, material: "กระดาษขาวแข็ง", code: "ETC00005", total: 180 });
    expect(s.stats.cut_pieces).toBe(360 + 90 + 180);
  });
});

describe("กรณีพิเศษ", () => {
  it("หลายใบสั่งผลิตของสีเดียวกัน → คอลัมน์เดียว รวมยอด", () => {
    const s = buildFamilySheet({
      key: "CTL104", parent: { code: "CTL104", name: null, image_url: null },
      mos: [
        { id: "a", mo_no: "MO-1", product_sku: "CTL104-01", qty: 100 },
        { id: "b", mo_no: "MO-2", product_sku: "CTL104-01", qty: 200 },
        { id: "c", mo_no: "MO-3", product_sku: "CTL104-02", qty: 50 },
      ],
      skus: [],
      buy: ["MO-1", "MO-2", "MO-3"].map((m, i) => ({ mo_no: m, code: "X1", name: "ผ้า X", type: "ผ้า", uom: "หลา", qty_per: 0.1, required: [10, 20, 5][i], remaining: i === 1 ? 0 : [10, 20, 5][i], status: i === 1 ? "ordered" : "buy", po_nos: [], seq: 1, image_url: null })),
      cut: [],
    });
    expect(s.columns.map((c) => [c.sku, c.qty, c.mos.length])).toEqual([["CTL104-01", 300, 2], ["CTL104-02", 50, 1]]);
    const row = s.buy.single[0];
    expect(row.cells[0]).toMatchObject({ qty: 30, remaining: 10, status: "partial" });
    expect(row.total).toBe(35);
  });

  it("บางสีใช้ 2 รหัสในชนิดเดียวกัน → แยกเป็น 2 แถวตามลำดับ BOM · รหัสที่ใช้บางสีเป็นแถวรหัสเดียว", () => {
    const L = (m: string, code: string, seq: number): FamilyBuyLine => ({ mo_no: m, code, name: `หนัง ${code}`, type: "หนัง", uom: "ฟุต", qty_per: 1, required: 1, remaining: 1, status: "buy", po_nos: [], seq, image_url: null });
    const s = buildFamilySheet({
      key: "K", parent: null,
      mos: [{ id: "a", mo_no: "A", product_sku: "K-01", qty: 1 }, { id: "b", mo_no: "B", product_sku: "K-02", qty: 1 }, { id: "c", mo_no: "C", product_sku: "K-03", qty: 1 }],
      skus: [],
      buy: [L("A", "R-1", 1), L("A", "T-9", 2), L("B", "R-2", 1), L("C", "R-3", 1)],
      cut: [],
    });
    expect(s.title_code).toBe("K-01");
    expect(s.buy.varies).toHaveLength(1);
    expect(s.buy.varies[0].cells.map((c) => c?.code ?? null)).toEqual(["R-1", "R-2", "R-3"]);
    expect(s.buy.single.map((r) => [r.code, r.cells.map((c) => !!c)])).toEqual([["T-9", [true, false, false]]]);
  });

  it("รุ่นย่อยใช้คนละของ (ชื่อไม่มีส่วนร่วม) → แยกแถวละรหัส ไม่รวมเป็นแถวต่างสี — เคสจริง PIX21 M/R", () => {
    const L = (m: string, code: string, name: string): FamilyBuyLine => ({ mo_no: m, code, name, type: "อะไหล่", uom: "Units", qty_per: 1, required: 20, remaining: 20, status: "buy", po_nos: [], seq: 3, image_url: null });
    const C = (m: string, code: string, name: string): FamilyCutLine => ({ mo_no: m, code, name, type: "ตัวเสริม", block: null, width: 12.9, length: 10.9, pieces: 1, size_label: null, cut_done: false, seq: 1, image_url: null });
    const s = buildFamilySheet({
      key: "PIX21", parent: null,
      mos: [{ id: "a", mo_no: "A", product_sku: "PIX21-01M", qty: 20 }, { id: "b", mo_no: "B", product_sku: "PIX21-01R", qty: 20 }],
      skus: [],
      buy: [L("A", "L089-3#N", "หางซิป L089 สีนิเกิ้ล"), L("B", "ZH-M-NQ.5-N", "หัวซิปไนล่อน #5 นิเกิ้ล"),
        L("A", "ETC00026/0.30*54", "พลาสติกใส 0.30*54 Y"), L("B", "ETC00026-1", "พลาสติกใส 0.5 mm.(สโนลอย)")],
      cut: [C("A", "SP004", "ฟองน้ำ 3 มิล"), C("B", "BONDED-0.4BK", "อีเลน (Bonded Leather) 0.4 mm.")],
    });
    expect(s.buy.varies.map((r) => r.label)).toEqual(["พลาสติกใส"]);
    const singles = s.buy.single.map((r) => [r.code, r.cells.map((c) => !!c)]);
    expect(singles).toHaveLength(2);
    expect(singles).toEqual(expect.arrayContaining([["L089-3#N", [true, false]], ["ZH-M-NQ.5-N", [false, true]]]));
    expect(s.cut[0].rows.map((r) => [r.code, r.varies]).sort()).toEqual([["BONDED-0.4BK", false], ["SP004", false]]);
  });

  it("บล็อกแยกไซส์ คูณด้วยจำนวนของไซส์นั้น", () => {
    const s = buildFamilySheet({
      key: "S", parent: null,
      mos: [{ id: "a", mo_no: "A", product_sku: "S-01", qty: 30, size_breakdown: [{ label: "S", qty: 10 }, { label: "L", qty: 20 }] }],
      skus: [], buy: [],
      cut: [
        { mo_no: "A", code: "P", name: "ผ้า", type: "ผ้า", block: "B1", width: 10, length: 20, pieces: 2, size_label: "S", cut_done: false, seq: 1, image_url: null },
        { mo_no: "A", code: "P", name: "ผ้า", type: "ผ้า", block: "B1", width: 10, length: 24, pieces: 2, size_label: "L", cut_done: true, seq: 2, image_url: null },
      ],
    });
    expect(s.cut[0].rows.map((r) => [r.size, r.total, r.cells[0]!.done])).toEqual([["10 × 20 · ไซส์ S", 20, false], ["10 × 24 · ไซส์ L", 40, true]]);
  });
});

describe("HTML ใบพิมพ์", () => {
  const s = buildFamilySheet(pix25());

  it("มีหัวรุ่น การ์ดสี ตารางซื้อ ตารางตัด กล่องลงชื่อ", () => {
    const html = buildReportHtmlMulti(buildFamilyTemplate(familyOrientation([s])), [familyHtmlData(s, { ...FAMILY_DEFAULT_OPTIONS, printed: "31 ต.ค. 69" })], "ใบรวม");
    expect(familyOrientation([s])).toBe("landscape");
    expect(html).toContain("ใบสั่งผลิตรวมทั้งรุ่น");
    expect(html).toContain("PIX25-06");
    expect(html).toContain("19-4004");
    expect(html).toContain("สั่งแล้ว");
    expect(html).toContain("BOM ยังไม่ใส่จำนวน");
    expect(html).toContain("2) บล็อกตัด");
    expect(html).toContain("ผู้ตัด");
    expect(html).toContain("@page { size: A4 landscape");
  });

  it("เฉพาะที่ยังต้องซื้อ: ซ่อนแถวที่ครบ · ช่องที่สั่งแล้วเป็น –", () => {
    const zipDone = buildFamilySheet({ ...pix25(), buy: pix25().buy.map((l) => (l.type === "ซิป" ? { ...l, status: "ordered" as const, remaining: 0 } : l)) });
    const html = familyHtmlData(zipDone, { ...FAMILY_DEFAULT_OPTIONS, only_to_buy: true, cut: false }).body_html as string;
    expect(html).not.toContain("ซิปฟันกระดูก");
    expect(html).toContain("พียูหนังเทียม M638");
    expect(html).not.toContain("2) บล็อกตัด");
    expect(html).not.toContain("ผู้ตัด");
  });

  it("ข้อความจาก DB ถูก escape", () => {
    const bad = buildFamilySheet({ ...pix25(), parent: { code: "<b>X</b>", name: null, image_url: null } });
    const html = familyHtmlData(bad, FAMILY_DEFAULT_OPTIONS).head_html as string;
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});
