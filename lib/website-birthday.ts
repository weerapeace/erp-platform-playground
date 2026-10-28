/**
 * 🎂 คูปองวันเกิดสมาชิก — กฎกลาง (ฟังก์ชันล้วน · ทดสอบได้)
 *
 * วันเกิด = store_customers.birth_month / birth_day (เก็บแค่วัน+เดือน ไม่เก็บปี · ลูกค้ากรอกเองในโปรไฟล์ · ตั้งแล้วแก้เองไม่ได้)
 * คูปอง = แถวใน store_coupons ที่มี owner_id (เจ้าของคนเดียว) + birthday_year (1 คน 1 ใบต่อปี — ดัชนี store_coupons_birthday_uidx)
 *   ออกให้เองเมื่อสมาชิกเปิดหน้าบัญชี/แท็บคูปองในเดือนเกิด (lib/website-birthday-db ensureBirthdayCoupon) · ใช้ได้ทั้งเดือนเกิด (เวลาไทย)
 * มูลค่า/ขั้นต่ำ อ่านจากที่ตั้งร้าน "ตอนตรวจ" เสมอ (ร้านเปลี่ยนส่วนลด = คูปองวันเกิดทุกใบเปลี่ยนตาม) — birthdayCoupon
 * ที่ตั้งร้าน: ERP › ข้อมูลร้าน › 🎂 คูปองวันเกิด (lib/website-site-info กลุ่ม birthday) · แท็บคูปอง ERP ไม่โชว์คูปองพวกนี้
 */
import type { StoreCoupon } from "@/lib/website-coupons";

export interface BirthdaySettings {
  birthday_enabled: boolean;
  /** ลดเป็น % (1–90) · 0 = ใช้ลดเป็นบาทแทน */
  birthday_discount_pct: number;
  /** ลดเป็นบาท (ใช้เมื่อไม่ได้ใส่ %) */
  birthday_discount_baht: number;
  /** ลดสูงสุด (บาท · ใช้กับแบบ %) · 0 = ไม่จำกัด */
  birthday_max_discount: number;
  birthday_min_subtotal: number;
}

/** มูลค่าคูปองวันเกิดจากที่ตั้งร้าน — null = ร้านยังไม่เปิด/ยังไม่ใส่ส่วนลด */
export function birthdayOffer(s: BirthdaySettings): { kind: "percent" | "fixed"; value: number; maxDiscount: number | null; minSubtotal: number } | null {
  if (!s.birthday_enabled) return null;
  const pct = Math.round(Number(s.birthday_discount_pct) || 0);
  const baht = Math.max(0, Number(s.birthday_discount_baht) || 0);
  const minSubtotal = Math.max(0, Number(s.birthday_min_subtotal) || 0);
  if (pct > 0) {
    const max = Math.max(0, Number(s.birthday_max_discount) || 0);
    return { kind: "percent", value: Math.min(90, pct), maxDiscount: max > 0 ? max : null, minSubtotal };
  }
  if (baht > 0) return { kind: "fixed", value: baht, maxDiscount: null, minSubtotal };
  return null;
}

/** ข้อความสั้นของสิทธิ์ เช่น "ลด 10% (สูงสุด ฿300) · ขั้นต่ำ ฿500" — ไว้โชว์ลูกค้า */
export function birthdayOfferLabel(s: BirthdaySettings): string | null {
  const o = birthdayOffer(s);
  if (!o) return null;
  const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
  const off = o.kind === "percent" ? `ลด ${o.value}%${o.maxDiscount ? ` (สูงสุด ${baht(o.maxDiscount)})` : ""}` : `ลด ${baht(o.value)}`;
  return o.minSubtotal > 0 ? `${off} · ขั้นต่ำ ${baht(o.minSubtotal)}` : off;
}

/** คูปองวันเกิด + ค่าจากที่ตั้งร้านปัจจุบัน (เฉพาะเจ้าของ · ใช้ได้ 1 ครั้ง · ช่วงเวลาตามแถว = เดือนเกิด) — ร้านปิด = ใช้ไม่ได้ */
export function birthdayCoupon(c: StoreCoupon, s: BirthdaySettings): StoreCoupon {
  const o = birthdayOffer(s);
  return {
    ...c,
    kind: o?.kind ?? "fixed",
    value: o?.value ?? 0,
    minSubtotal: o?.minSubtotal ?? 0,
    maxDiscount: o?.maxDiscount ?? null,
    usageLimit: 1,
    perPhoneOnce: false,
    newCustomersOnly: false,
    membersOnly: true,
    minTier: null,
    active: c.active && !!o,
  };
}

/** วันที่ถูกไหม (29 ก.พ. ได้ — ไม่รู้ปีเกิด) */
export function validBirthday(month: unknown, day: unknown): boolean {
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(2024, m, 0)).getUTCDate();
}

/** ปี/เดือน ตามเวลาไทย (UTC+7) ของเวลาที่ให้มา */
export function bangkokYearMonth(now: Date = new Date()): { year: number; month: number } {
  const t = new Date(now.getTime() + 7 * 3600_000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
}

/** ช่วงใช้คูปอง = ทั้งเดือนเกิดตามเวลาไทย → ISO (UTC) · ⚠️ ใช้ Date.UTC เสมอ (new Date(y,m,1) ในเวลาไทยร่นไป 1 วัน) */
export function birthdayWindow(year: number, month: number): { startsAt: string; endsAt: string } {
  const start = Date.UTC(year, month - 1, 1) - 7 * 3600_000;
  const end = Date.UTC(year, month, 1) - 7 * 3600_000 - 1000;
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}

/** ตัวอักษรที่ไม่สับสน (ไม่มี 0/O/1/I/L) — โค้ด "BD" + 6 ตัว เช่น BDK7Q2MX */
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeBirthdayCode(rand: () => number = Math.random): string {
  let s = "BD";
  for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(rand() * ALPHA.length) % ALPHA.length];
  return s;
}
