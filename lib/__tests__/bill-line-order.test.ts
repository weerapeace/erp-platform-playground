import { describe, it, expect } from "vitest";
import { orderByBillPosition, billLineNo } from "@/lib/bill-line-order";
import { sanitizeAiBillLines } from "@/lib/seller-bill";
import {
  groupKey, normalizeBillLine, autoSplitRounds, matchAndSplit, splitLineAcrossRounds, ensureRowIds,
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

describe("แบ่งรอบอัตโนมัติ (บิลมากกว่าที่ค้างรอบเก่า)", () => {
  const bill = () => L({ name_cn: "6成狗扣 1cm", qty: 330, unit_price: 0.6, amount: 198, match_key: r246.key, rid: "b1", no: 1 });

  it("330 → PO-00246 ได้ 240 · PO-00302 ได้ 90 · ยอด ¥ รวมเท่าเดิม · เลข # เดิม", () => {
    const out = autoSplitRounds([bill()], gs, []);
    expect(out.map((l) => [l.match_key, l.qty, l.amount])).toEqual([[r246.key, 240, 144], [r302.key, 90, 54]]);
    expect(out.map((l) => l.no)).toEqual([1, 1]);
    expect(out.map((l) => l.rid)).toEqual(["b1", "b1.2"]);
    expect(out[1].warns.some((w) => w.includes("แบ่งอัตโนมัติ"))).toBe(true);
  });
  it("ไม่เกินที่ค้าง = ไม่แบ่ง", () => {
    const l = { ...bill(), qty: 200, amount: 120 };
    expect(autoSplitRounds([l], gs, [])).toEqual([l]);
  });
  it("หักจำนวนที่แถวก่อนหน้าจองไปแล้ว — แถวแรก 200 · แถวสอง 100 → แบ่ง 40 + 60", () => {
    const a = { ...bill(), qty: 200, amount: 120, rid: "b1" };
    const b = { ...bill(), qty: 100, amount: 60, rid: "b2", no: 2 };
    const out = autoSplitRounds([a, b], gs, []);
    expect(out.map((l) => [l.rid, l.qty])).toEqual([["b1", 200], ["b2", 40], ["b2.2", 60]]);
  });
  it("รอบเก่าเต็มแล้ว = ย้ายทั้งแถวไปรอบที่ยังค้าง (ไม่แบ่ง)", () => {
    const a = { ...bill(), qty: 240, amount: 144, rid: "b1" };
    const b = { ...bill(), qty: 50, amount: 30, rid: "b2" };
    const out = autoSplitRounds([a, b], gs, []);
    expect(out.map((l) => [l.rid, l.match_key, l.qty])).toEqual([["b1", r246.key, 240], ["b2", r302.key, 50]]);
  });
  it("แถวที่คนเลือกรอบเอง (manual) ไม่โดนแบ่ง · เว้นแต่สั่งเฉพาะแถว (เพิ่งเลือกในป๊อป)", () => {
    const m = { ...bill(), manual: true };
    expect(autoSplitRounds([m], gs, [])).toHaveLength(1);
    expect(autoSplitRounds([m], gs, [], new Set(["b1"]), true)).toHaveLength(2);
  });
  it("ไม่แตะแถวที่ใส่ลงใบแล้ว / ข้าม / ค่าใช้จ่าย", () => {
    expect(autoSplitRounds([{ ...bill(), voucher_line_ids: ["v1"] }], gs, [])).toHaveLength(1);
    expect(autoSplitRounds([{ ...bill(), decision: "skip" }], gs, [])).toHaveLength(1);
    expect(autoSplitRounds([{ ...bill(), is_fee: true }], gs, [])).toHaveLength(1);
  });
  it("เกินที่ค้างรวมทุกรอบ = ส่วนเกินอยู่รอบสุดท้าย (เตือนเกินที่ค้างตามเดิม)", () => {
    const out = autoSplitRounds([{ ...bill(), qty: 400, amount: 240 }], gs, []);
    expect(out.map((l) => l.qty)).toEqual([240, 160]);
  });
  it("ปุ่มแบ่งเอง (splitLineAcrossRounds) ใช้สูตรเดียวกัน", () => {
    const out = splitLineAcrossRounds(bill(), [r246, r302], gs, []);
    expect(out.map((l) => l.qty)).toEqual([240, 90]);
  });
  it("จับคู่ + แบ่ง (matchAndSplit) — ค้นเจอรอบไหนก่อนก็แบ่งเก่าก่อน", () => {
    const out = matchAndSplit([L({ name_th: "คอหมาหัวใจ", qty: 330, unit_price: 0.6, amount: 198, ai_pick: r302.key, rid: "b1" })], gs, []);
    expect(out.reduce((a, l) => a + (l.qty ?? 0), 0)).toBe(330);
    if (out.length === 2) expect(out.map((l) => l.qty)).toEqual([240, 90]);
  });
});
