import { describe, it, expect } from "vitest";
import {
  aliasKey, groupKey, sizesMm, colorsOf, codeTokens, distributeQty, checkBillMath, matchBillLines, undecidedCount, normalizeBillLine, applyGroupToLine, cnNameForSku,
  shortfallOf, reducePlan, missingGroups, outsidePoLines, otherShopHint,
  type PoGroup, type SellerBillLine,
} from "@/lib/seller-bill-match";

// ข้อมูลจำลองจากของจริงร้าน B242 (4 พ.ย. 2026)
const G = (o: Partial<PoGroup> & { po_no: string; code: string; item_name: string; unit_price: number | null; remaining: number; lines?: PoGroup["lines"] }): PoGroup => ({
  key: groupKey(o.po_no, o.code, o.item_name), po_id: o.po_no, order_date: "2026-11-03", item_sku_id: o.code, name_cn: null, uom: "Units", qty_total: o.remaining, in_voucher: false, image_url: null,
  lines: o.lines ?? [{ id: `${o.po_no}-1`, qty: o.remaining, remaining: o.remaining, sort_order: 0, note: null, voucher_line_id: null, from_gr: false }], ...o,
});
const groups: PoGroup[] = [
  G({ po_no: "PO-2026-00284", code: "A069-2/9MM#N", item_name: "คอหมามาเวล 9 mm. สีเงิน", unit_price: 4.5, remaining: 300 }),
  G({ po_no: "PO-2026-00245", code: "A069-2/9MM#N", item_name: "คอหมามาเวล 9 mm. สีเงิน", unit_price: 0.9, remaining: 300, order_date: "2026-10-14" }),
  G({ po_no: "PO-2026-00282", code: "A006-6/20MM#N", item_name: "คอหมาก้นสี่เหลี่ยม 2 cm. สีนิเกิ้ล", unit_price: 2.5, remaining: 280 }),
  G({ po_no: "PO-2026-00254", code: "A049-6/20MM#GUN", item_name: "คอหมาก้นสี่เหลี่ยม 2 cm. สีรมดำ", unit_price: 1.6, remaining: 1000 }),
  G({ po_no: "PO-2026-00265", code: "B0124/9MM#N", item_name: "ตัวดี 0.9 cm. สีเงิน", unit_price: 0.38, remaining: 110 }),
];
const L = (o: Partial<SellerBillLine>): SellerBillLine => normalizeBillLine({ ...o } as Record<string, unknown>);

describe("บิลร้านจีน — สัญญาณจากข้อความ", () => {
  it("ขนาด: mm / cm / ซม. → มม.", () => {
    expect(sizesMm("狗扣 9mm")).toEqual([9]);
    expect(sizesMm("คอหมาก้นสี่เหลี่ยม 2 cm. สีนิเกิ้ล")).toEqual([20]);
    expect(sizesMm("ตัวดี 0.9 ซม.")).toEqual([9]);
    expect(sizesMm("ไม่มีขนาด")).toEqual([]);
  });
  it("สี: รมดำ ไม่นับเป็นดำ · จีน/ไทยตรงกัน", () => {
    expect(colorsOf("สีรมดำ")).toEqual(["gun"]);
    expect(colorsOf("枪黑")).toEqual(["gun"]);
    expect(colorsOf("镍色")).toEqual(["nickel"]);
    expect(colorsOf("สีเงิน")).toEqual(["silver"]);
  });
  it("รหัส/เบอร์: G322, #402", () => {
    expect(codeTokens("ซิปฟันเหล็ก#3 NO.3#G322 สีดำ")).toContain("G322");
    expect(codeTokens("402号")).toContain("402");
    expect(codeTokens("狗扣 9MM 2cm")).toEqual([]);   // ขนาดไม่ใช่รหัส
  });
  it("กุญแจจำคู่ ไม่สนช่องว่าง/ตัวเต็มความกว้าง", () => {
    expect(aliasKey("狗扣 9ｍｍ", "银色")).toBe(aliasKey("狗扣9mm", " 银色 "));
  });
});

