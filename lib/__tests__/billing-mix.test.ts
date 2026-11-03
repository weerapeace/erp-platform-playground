import { describe, expect, it } from "vitest";
import { mixLevelOf, partyLabel, relationTo, validateMix, type BillingParty } from "@/lib/billing-mix";

const P = (id: string, name: string, tax_id: string | null, tax_branch: string | null): BillingParty => ({ id, name, tax_id, tax_branch });
const parties = new Map<string, BillingParty>([
  ["wh", P("wh", "บริษัท เซ็นทรัลทำ วิสาหกิจเพื่อสังคม จำกัด สาขาคลังสินค้าเซ็นทรัลทำ (สาขาที่ 00005)", "0105561095357", "00005")],
  ["hq", P("hq", "บริษัท เซ็นทรัลทำ วิสาหกิจเพื่อสังคม จำกัด สำนักงานใหญ่ (สาขาที่ 00000)", "0-1055-61095-35-7", "00000")],
  ["ig", P("ig", "บริษัท ไอจี อินเตอร์เนชั่นแนล จำกัด (สำนักงานใหญ่)", "0105555168887", "00000")],
  ["nt", P("nt", "บริษัท เนเวอร์มายด์ จำกัด", null, "00000")],
]);

describe("billing-mix — ความสัมพันธ์กับลูกค้าหลัก", () => {
  it("ลูกค้าเดียวกัน / ไม่มีลูกค้า = 0", () => {
    expect(relationTo("wh", "wh", parties)).toBe(0);
    expect(relationTo("wh", null, parties)).toBe(0);
  });
  it("เลขผู้เสียภาษีตรงกัน (แม้มีขีด) = คนละสาขา", () => {
    expect(relationTo("wh", "hq", parties)).toBe(1);
  });
  it("เลขไม่ตรง หรือไม่มีเลข = คนละบริษัท", () => {
    expect(relationTo("wh", "ig", parties)).toBe(2);
    expect(relationTo("nt", "wh", parties)).toBe(2);
  });
  it("ระดับทั้งใบ = ห่างที่สุด", () => {
    expect(mixLevelOf([0, 0])).toBeNull();
    expect(mixLevelOf([0, 1])).toBe("branch");
    expect(mixLevelOf([1, 2, 0])).toBe("company");
  });
});

describe("billing-mix — ป้ายสาขา (ตรงกับ DB)", () => {
  it("บริษัทเดียวกัน → ชื่อสาขา + เลขสาขา / สำนักงานใหญ่", () => {
    expect(partyLabel(parties.get("wh"), true)).toBe("สาขาคลังสินค้าเซ็นทรัลทำ (สาขา 00005)");
    expect(partyLabel(parties.get("hq"), true)).toBe("สำนักงานใหญ่");
  });
  it("คนละบริษัท → ชื่อเต็ม", () => {
    expect(partyLabel(parties.get("ig"), false)).toBe("บริษัท ไอจี อินเตอร์เนชั่นแนล จำกัด (สำนักงานใหญ่)");
  });
});

describe("billing-mix — ตรวจก่อนบันทึก", () => {
  it("ลูกค้าเดียวไม่ต้องมีเหตุผล", () => expect(validateMix(null, "", false)).toBeNull());
  it("รวมสาขาต้องมีเหตุผล ≥ 5 ตัว", () => {
    expect(validateMix("branch", "abc", false)).toMatch(/เหตุผล/);
    expect(validateMix("branch", "สาขาจ่ายรวม", false)).toBeNull();
  });
  it("คนละบริษัทต้องติ๊กยืนยัน (ยกเว้นใบที่ยืนยันไว้แล้ว)", () => {
    expect(validateMix("company", "บริษัทในเครือ", false)).toMatch(/ติ๊ก/);
    expect(validateMix("company", "บริษัทในเครือ", true)).toBeNull();
    expect(validateMix("company", "บริษัทในเครือ", false, true)).toBeNull();
  });
});
