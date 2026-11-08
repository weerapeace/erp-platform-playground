import { describe, expect, it } from "vitest";
import { decideAdd, summarizePlan, needsTypedConfirm, missingList, isOnShop, ADD_TYPED_CONFIRM_OVER, type AddReadinessRow } from "@/lib/platform-add-plan";

const row = (over: Partial<AddReadinessRow> = {}): AddReadinessRow => ({
  id: "p1", code: "BKB20", name: "หัวเข็มขัด", status: "new", ready_now: true, missing: "", warnings: "", on_shop: false, ...over,
});

describe("decideAdd — กันซ้ำก่อนเสมอ", () => {
  it("มีรายการบนร้านที่จับคู่อยู่แล้ว = ข้าม แม้ผู้ใช้เลือกลงจริง", () => {
    expect(decideAdd(row({ on_shop: true }), true, false)).toBe("skip_listed");
    expect(decideAdd(row({ on_shop: true }), false, false)).toBe("skip_listed");
  });
  it("ร่างมีรหัสบนร้านแล้ว (listed) = ข้าม", () => expect(decideAdd(row({ status: "listed" }), true, false)).toBe("skip_listed"));
  it("มีบนร้านแล้วชนะการกดข้าม (บอกเหตุผลที่ถูกต้อง)", () => expect(decideAdd(row({ on_shop: true }), true, true)).toBe("skip_listed"));
});

describe("decideAdd — ลงจริง vs บันทึกร่าง", () => {
  it("ลงจริง + ข้อมูลครบ = ลงจริง", () => expect(decideAdd(row(), true, false)).toBe("publish"));
  it("ลงจริง + ข้อมูลไม่ครบ = ข้าม (ไม่ส่งของไม่ครบขึ้นร้าน)", () => expect(decideAdd(row({ ready_now: false, missing: "รูปสินค้า ≥ 1" }), true, false)).toBe("skip_missing"));
  it("เตรียมร่าง = บันทึกได้แม้ไม่ครบ", () => {
    expect(decideAdd(row({ ready_now: false }), false, false)).toBe("prepare");
    expect(decideAdd(row(), false, false)).toBe("prepare");
  });
  it("ผู้ใช้กดข้าม = ข้าม", () => expect(decideAdd(row(), true, true)).toBe("skip_user"));
});

describe("สรุป + คำยืนยัน", () => {
  it("นับแต่ละแบบ", () => {
    expect(summarizePlan(["publish", "publish", "skip_listed", "prepare"])).toEqual({ publish: 2, prepare: 1, skip_listed: 1, skip_missing: 0, skip_user: 0, total: 4 });
  });
  it(`ลงจริงเกิน ${ADD_TYPED_CONFIRM_OVER} ตัวต้องพิมพ์ยืนยัน`, () => {
    expect(needsTypedConfirm(ADD_TYPED_CONFIRM_OVER)).toBe(false);
    expect(needsTypedConfirm(ADD_TYPED_CONFIRM_OVER + 1)).toBe(true);
  });
  it("แยกข้อที่ขาด", () => {
    expect(missingList("รูปสินค้า ≥ 1 · น้ำหนักพัสดุ (ยังไม่ได้ใส่)")).toEqual(["รูปสินค้า ≥ 1", "น้ำหนักพัสดุ (ยังไม่ได้ใส่)"]);
    expect(missingList("")).toEqual([]);
  });
  it("isOnShop", () => {
    expect(isOnShop({ status: "new", on_shop: false })).toBe(false);
    expect(isOnShop({ status: "new" })).toBe(false);
    expect(isOnShop({ status: "listed" })).toBe(true);
  });
});
