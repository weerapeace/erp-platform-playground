import { describe, it, expect } from "vitest";
import type { DeliveryBillLine } from "@/lib/delivery-bill";
import { rowOwner, rowsOf, otherOwners, setRowOwner, choiceKey, parseChoiceKey, billTotalsFor, appliedFor, billStatusAfter, billDirty, retargetRows, restoreRowTargets, matchCopyRow, boxKey, dupBoxStatus } from "@/lib/delivery-bill-share";

const L = (p: Partial<DeliveryBillLine> = {}): DeliveryBillLine => ({ stock: null, po_no: null, description: "BOX", pack: 1, package: null, qty: 1, weight_kg: 1, m3: 0.01, method: null, voucher_line_ids: [], ...p });
const H = "home", A = "va", B = "vb";

describe("เจ้าของแถวใบส่งของ (ใช้ร่วมหลายใบ)", () => {
  it("ว่าง = ใบเจ้าของบิล · มีค่า = ใบนั้น · พักไว้/ไม่ใช่ของเรา = ไม่มีเจ้าของ", () => {
    expect(rowOwner(L(), H)).toBe(H);
    expect(rowOwner(L({ for_voucher_id: A }), H)).toBe(A);
    expect(rowOwner(L({ for_voucher_id: A, hold: "parked" }), H)).toBeNull();
    expect(rowOwner(L({ hold: "not_ours" }), H)).toBeNull();
  });
  it("rowsOf / otherOwners", () => {
    const ls = [L(), L({ for_voucher_id: A }), L({ hold: "parked" }), L({ for_voucher_id: B }), L({ for_voucher_id: A })];
    expect(rowsOf(ls, H, A)).toEqual([1, 4]);
    expect(rowsOf(ls, H, H)).toEqual([0]);
    expect(otherOwners(ls, H).sort()).toEqual([A, B]);
  });
  it("เปลี่ยนเจ้าของ = ล้างการจับคู่สินค้า + ใช้แล้ว · เลือกใบเดิม = คงไว้", () => {
    const l = L({ voucher_line_ids: ["x"], applied_at: "t" });
    expect(setRowOwner(l, { kind: "voucher", voucherId: A }, H)).toMatchObject({ for_voucher_id: A, hold: null, voucher_line_ids: [], applied_at: null });
    expect(setRowOwner(l, { kind: "voucher", voucherId: H }, H)).toMatchObject({ for_voucher_id: null, voucher_line_ids: ["x"], applied_at: "t" });
    expect(setRowOwner(l, { kind: "parked" }, H)).toMatchObject({ hold: "parked", for_voucher_id: null, voucher_line_ids: [] });
  });
  it("ช่อง select: choiceKey ↔ parseChoiceKey", () => {
    expect(choiceKey(L(), H)).toBe(`v:${H}`);
    expect(choiceKey(L({ for_voucher_id: A }), H)).toBe(`v:${A}`);
    expect(choiceKey(L({ hold: "not_ours" }), H)).toBe("not_ours");
    expect(parseChoiceKey(`v:${A}`)).toEqual({ kind: "voucher", voucherId: A });
    expect(parseChoiceKey("parked")).toEqual({ kind: "parked" });
    expect(parseChoiceKey("search")).toBeNull();
  });
  it("ยอดของใบนี้ vs ทั้งบิล (เคสจริง EK-18700926: DECORATIONS ของ 09-15-003 · PAPER CARD ของ 09-16-002)", () => {
    const ls = [L({ description: "DECORATIONS /ORNAMENT", weight_kg: 0.85, m3: 0.011 }), L({ description: "PAPER CARD", weight_kg: 2.81, m3: 0.0093, for_voucher_id: A })];
    expect(billTotalsFor(ls, H, H)).toMatchObject({ all: { boxes: 2, kg: 3.66, m3: 0.0203 }, mine: { boxes: 1, kg: 0.85, m3: 0.011 }, isAllMine: false });
    expect(billTotalsFor(ls, H, A).mine).toEqual({ boxes: 1, kg: 2.81, m3: 0.0093 });
  });
  it("ใช้แล้ว: ต่อแถว · ใบเก่า (บิล applied ไม่มีต่อแถว) = เจ้าของบิลใช้ครบ", () => {
    const ls = [L({ applied_at: "t" }), L({ for_voucher_id: A })];
    expect(appliedFor({ voucher_id: H, status: "parsed", lines: ls }, H)).toEqual({ mine: 1, applied: 1, done: true });
    expect(appliedFor({ voucher_id: H, status: "parsed", lines: ls }, A)).toEqual({ mine: 1, applied: 0, done: false });
    expect(appliedFor({ voucher_id: H, status: "applied", lines: [L(), L()] }, H)).toEqual({ mine: 2, applied: 2, done: true });
    expect(billStatusAfter(ls, H)).toBe("parsed");
    expect(billStatusAfter([L({ applied_at: "t" }), L({ hold: "not_ours" })], H)).toBe("applied");
  });
});

