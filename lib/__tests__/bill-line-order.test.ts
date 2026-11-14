import { describe, it, expect } from "vitest";
import { orderByBillPosition, billLineNo } from "@/lib/bill-line-order";
import { sanitizeAiBillLines } from "@/lib/seller-bill";
import {
  groupKey, normalizeBillLine, autoSplitRounds, matchAndSplit, allocRowAcrossRounds, ensureRowIds, allocOf, expandAllocRows, collapseAllocRows, editAlloc, rebalanceAlloc, addAllocRound, mergeSplitRows,
  type PoGroup, type SellerBillLine,
} from "@/lib/seller-bill-match";

// ★ 2026-11-14 เจ้าของ: "AI อ่านต้องคงบรรทัดไว้เหมือนเดิม ไม่สลับเอง + ย้ายเองได้" · "PO มี 2 ใบ แต่ได้แค่อันเดียว"
const G = (o: Partial<PoGroup> & { po_no: string; code: string; item_name: string; unit_price: number | null; remaining: number }): PoGroup => ({
  key: groupKey(o.po_no, o.code, o.item_name), po_id: o.po_no, order_date: "2026-11-03", item_sku_id: o.code, name_cn: null, uom: "Units", qty_total: o.remaining, in_voucher: false, image_url: null,
  lines: [{ id: `${o.po_no}-1`, qty: o.remaining, remaining: o.remaining, sort_order: 0, note: null, voucher_line_id: null, from_gr: false }], ...o,
});
const L = (o: Partial<SellerBillLine>): SellerBillLine => normalizeBillLine({ ...o } as Record<string, unknown>);

// ข้อมูลจากรูปที่เจ้าของส่ง: บิล 330 · PO-00246 ค้าง 240 (14/10) · PO-00302 ค้าง 130 (11/11)
const r246 = G({ po_no: "PO-2026-00246", code: "DC-HRE-01", item_name: "คอหมาหัวใจ", unit_price: 0.6, remaining: 240, order_date: "2026-10-14" });
const r302 = G({ po_no: "PO-2026-00302", code: "DC-HRE-01", item_name: "คอหมาหัวใจ", unit_price: 0.6, remaining: 130, order_date: "2026-11-11" });
const gs = [r302, r246];

describe("ลำดับแถวตามบิลจริง", () => {
  it("เรียงตามหน้า แล้วเลขบรรทัด — AI ส่งสลับมาก็กลับมาถูก", () => {
    const rows = [{ n: "C", page: 1, line_no: 3 }, { n: "E", page: 2, line_no: 1 }, { n: "A", page: 1, line_no: 1 }, { n: "B", page: 1, line_no: 2 }];
    expect(orderByBillPosition(rows, (r) => r).map((r) => r.n)).toEqual(["A", "B", "C", "E"]);
  });
  it("ไม่มีเลขบรรทัดสักแถว = ไม่เรียง (เชื่อลำดับที่ AI ส่ง)", () => {
    const rows = [{ n: "B", line_no: 2 }, { n: "A" }];
    expect(orderByBillPosition(rows, (r) => r).map((r) => r.n)).toEqual(["B", "A"]);
  });
  it("เลขซ้ำ = คงลำดับเดิม (เรียงแบบคงที่)", () => {
    const rows = [{ n: "x", line_no: 1 }, { n: "y", line_no: 1 }, { n: "z", line_no: 0.5 }];
    expect(orderByBillPosition(rows, (r) => r).map((r) => r.n)).toEqual(["z", "x", "y"]);
  });
  it("แถวจาก AI ได้เลข # และรหัสแถวตามลำดับบนกระดาษ · แถวรวมไม่นับ", () => {
    const out = sanitizeAiBillLines([
      { name_cn: "B", qty: 2, page: 1, line_no: 2 },
      { name_cn: "合计", amount: 9, page: 1, line_no: 9 },
      { name_cn: "A", qty: 1, page: 1, line_no: 1 },
    ]);
    expect(out.map((l) => [l.name_cn, l.no, l.rid])).toEqual([["A", 1, "b1"], ["B", 2, "b2"]]);
  });
  it("เลข # ของแถวเก่าที่ไม่มีเลข = ลำดับในรายการ", () => {
    expect(billLineNo(null, 4)).toBe(5);
    expect(billLineNo(7, 0)).toBe(7);
  });
  it("แถวเก่า (ไม่มี rid) ได้รหัสตามลำดับที่เก็บ — ฝั่งเว็บกับฝั่งเซิร์ฟเวอร์ตรงกัน", () => {
    const stored = [{ name_cn: "a" }, { name_cn: "b" }];
    expect(stored.map(normalizeBillLine).map((l) => l.rid)).toEqual(["L0", "L1"]);
    expect(normalizeBillLine({ name_cn: "a", rid: "b3" }, 0).rid).toBe("b3");
  });
  it("รหัสแถวซ้ำ/ว่าง = ตั้งใหม่ ไม่ซ้ำกัน", () => {
    const ids = ensureRowIds([L({ rid: "b1" }), L({ rid: "b1" }), L({})]).map((l) => l.rid);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("b1");
  });
});