describe("บิลร้านจีน — จับคู่กับบรรทัด PO ของร้านนี้", () => {
  it("AI เลือก + ราคาตรง + จำนวนตรง = มั่นใจ · ของเดียวกัน 2 PO เลือกใบที่ราคาตรง", () => {
    const [m] = matchBillLines([L({ name_cn: "狗扣", spec_cn: "9mm 银色", name_th: "คอหมา 9 มม.", spec_th: "สีเงิน", qty: 300, unit_price: 4.5, amount: 1350, ai_pick: groups[1].key, ai_conf: 0.8 })], groups, []);
    expect(m.match_key).toBe(groups[0].key);   // AI ชี้ PO-00245 (¥0.9) แต่ราคาบิล ¥4.5 ตรง PO-00284
    expect(m.level).toBe("ok");
    expect(m.reasons).toContain("ราคาตรง");
    expect(m.warns.some((w) => w.startsWith("มีใน 2 PO"))).toBe(true);
  });
  it("สีขัดกัน (นิเกิ้ล vs รมดำ) → ไม่เลือกตัวสีผิด", () => {
    const [m] = matchBillLines([L({ name_cn: "方底狗扣", spec_cn: "2cm 枪黑", name_th: "คอหมาก้นสี่เหลี่ยม 2 ซม.", spec_th: "สีรมดำ", qty: 1000, unit_price: 1.6 })], groups, []);
    expect(m.match_key).toBe(groups[3].key);
  });
  it("ราคาไม่ตรง + ส่งไม่ครบ → ให้เช็ก พร้อมคำเตือน", () => {
    const [m] = matchBillLines([L({ name_cn: "D扣", spec_cn: "0.9cm 银色", name_th: "ตัวดี 0.9 ซม.", spec_th: "สีเงิน", qty: 100, unit_price: 0.4, ai_pick: groups[4].key, ai_conf: 0.7 })], groups, []);
    expect(m.match_key).toBe(groups[4].key);
    expect(m.level).toBe("mid");
    expect(m.score).toBeLessThan(0.8);   // ป้าย "ให้เช็ก" ต้องไม่โชว์ % สูงแบบมั่นใจ
    expect(m.warns).toContain("บิล ¥0.4 · PO ¥0.38");
    expect(m.warns).toContain("ส่งมา 100 จากที่ค้าง 110");
  });
  it("ไม่มีของนี้ใน PO ร้านนี้ → ไม่เจอ (ไม่เดามั่ว)", () => {
    const [m] = matchBillLines([L({ name_cn: "日字扣", spec_cn: "2.5cm 黑色", name_th: "ห่วงเลขแปด 2.5 ซม.", spec_th: "สีดำ", qty: 200, unit_price: 0.8 })], groups, []);
    expect(m.match_key).toBeNull();
    expect(m.level).toBe("no");
  });
  it("เคยจับคู่แล้ว (จำคู่) → มั่นใจแม้ AI ไม่ได้เลือก", () => {
    const [m] = matchBillLines([L({ name_cn: "狗扣", spec_cn: "9mm 银色", qty: 300, unit_price: 4.5 })], groups, [{ alias_key: aliasKey("狗扣", "9mm 银色"), item_sku_id: "A069-2/9MM#N", item_name: null }]);
    expect(m.match_key).toBe(groups[0].key);
    expect(m.alias_hit).toBe(true);
    expect(m.level).toBe("ok");
  });
  it("ค่าส่งในจีน = ไม่ใช่สินค้า ไม่จับ PO", () => {
    const [m] = matchBillLines([L({ name_cn: "运费", qty: 1, unit_price: 25, is_fee: true })], groups, []);
    expect(m.level).toBe("fee");
    expect(m.match_key).toBeNull();
  });
  it("แถวที่คนตัดสินแล้ว ไม่ถูกจับใหม่ทับ · เลือกเอง = ป้ายเลือกเอง", () => {
    const chosen = { ...applyGroupToLine(L({ name_cn: "x", qty: 5, unit_price: 1 }), groups[2], groups, [], true), decision: "confirmed" as const };
    expect(chosen.manual).toBe(true);
    expect(chosen.level).toBe("mid");
    const [m] = matchBillLines([chosen], groups, []);
    expect(m.match_key).toBe(groups[2].key);
  });
});