describe("ป้าย \"แก้แล้วยังไม่บันทึก\" (บั๊ก: ลบแถวแล้วไม่ขึ้นป้าย → ยืนยันใบ → แถวกลับมา)", () => {
  const base = { tracking_no: "EK-18700926", bill_date: "2026-09-21", lines: [L({ no: 1 }), L({ no: 2, description: "PAPER CARD" })] };
  it("ลบแถว = ยังไม่บันทึก", () => { expect(billDirty({ ...base, lines: base.lines.slice(0, 1) }, base)).toBe(true); });
  it("แก้ตัวเลข / จับคู่ / ลาก / เปลี่ยนเจ้าของ / รหัส = ยังไม่บันทึก", () => {
    expect(billDirty({ ...base, lines: [L({ no: 1, weight_kg: 2 }), base.lines[1]] }, base)).toBe(true);
    expect(billDirty({ ...base, lines: [L({ no: 1, voucher_line_ids: ["x"] }), base.lines[1]] }, base)).toBe(true);
    expect(billDirty({ ...base, lines: [base.lines[1], base.lines[0]] }, base)).toBe(true);
    expect(billDirty({ ...base, lines: [L({ no: 1, for_voucher_id: A }), base.lines[1]] }, base)).toBe(true);
    expect(billDirty({ ...base, tracking_no: "EK-1" }, base)).toBe(true);
  });
  it("ไม่ได้แก้ / ต่างแค่ตัวพิมพ์เล็กใหญ่ของรหัส / ใช้แล้ว (ฝั่งเซิร์ฟเวอร์) = ไม่ขึ้นป้าย", () => {
    expect(billDirty({ ...base, lines: base.lines.map((l) => ({ ...l })) }, base)).toBe(false);
    expect(billDirty({ ...base, tracking_no: "ek-18700926" }, base)).toBe(false);
    expect(billDirty({ ...base, lines: [L({ no: 1, applied_at: "t" }), base.lines[1]] }, base)).toBe(false);
  });
});

describe("รวมใบ / แยกใบกลับ: แถวที่ชี้ใบที่ถูกรวม", () => {
  it("ชี้ใบที่ถูกรวม → ชี้ใบหลัก · แยกกลับ = คืน", () => {
    const ls = [L(), L({ for_voucher_id: A }), L({ for_voucher_id: B })];
    const r = retargetRows(ls, H, [A], "T");
    expect(r.lines.map((l) => l.for_voucher_id ?? null)).toEqual([null, "T", B]);
    expect(r.changed).toEqual([{ idx: 1, from: A }]);
    const back = restoreRowTargets(r.lines, H, "T", r.changed);
    expect(back.lines[1].for_voucher_id).toBe(A);
    expect(back.restored).toBe(1);
  });
  it("ใบหลักเป็นเจ้าของบิลเอง → ล้างเป็นว่าง", () => {
    expect(retargetRows([L({ for_voucher_id: A })], H, [A], H).lines[0].for_voucher_id).toBeNull();
  });
  it("แยกกลับ: แถวที่ถูกเปลี่ยนเจ้าของไปแล้วหลังรวม = ไม่แตะ", () => {
    const back = restoreRowTargets([L({ for_voucher_id: B })], H, "T", [{ idx: 0, from: A }]);
    expect(back.restored).toBe(0);
    expect(back.lines[0].for_voucher_id).toBe(B);
  });
});

describe("ใช้ร่วม: ยกการจับคู่จากใบซ้ำ", () => {
  it("จับด้วยเลขบรรทัด + Description · ไม่มีเลข = ลำดับ + Description", () => {
    const copy = [L({ no: 1, description: "DECORATIONS", voucher_line_ids: ["a"] }), L({ no: 2, description: "PAPER CARD", voucher_line_ids: ["b"] })];
    expect(matchCopyRow(copy, L({ no: 2, description: "paper card" }), 1)?.voucher_line_ids).toEqual(["b"]);
    expect(matchCopyRow(copy, L({ description: "DECORATIONS" }), 0)?.voucher_line_ids).toEqual(["a"]);
    expect(matchCopyRow(copy, L({ no: 3, description: "OTHER" }), 2)).toBeNull();
  });
});

describe("★ 11-27 สำเนาเลขเดียวกัน: กล่องเดียวกันไหม + ทับกันไหม (เคสจริง EK-16661126)", () => {
  it("boxKey: P/o.No ก่อน · ไม่มีใช้ Stock · ไม่มีใช้เลขบรรทัด + Description", () => {
    expect(boxKey({ po_no: "4E261108/44", stock: "bdg14169" })).toBe("po:4E261108/44");
    expect(boxKey({ po_no: " 4e261108/44 " })).toBe("po:4E261108/44");
    expect(boxKey({ stock: "bdg14353" })).toBe("st:BDG14353");
    expect(boxKey({ no: 2, description: "Decorations / Ornament" })).toBe("no:2|DECORATIONS/ORNAMENT");
  });
  it("แต่ละใบถือกล่องคนละกล่อง (BAG→001 · ORNAMENT→002 · DECORATIONS→003) = ไม่ทับ ไม่เตือน", () => {
    const r = dupBoxStatus([{ key: "po:557", applied: true }], [{ key: "po:44", owner: "v001", applied: true, pv: "001" }, { key: "po:556", owner: "v003", applied: true, pv: "003" }]);
    expect(r).toEqual({ overlap: [], doubleCharged: [] });
  });
  it("กล่องเดียวกันอยู่ 2 ใบ ยังไม่ใช้ทั้งคู่ = ทับ (ควรใช้ร่วม) · ใช้แล้วทั้งคู่ = ค่าส่งซ้ำ", () => {
    expect(dupBoxStatus([{ key: "po:44", applied: false }], [{ key: "po:44", owner: "v001", applied: true, pv: "001" }])).toEqual({ overlap: ["po:44"], doubleCharged: [] });
    expect(dupBoxStatus([{ key: "po:44", applied: true }], [{ key: "po:44", owner: "v001", applied: true, pv: "001" }]).doubleCharged).toEqual([{ key: "po:44", pv: "001" }]);
  });
  it("กล่องที่ใบอื่นตั้งพักไว้/ไม่ใช่ของเรา = ไม่นับว่าทับ", () => {
    expect(dupBoxStatus([{ key: "po:44", applied: true }], [{ key: "po:44", owner: null, applied: false, pv: "001" }]).overlap).toEqual([]);
  });
});