describe("แถวเดียวลงหลาย PO (ของที่สั่ง 2 รอบแต่ส่งพร้อมกัน)", () => {
  const bill = () => L({ name_cn: "6成狗扣 1cm", qty: 330, unit_price: 0.6, amount: 198, match_key: r246.key, rid: "b1", no: 1 });
  const qtys = (l: SellerBillLine) => allocOf(l).map((a) => [a.key, a.qty]);

  it("330 → แถวเดียว: PO-00246 = 240 · PO-00302 = 90 (เก่าก่อน) · ไม่แตกเป็น 2 แถว", () => {
    const out = autoSplitRounds([bill()], gs, []);
    expect(out).toHaveLength(1);
    expect(qtys(out[0])).toEqual([[r246.key, 240], [r302.key, 90]]);
    expect(out[0].qty).toBe(330);
    expect(out[0].match_key).toBe(r246.key);
    expect(out[0].warns.some((w) => w.includes("แบ่งอัตโนมัติ"))).toBe(true);
  });
  it("ไม่เกินที่ค้าง = ไม่แบ่ง", () => {
    const l = { ...bill(), qty: 200, amount: 120 };
    expect(autoSplitRounds([l], gs, [])).toEqual([l]);
  });
  it("หักจำนวนที่แถวก่อนหน้าจองไปแล้ว — แถวแรก 200 · แถวสอง 100 → 40 + 60 ในแถวสอง", () => {
    const a = { ...bill(), qty: 200, amount: 120, rid: "b1" };
    const b = { ...bill(), qty: 100, amount: 60, rid: "b2", no: 2 };
    const out = autoSplitRounds([a, b], gs, []);
    expect(out).toHaveLength(2);
    expect(qtys(out[1])).toEqual([[r246.key, 40], [r302.key, 60]]);
  });
  it("รอบเก่าเต็มแล้ว = ย้ายทั้งแถวไปรอบที่ยังค้าง", () => {
    const a = { ...bill(), qty: 240, amount: 144, rid: "b1" };
    const b = { ...bill(), qty: 50, amount: 30, rid: "b2" };
    const out = autoSplitRounds([a, b], gs, []);
    expect(out.map((l) => [l.rid, l.match_key, l.alloc ?? null])).toEqual([["b1", r246.key, null], ["b2", r302.key, null]]);
  });
  it("แถวที่คนแก้เอง (manual) ไม่โดนแบ่งทับ · เว้นแต่สั่งเฉพาะแถว (เพิ่งเลือกในป๊อป)", () => {
    const m = { ...bill(), manual: true };
    expect(autoSplitRounds([m], gs, [])[0].alloc ?? null).toBeNull();
    expect(qtys(autoSplitRounds([m], gs, [], new Set(["b1"]), true)[0])).toHaveLength(2);
  });
  it("ไม่แตะแถวที่ใส่ลงใบแล้ว / ข้าม / ค่าใช้จ่าย", () => {
    for (const l of [{ ...bill(), voucher_line_ids: ["v1"] }, { ...bill(), decision: "skip" as const }, { ...bill(), is_fee: true }]) expect(autoSplitRounds([l], gs, [])[0].alloc ?? null).toBeNull();
  });
  it("เกินที่ค้างรวมทุกรอบ = ส่วนเกินอยู่ PO สุดท้าย", () => {
    expect(qtys(autoSplitRounds([{ ...bill(), qty: 400, amount: 240 }], gs, [])[0]).map((x) => x[1])).toEqual([240, 160]);
  });
  it("allocRowAcrossRounds (ป๊อปเลือกเอง) สูตรเดียวกัน", () => {
    expect(qtys(allocRowAcrossRounds(bill(), [r246, r302], gs, [])).map((x) => x[1])).toEqual([240, 90]);
  });
  it("จับคู่ + แบ่ง (matchAndSplit) — รวมทุก PO = จำนวนในบิล", () => {
    const out = matchAndSplit([L({ name_th: "คอหมาหัวใจ", qty: 330, unit_price: 0.6, amount: 198, ai_pick: r302.key, rid: "b1" })], gs, []);
    expect(out).toHaveLength(1);
    expect(allocOf(out[0]).reduce((a, x) => a + x.qty, 0)).toBe(330);
  });

  it("ใส่ลงใบ: แตกเป็นแถวย่อย 1 แถว/PO (ยอด ¥ 144 + 54) แล้วรวมกลับ — รหัสรายการในใบรวมกัน", () => {
    const row = autoSplitRounds([bill()], gs, [])[0];
    const { parts, parent } = expandAllocRows([row, L({ name_cn: "x", qty: 1, match_key: r302.key, rid: "b2" })]);
    expect(parts.map((p) => [p.match_key, p.qty, p.amount])).toEqual([[r246.key, 240, 144], [r302.key, 90, 54], [r302.key, 1, null]]);
    expect(parent).toEqual([0, 0, 1]);
    const outParts = parts.map((p, k) => ({ ...p, voucher_line_ids: [`v${k}`] }));
    const back = collapseAllocRows([row, L({ name_cn: "x", qty: 1, match_key: r302.key, rid: "b2" })], outParts, parent);
    expect(back).toHaveLength(2);
    expect(back[0].voucher_line_ids).toEqual(["v0", "v1"]);
    expect(qtys(back[0])).toHaveLength(2);
  });
  it("PO ที่ใส่ 0 = ไม่ลง (ไม่ฟ้องว่าไม่มีจำนวน)", () => {
    const row = { ...bill(), alloc: [{ key: r246.key, qty: 330 }, { key: r302.key, qty: 0 }] };
    const { parts } = expandAllocRows([row]);
    expect(parts.map((p) => [p.match_key, p.qty, p.alloc ?? null])).toEqual([[r246.key, 330, null]]);
  });
  it("แก้จำนวนที่ป้าย PO: PO สุดท้ายปรับให้รวมเท่าบิล · แก้ PO สุดท้าย = PO ก่อนหน้าปรับ · เอาออกจนเหลือ 1 = แถวธรรมดา", () => {
    const row = autoSplitRounds([bill()], gs, [])[0];
    expect(qtys(editAlloc(row, r246.key, "set", 200))).toEqual([[r246.key, 200], [r302.key, 130]]);
    expect(qtys(editAlloc(row, r302.key, "set", 100))).toEqual([[r246.key, 230], [r302.key, 100]]);
    const one = editAlloc(row, r246.key, "remove");
    expect([one.match_key, one.alloc ?? null, one.manual]).toEqual([r302.key, null, true]);
  });
  it("แก้จำนวนในบิล → PO สุดท้ายปรับตาม", () => {
    const row = autoSplitRounds([bill()], gs, [])[0];
    expect(qtys(rebalanceAlloc({ ...row, qty: 300 }))).toEqual([[r246.key, 240], [r302.key, 60]]);
  });
  it("ปุ่ม + PO: เพิ่มรอบแล้วแบ่งเก่าก่อน", () => {
    const single = { ...bill(), qty: 300, amount: 180, match_key: r302.key };
    expect(qtys(addAllocRound(single, r246.key, gs))).toEqual([[r246.key, 240], [r302.key, 60]]);
  });
  it("บิลที่เคยแตกแถว (#12 · b12 / b12.2) → รวมกลับเป็นแถวเดียว · ใส่ลงใบแล้ว = ไม่รวม", () => {
    const a = L({ name_cn: "心形扣", qty: 240, unit_price: 0.6, amount: 144, match_key: r246.key, rid: "b12", no: 12, warns: ["แบ่งอัตโนมัติจากแถวเดิม 250 → รอบ PO-2026-00246"] });
    const b = L({ name_cn: "心形扣", qty: 10, unit_price: 0.6, amount: 6, match_key: r302.key, rid: "b12.2", no: 12 });
    const m = mergeSplitRows([a, b]);
    expect(m).toHaveLength(1);
    expect([m[0].rid, m[0].qty, m[0].amount]).toEqual(["b12", 250, 150]);
    expect(qtys(m[0])).toEqual([[r246.key, 240], [r302.key, 10]]);
    expect(mergeSplitRows([a, { ...b, voucher_line_ids: ["v1"] }])).toHaveLength(2);
  });
  it("อ่านค่า alloc จากฐานข้อมูล: น้อยกว่า 2 PO = ไม่มี", () => {
    expect(normalizeBillLine({ alloc: [{ key: "a", qty: 1 }] }).alloc).toBeNull();
    expect(normalizeBillLine({ alloc: [{ key: "a", qty: 1 }, { key: "b", qty: "2" }] }).alloc).toEqual([{ key: "a", qty: 1 }, { key: "b", qty: 2 }]);
  });
});