describe("บิลร้านจีน — แบ่งจำนวน / ตรวจตัวเลข / ครบก่อนใส่ลงใบ", () => {
  const lines = [20, 20, 30, 50].map((q, i) => ({ id: `l${i}`, qty: q, remaining: q, sort_order: i, note: null, voucher_line_id: null, from_gr: false }));
  it("แบ่งลงใบสั่งผลิตเก่าก่อน", () => {
    expect(distributeQty(45, lines)).toEqual([{ id: "l0", qty: 20 }, { id: "l1", qty: 20 }, { id: "l2", qty: 5 }]);
  });
  it("เกินที่ค้าง → ส่วนเกินลงบรรทัดสุดท้ายที่ได้ · ไม่มีค้างเลย → บรรทัดแรก", () => {
    expect(distributeQty(130, lines).at(-1)).toEqual({ id: "l3", qty: 60 });
    expect(distributeQty(10, lines.map((l) => ({ ...l, remaining: 0 })))).toEqual([{ id: "l0", qty: 10 }]);
  });
  it("จำนวน × ราคา = ยอด · รวม = ยอดบิล", () => {
    const ls = [L({ qty: 300, unit_price: 4.5, amount: 1350 }), L({ qty: 100, unit_price: 0.4, amount: 400 })];
    const r = checkBillMath(ls, 1390);
    expect(r.rowsBad).toEqual([1]);
    expect(r.sum).toBe(1750);
    expect(r.totalOk).toBe(false);
    expect(checkBillMath([ls[0]], 1350).totalOk).toBe(true);
  });
  it("ชื่อจีนบนสินค้า (เติมจากบิลก่อน ๆ) ช่วยจับคู่ได้แม้ AI ไม่ได้เลือก และร้านอื่นตั้งชื่อคล้ายกัน", () => {
    const withCn = groups.map((g, i) => (i === 4 ? { ...g, name_cn: "D扣 0.9cm 银色" } : g));
    const [m] = matchBillLines([L({ name_cn: "D扣", spec_cn: "0.9cm 银色", qty: 110, unit_price: 0.38 })], withCn, []);
    expect(m.match_key).toBe(withCn[4].key);
    expect(m.reasons).toContain("ชื่อจีนตรง");
    expect(m.level).toBe("ok");
  });
  it("ชื่อจีนที่จะเติม = ชื่อ + สเปกตามบิล · ไม่มีตัวจีน = ไม่เติม", () => {
    expect(cnNameForSku({ name_cn: "狗扣", spec_cn: " 9mm  银色 " })).toBe("狗扣 9mm 银色");
    expect(cnNameForSku({ name_cn: "BOX", spec_cn: null })).toBeNull();
    expect(cnNameForSku({ name_cn: null, spec_cn: null })).toBeNull();
  });
  it("ส่งไม่ครบ: จำนวนที่ขาด + แผนลด PO ตามบิล (ใบสั่งผลิตเก่าก่อน · ได้ 0 = ปิดยอด · ไม่ต่ำกว่าที่รับแล้ว)", () => {
    const g = { ...groups[0], remaining: 70, qty_total: 70, lines: [
      { id: "a", qty: 20, remaining: 20, qty_received: 0, sort_order: 0, note: null, voucher_line_id: null, from_gr: false },
      { id: "b", qty: 20, remaining: 20, qty_received: 5, sort_order: 1, note: null, voucher_line_id: null, from_gr: false },
      { id: "c", qty: 30, remaining: 30, qty_received: 0, sort_order: 2, note: null, voucher_line_id: null, from_gr: false },
    ] };
    const line = L({ qty: 25, match_key: g.key });
    expect(shortfallOf(line, g)).toBe(45);
    expect(shortfallOf(L({ qty: 70, match_key: g.key }), g)).toBe(0);
    expect(shortfallOf(L({ qty: 25, match_key: g.key, is_fee: true }), g)).toBe(0);
    expect(reducePlan(25, g)).toEqual({ line_qty: [{ id: "b", from: 20, qty: 5 }], close: ["c"] });   // a=20 (เต็ม ไม่แตะ) · b ได้ 5 · c ได้ 0 → ปิดยอด
    // บรรทัดที่ออกใบสำคัญใบอื่นไปแล้วบางส่วน: จำนวนใหม่ = ที่ออกไปแล้ว + ที่ได้จากบิลนี้
    const g2 = { ...g, lines: [{ id: "x", qty: 20, remaining: 12, qty_received: 0, sort_order: 0, note: null, voucher_line_id: null, from_gr: false }], remaining: 12 };
    expect(reducePlan(10, g2)).toEqual({ line_qty: [{ id: "x", from: 20, qty: 18 }], close: [] });
  });
  it("ไม่อยู่ในบิล: รอบสั่งเดียวกับบิล (PO เดียวกัน + PO ที่สั่งวันเดียวกัน) หรือทั้งร้าน · ไม่นับที่รับครบ/แถวที่ข้าม", () => {
    const po = (no: string, key: string, recv = 0, date = "2026-11-03"): PoGroup => ({ ...groups[0], key, po_id: no, po_no: no, order_date: date, lines: [{ id: key, qty: 10, remaining: 10, qty_received: recv, sort_order: 0, note: null, voucher_line_id: null, from_gr: false }] });
    const gs = [po("PO-1", "k1"), po("PO-1", "k2"), po("PO-1", "k3", 10), po("PO-2", "k4"), po("PO-3", "k5", 0, "2026-10-01")];
    const ls = [L({ match_key: "k1", decision: "confirmed" })];
    expect(missingGroups(ls, gs).map((g) => g.key)).toEqual(["k2", "k4"]);      // k3 รับครบแล้ว · k4 คนละ PO แต่สั่งวันเดียวกัน · k5 คนละรอบ
    expect(missingGroups(ls, gs, "shop").map((g) => g.key)).toEqual(["k2", "k4", "k5"]);
    expect(missingGroups([L({ match_key: "k1", decision: "skip" })], gs)).toEqual([]);   // ข้ามแถว = ไม่นับว่า PO นี้อยู่ในบิล
  });
  it("เลือกสินค้านอกใบสั่งซื้อ = นับว่าตัดสินแล้ว + อยู่ในรายการที่ถามเปิด PO ย้อนหลัง", () => {
    const pick = L({ name_cn: "日字扣", qty: 200, unit_price: 0.8, decision: "confirmed", manual: true, sku_pick: { id: "s9", code: "H8-25#BK", name: "ห่วงเลขแปด 2.5 cm. สีดำ", uom: "Units" } });
    expect(pick.sku_pick?.code).toBe("H8-25#BK");
    expect(undecidedCount([pick])).toBe(0);
    expect(outsidePoLines([pick, L({ match_key: "k", decision: "confirmed" })])).toHaveLength(1);
    expect(normalizeBillLine({ sku_pick: { code: "x" } }).sku_pick).toBeNull();   // ไม่มี id = ไม่นับ
  });
  it("ใบ้ PO ร้านอื่นให้แถวที่ไม่เจอ (ไม่ผูกให้เอง) · แถวที่เลือกแล้ว/ค่าใช้จ่าย ไม่ใบ้", () => {
    const other = [{ ...groups[2], key: "po9|s:x", po_id: "po9", po_no: "PO-2026-00249", partner_name: "ร้านอี้หลงตงก่วน" }];
    const row = L({ name_cn: "方底狗扣", spec_cn: "2cm 镍色", name_th: "คอหมาก้นสี่เหลี่ยม 2 ซม.", spec_th: "สีนิเกิ้ล", qty: 280, unit_price: 2.5 });
    expect(otherShopHint(row, other)?.po_no).toBe("PO-2026-00249");
    expect(otherShopHint({ ...row, decision: "skip" }, other)).toBeNull();
    expect(otherShopHint({ ...row, is_fee: true }, other)).toBeNull();
  });
  it("ต้องตัดสินครบทุกแถวก่อนใส่ลงใบ", () => {
    const ls = [L({ match_key: "k", decision: "confirmed" }), L({ is_fee: true, decision: "expense" }), L({ decision: "skip" }), L({ match_key: "k" })];
    expect(undecidedCount(ls)).toBe(1);
  });
});
