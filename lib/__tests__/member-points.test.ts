import { describe, it, expect } from "vitest";
import { maxRedeemable, pointsConfigFrom, pointsEarned, pointsSyncRows, sanitizeTiers, SUGGESTED_TIERS, tierFor, validateRedeem } from "../member-points";

/** ⭐ แต้ม/ระดับ — เงินจริงเกี่ยว (ใช้แต้มลดราคา) */
const cfg = pointsConfigFrom({ points_enabled: true, points_earn_unit: 100, points_value: 1, points_max_redeem_pct: 50, points_min_redeem: 10 });

describe("ได้แต้ม", () => {
  it("ทุก ฿100 = 1 แต้ม (ปัดลง) · ตัวคูณระดับ", () => {
    expect(pointsEarned(1990, cfg)).toBe(19);
    expect(pointsEarned(99.99, cfg)).toBe(0);
    expect(pointsEarned(1990, cfg, 1.5)).toBe(28);
    expect(pointsEarned(1990, cfg, 2)).toBe(38);
  });
  it("ปิดอยู่ / ยอดติดลบ = 0", () => {
    expect(pointsEarned(1990, { ...cfg, enabled: false })).toBe(0);
    expect(pointsEarned(-5, cfg)).toBe(0);
  });
  it("ค่าที่ตั้งเพี้ยน = ใช้ค่าแนะนำ", () => {
    expect(pointsConfigFrom({ points_enabled: true, points_earn_unit: 0, points_value: -1, points_max_redeem_pct: 500 })).toMatchObject({ earnUnit: 100, pointValue: 1, maxRedeemPct: 50 });
  });
});

describe("ใช้แต้ม", () => {
  it("เพดาน 50% ของยอดสินค้า และไม่เกินแต้มที่มี", () => {
    expect(maxRedeemable(1000, 1190, cfg)).toBe(595);
    expect(maxRedeemable(120, 1190, cfg)).toBe(120);
  });
  it("แลกเป็นบาท · ขั้นต่ำ · แต้มไม่พอ · เกินเพดาน", () => {
    expect(validateRedeem(100, 500, 1190, cfg)).toEqual({ ok: true, points: 100, discount: 100 });
    expect(validateRedeem(5, 500, 1190, cfg)).toMatchObject({ ok: false });
    expect(validateRedeem(600, 500, 1190, cfg)).toMatchObject({ ok: false });
    const r = validateRedeem(400, 1000, 600, cfg);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain("300");
    expect(validateRedeem(0, 0, 100, cfg)).toEqual({ ok: true, points: 0, discount: 0 });
  });
  it("ค่าแต้มเป็นเศษสตางค์คิดถูก (1 แต้ม = ฿0.25)", () => {
    expect(validateRedeem(40, 100, 1000, { ...cfg, pointValue: 0.25 })).toEqual({ ok: true, points: 40, discount: 10 });
  });
});

describe("ระดับ", () => {
  it("ตามยอด 12 เดือน + ระดับถัดไปขาดอีกเท่าไร", () => {
    expect(tierFor(0, SUGGESTED_TIERS).tier?.key).toBe("member");
    const s = tierFor(5200, SUGGESTED_TIERS);
    expect(s.tier?.key).toBe("silver");
    expect(s.next).toMatchObject({ tier: { key: "gold" }, need: 9800 });
    expect(tierFor(20000, SUGGESTED_TIERS).next).toBeNull();
    expect(tierFor(100, []).tier).toBeNull();
  });
  it("ตรวจข้อมูลระดับ: ชื่อ/ตัวคูณ/ซ้ำ", () => {
    expect(sanitizeTiers([{ name: "" }]).ok).toBe(false);
    expect(sanitizeTiers([{ name: "A", minSpend: 0, earnMultiplier: 0.5 }]).ok).toBe(false);
    expect(sanitizeTiers([{ key: "a", name: "A", minSpend: 0, earnMultiplier: 1 }, { key: "a", name: "B", minSpend: 1, earnMultiplier: 1 }]).ok).toBe(false);
    const ok = sanitizeTiers([{ name: "Gold", minSpend: 15000, earnMultiplier: 2 }, { name: "Member", minSpend: 0, earnMultiplier: 1 }]);
    expect(ok.ok && ok.tiers.map((t) => t.key)).toEqual(["member", "gold"]);
  });
  it("ระดับชื่อไทย: ได้รหัส t1, t2… ไม่ชนกับระดับเดิม · ชื่อซ้ำไม่ได้", () => {
    const r = sanitizeTiers([
      { key: "t1", name: "ทั่วไป", minSpend: 0, earnMultiplier: 1 },
      { name: "ทอง", minSpend: 10000, earnMultiplier: 2 },
      { name: "เพชร", minSpend: 30000, earnMultiplier: 3 },
    ]);
    expect(r.ok && r.tiers.map((t) => t.key)).toEqual(["t1", "t2", "t3"]);
    expect(sanitizeTiers([{ name: "ทอง", minSpend: 0, earnMultiplier: 1 }, { name: "ทอง", minSpend: 5, earnMultiplier: 1 }]).ok).toBe(false);
  });
});

describe("ปรับแต้มตามสถานะออเดอร์ (เรียกซ้ำไม่บวกซ้ำ)", () => {
  it("สำเร็จครั้งแรก = ได้แต้ม · ซ้ำ = ไม่มีอะไร", () => {
    expect(pointsSyncRows({ status: "completed", earnTarget: 19, earnNow: 0, redeemOriginal: 0, redeemNow: 0 })).toEqual([{ kind: "earn", delta: 19 }]);
    expect(pointsSyncRows({ status: "completed", earnTarget: 19, earnNow: 19, redeemOriginal: 0, redeemNow: 0 })).toEqual([]);
  });
  it("สำเร็จแล้วถอยกลับ / ยกเลิก = เรียกแต้มคืน · ยกเลิก = คืนแต้มที่ใช้", () => {
    expect(pointsSyncRows({ status: "shipped", earnTarget: 19, earnNow: 19, redeemOriginal: 0, redeemNow: 0 })).toEqual([{ kind: "revoke", delta: -19 }]);
    expect(pointsSyncRows({ status: "cancelled", earnTarget: 19, earnNow: 19, redeemOriginal: 100, redeemNow: -100 })).toEqual([
      { kind: "revoke", delta: -19 },
      { kind: "refund", delta: 100 },
    ]);
  });
  it("ยกเลิกแล้วกลับมาเป็นรอดำเนินการ = หักแต้มที่ใช้อีกครั้ง", () => {
    expect(pointsSyncRows({ status: "pending", earnTarget: 0, earnNow: 0, redeemOriginal: 100, redeemNow: 0 })).toEqual([{ kind: "redeem", delta: -100 }]);
  });
});
