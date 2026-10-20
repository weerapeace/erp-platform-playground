import { describe, expect, it } from "vitest";
import { cutoffText, defaultMethodId, isRemotePostal, methodServes, normalizeShipping, quoteMethod } from "@/lib/website-shipping";

const legacy = { shipping_flat: 50, free_shipping_min: 1500, pay_cod: true };
const cfg = normalizeShipping(
  {
    methods: [
      { id: "std", name: "ส่งธรรมดา", fee: { kind: "tiers", tiers: [{ upTo: 1, fee: 45, box: "A" }, { upTo: 2, fee: 55, box: "B" }, { upTo: 4, fee: 70, box: "C" }, { upTo: 9, fee: 80, box: "E" }] }, freeMin: 1500, remoteFee: 50, codAllowed: true, codFee: 30 },
      { id: "ems", name: "EMS", fee: { kind: "flat", amount: 80 }, codAllowed: false },
      { id: "sameday", name: "ด่วน", fee: { kind: "flat", amount: 120 }, area: "bkk", cutoff: "14:00" },
      { id: "pickup", kind: "pickup", name: "รับเอง", fee: { kind: "flat", amount: 0 }, codAllowed: true, remoteFee: 99 },
      { id: "off", name: "ปิด", enabled: false },
    ],
    remotePostals: ["94", "84320", "x"],
  },
  legacy,
);
const ctx = (o: Partial<{ subtotal: number; qty: number; postal: string; cod: boolean }> = {}) => ({ subtotal: 990, qty: 1, postal: "10200", cod: false, ...o });
const m = (id: string) => cfg.methods.find((x) => x.id === id)!;

describe("normalizeShipping", () => {
  it("ร้านที่ยังไม่ตั้ง = วิธีเดียวจากค่าส่งเหมาเดิม (ยอดเท่าเดิม)", () => {
    const c = normalizeShipping(null, legacy);
    expect(c.legacy).toBe(true);
    expect(c.methods).toHaveLength(1);
    expect(quoteMethod(c.methods[0], ctx(), c).fee).toBe(50);
    expect(quoteMethod(c.methods[0], ctx({ subtotal: 1500 }), c).fee).toBe(0);
    expect(c.methods[0].codAllowed).toBe(true);
  });
  it("อ่าน JSON string ได้ + แถวสุดท้ายของตารางรับทุกจำนวน + รหัสห่างไกลขยะถูกตัด", () => {
    const c = normalizeShipping(JSON.stringify({ methods: [{ name: "x", fee: { kind: "tiers", tiers: [{ upTo: 3, fee: 10 }, { upTo: 1, fee: 5 }] } }] }), legacy);
    const t = c.methods[0].fee;
    expect(t.kind === "tiers" && t.tiers.map((x) => x.upTo)).toEqual([1, null]);
    expect(cfg.remotePostals).toEqual(["94", "84320"]);
  });
  it("รับเองที่ร้านไม่บวกพื้นที่ห่างไกล", () => expect(m("pickup").remoteFee).toBe(0));
});

describe("quoteMethod", () => {
  it("ตามจำนวนชิ้น + กล่องแนะนำ (เกินตาราง = แถวสุดท้าย)", () => {
    expect(quoteMethod(m("std"), ctx({ qty: 1 }), cfg)).toMatchObject({ fee: 45, box: "A" });
    expect(quoteMethod(m("std"), ctx({ qty: 3 }), cfg)).toMatchObject({ fee: 70, box: "C" });
    expect(quoteMethod(m("std"), ctx({ qty: 30 }), cfg)).toMatchObject({ fee: 80, box: "E" });
  });
  it("ส่งฟรีเมื่อถึงยอด แต่พื้นที่ห่างไกลยังบวก", () => {
    expect(quoteMethod(m("std"), ctx({ subtotal: 1500 }), cfg)).toMatchObject({ fee: 0, freeApplied: true });
    expect(quoteMethod(m("std"), ctx({ subtotal: 1500, postal: "94000" }), cfg)).toMatchObject({ fee: 50, remoteFee: 50 });
    expect(quoteMethod(m("std"), ctx({ postal: "84320" }), cfg)).toMatchObject({ fee: 95 });
    expect(quoteMethod(m("std"), ctx(), cfg).toFree).toBe(510);
  });
  it("COD: บวกค่าธรรมเนียมเฉพาะวิธีที่รับ · วิธีที่ไม่รับ = เลือกไม่ได้", () => {
    expect(quoteMethod(m("std"), ctx({ cod: true }), cfg)).toMatchObject({ codFee: 30, available: true });
    expect(quoteMethod(m("ems"), ctx({ cod: true }), cfg)).toMatchObject({ available: false, reason: "cod" });
  });
  it("จำกัดพื้นที่: ด่วนในวันเฉพาะรหัส 10xxx · ยังไม่กรอกรหัส = ยังให้เลือก", () => {
    expect(quoteMethod(m("sameday"), ctx({ postal: "50000" }), cfg)).toMatchObject({ available: false, reason: "area" });
    expect(quoteMethod(m("sameday"), ctx({ postal: "10540" }), cfg).available).toBe(true);
    expect(methodServes(m("sameday"), "")).toBe(true);
  });
  it("วิธีที่ปิด = เลือกไม่ได้", () => expect(quoteMethod(m("off"), ctx(), cfg).reason).toBe("disabled"));
});

describe("ตัวช่วย", () => {
  it("isRemotePostal: ตรงตัว / ขึ้นต้น / รหัสไม่ครบ", () => {
    expect(isRemotePostal("84320", cfg)).toBe(true);
    expect(isRemotePostal("94110", cfg)).toBe(true);
    expect(isRemotePostal("84321", cfg)).toBe(false);
    expect(isRemotePostal("94", cfg)).toBe(false);
  });
  it("defaultMethodId: วิธีแรกที่ใช้ได้กับที่อยู่/COD", () => {
    expect(defaultMethodId(cfg, { postal: "50000", cod: false })).toBe("std");
    const noStd = { ...cfg, methods: cfg.methods.filter((x) => x.id !== "std") };
    expect(defaultMethodId(noStd, { postal: "50000", cod: true })).toBe("pickup");
  });
  it("cutoffText ตามเวลาไทย", () => {
    expect(cutoffText(m("sameday"), new Date("2026-10-20T05:00:00Z"))).toBe("สั่งก่อน 14:00 ส่งวันนี้"); // 12:00 ไทย
    expect(cutoffText(m("sameday"), new Date("2026-10-20T08:30:00Z"))).toBe("ส่งรอบถัดไป (ตัดรอบ 14:00)"); // 15:30 ไทย
    expect(cutoffText(m("std"), new Date())).toBe("");
  });
});