describe("ส่วนลดในแถวบิล (2026-11-14)", () => {
  it("ยอดเงิน / % · ตรวจยอดบิลใช้ยอดหลังหักส่วนลด", async () => {
    const { billLineDiscount, checkBillMath } = await import("@/lib/seller-bill-match");
    const a = L({ qty: 20, unit_price: 3.46, amount: 69.2, discount: 5 });
    const b = L({ qty: 100, unit_price: 1.3, amount: 130, discount_pct: 10 });
    expect([billLineDiscount(a), billLineDiscount(b)]).toEqual([5, 13]);
    expect(checkBillMath([a, b], 181.2)).toMatchObject({ sum: 181.2, totalOk: true });
  });
  it("แถวหลาย PO: ส่วนลดยอดเงินแบ่งตามจำนวน (รวมเท่าเดิม) · แบบ % ใช้ % เดิมทุก PO", () => {
    const row = { ...autoSplitRounds([L({ name_cn: "x", qty: 330, unit_price: 0.6, amount: 198, match_key: r246.key, rid: "b1" })], gs, [])[0], discount: 33 };
    const parts = expandAllocRows([row]).parts;
    expect(parts.map((p) => p.discount)).toEqual([24, 9]);
    const pct = expandAllocRows([{ ...row, discount: null, discount_pct: 10 }]).parts;
    expect(pct.map((p) => [p.discount ?? null, p.discount_pct])).toEqual([[null, 10], [null, 10]]);
  });
});
