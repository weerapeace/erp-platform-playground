import { describe, it, expect } from "vitest";
import { bangkokYearMonth, birthdayCoupon, birthdayOffer, birthdayOfferLabel, birthdayWindow, makeBirthdayCode, validBirthday, type BirthdaySettings } from "../website-birthday";
import { couponFromRow, evaluateCoupon } from "../website-coupons";
import { sanitizeProfilePatch } from "../website-members";

const S = (p: Partial<BirthdaySettings> = {}): BirthdaySettings => ({ birthday_enabled: true, birthday_discount_pct: 10, birthday_discount_baht: 0, birthday_max_discount: 0, birthday_min_subtotal: 0, ...p });

describe("🎂 สิทธิ์คูปองวันเกิดจากที่ตั้งร้าน", () => {
  it("ปิด หรือไม่ได้ใส่ส่วนลด = ไม่มีสิทธิ์", () => {
    expect(birthdayOffer(S({ birthday_enabled: false }))).toBeNull();
    expect(birthdayOffer(S({ birthday_discount_pct: 0, birthday_discount_baht: 0 }))).toBeNull();
  });
  it("ใส่ % = ใช้ % (สูงสุด 90) · ไม่ใส่ % = ใช้บาท", () => {
    expect(birthdayOffer(S({ birthday_discount_pct: 150, birthday_max_discount: 300 }))).toEqual({ kind: "percent", value: 90, maxDiscount: 300, minSubtotal: 0 });
    expect(birthdayOffer(S({ birthday_discount_pct: 0, birthday_discount_baht: 200, birthday_min_subtotal: 990 }))).toEqual({ kind: "fixed", value: 200, maxDiscount: null, minSubtotal: 990 });
  });
  it("ข้อความสิทธิ์ภาษาคน", () => {
    expect(birthdayOfferLabel(S({ birthday_discount_pct: 10, birthday_max_discount: 300, birthday_min_subtotal: 500 }))).toBe("ลด 10% (สูงสุด ฿300) · ขั้นต่ำ ฿500");
    expect(birthdayOfferLabel(S({ birthday_discount_pct: 0, birthday_discount_baht: 150 }))).toBe("ลด ฿150");
    expect(birthdayOfferLabel(S({ birthday_enabled: false }))).toBeNull();
  });
});

describe("🎂 คูปองวันเกิด = ค่าจากที่ตั้งร้านตอนตรวจ", () => {
  const row = couponFromRow({ id: "c1", shop_id: "s1", code: "BDABC234", kind: "fixed", value: 1, min_subtotal: 0, members_only: true, usage_limit: 1, active: true, owner_id: "m1", birthday_year: 2026, starts_at: null, ends_at: null });
  it("อ่าน owner/ปีวันเกิดจากแถว", () => {
    expect(row.ownerId).toBe("m1");
    expect(row.birthdayYear).toBe(2026);
  });
  it("ลด 10% จากยอด 1,000 = 100 บาท · ใช้ได้ครั้งเดียว", () => {
    const c = birthdayCoupon(row, S());
    expect(c).toMatchObject({ kind: "percent", value: 10, usageLimit: 1, membersOnly: true, active: true });
    const r = evaluateCoupon(c, 100000, { usedCount: 0, phoneUsed: false, phoneHasOrders: false, member: { reachedTiers: [] }, minTierName: null });
    expect(r.ok).toBe(true);
    const used = evaluateCoupon(c, 100000, { usedCount: 1, phoneUsed: false, phoneHasOrders: false, member: { reachedTiers: [] }, minTierName: null });
    expect(used.ok).toBe(false);
  });
  it("ร้านปิดคูปองวันเกิด = ใบที่ออกไปแล้วใช้ไม่ได้", () => {
    expect(birthdayCoupon(row, S({ birthday_enabled: false })).active).toBe(false);
  });
});

describe("🎂 วันเกิด · เวลาไทย · โค้ด", () => {
  it("ตรวจวันที่จริง (29 ก.พ. ได้ · 31 เม.ย. ไม่ได้)", () => {
    expect(validBirthday(2, 29)).toBe(true);
    expect(validBirthday(4, 31)).toBe(false);
    expect(validBirthday(13, 1)).toBe(false);
    expect(validBirthday("3", "12")).toBe(true);
    expect(validBirthday(undefined, 5)).toBe(false);
  });
  it("เดือนตามเวลาไทย: 31 ต.ค. 18:00 UTC = 1 พ.ย. ไทย", () => {
    expect(bangkokYearMonth(new Date("2026-10-31T18:00:00Z"))).toEqual({ year: 2026, month: 11 });
    expect(bangkokYearMonth(new Date("2026-12-31T16:59:00Z"))).toEqual({ year: 2026, month: 12 });
  });
  it("ใช้ได้ทั้งเดือน (เวลาไทย) — ไม่ร่นวันสุดท้าย", () => {
    expect(birthdayWindow(2026, 2)).toEqual({ startsAt: "2026-01-31T17:00:00.000Z", endsAt: "2026-02-28T16:59:59.000Z" });
    expect(birthdayWindow(2026, 12).endsAt).toBe("2026-12-31T16:59:59.000Z");
  });
  it("โค้ด BD + 6 ตัวที่ไม่สับสน", () => {
    let i = 0;
    const code = makeBirthdayCode(() => (i++ % 7) / 7);
    expect(code).toMatch(/^BD[A-HJ-KM-NP-Z2-9]{6}$/);
  });
});

describe("🎂 โปรไฟล์: วันเกิดมาคู่กันและเป็นวันที่จริง", () => {
  it("ถูก = เก็บ birth_month/birth_day", () => {
    expect(sanitizeProfilePatch({ birthMonth: 3, birthDay: 12 })).toEqual({ ok: true, patch: { birth_month: 3, birth_day: 12 } });
  });
  it("ผิด/ไม่ครบ = บอกเหตุผล", () => {
    expect(sanitizeProfilePatch({ birthMonth: 2, birthDay: 30 }).ok).toBe(false);
    expect(sanitizeProfilePatch({ birthMonth: 5 }).ok).toBe(false);
  });
});
