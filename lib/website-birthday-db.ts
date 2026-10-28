/**
 * 🎂 คูปองวันเกิด — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎอยู่ lib/website-birthday.ts
 * ใช้ที่: /api/storefront-member/coupons (หน้าบัญชี/แท็บคูปองของเว็บร้าน — เปิดในเดือนเกิด = ออกคูปองให้)
 */
import { bangkokYearMonth, birthdayOffer, birthdayWindow, makeBirthdayCode, type BirthdaySettings } from "@/lib/website-birthday";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/**
 * คูปองวันเกิดปีนี้ของสมาชิก — ยังไม่มี + เดือนนี้เป็นเดือนเกิด + ร้านเปิด = สร้างให้ (1 คน 1 ใบต่อปี)
 * กันซ้ำ 2 ชั้น: อ่านก่อน · ดัชนี store_coupons_birthday_uidx (กดพร้อมกัน 2 แท็บ → อีกแท็บได้ 23505 แล้วอ่านอันที่เข้าก่อน)
 * value 1 = ค่าจองที่ (DB บังคับ > 0) — มูลค่าจริงอ่านจากที่ตั้งร้านตอนตรวจ (birthdayCoupon) · คืน null = ไม่ใช่เดือนเกิด/ร้านไม่เปิด/ไม่ได้ตั้งวันเกิด
 */
export async function ensureBirthdayCoupon(
  sb: Admin,
  shopId: string,
  member: { id: string; birth_month?: number | null },
  info: BirthdaySettings,
  now: Date = new Date(),
): Promise<{ id: string; code: string } | null> {
  if (!member.birth_month || !birthdayOffer(info)) return null;
  const { year, month } = bangkokYearMonth(now);
  if (member.birth_month !== month) return null;
  const read = async () => {
    const { data } = await sb.from("store_coupons").select("id, code").eq("shop_id", shopId).eq("owner_id", member.id).eq("birthday_year", year).maybeSingle();
    return (data as { id: string; code: string } | null) ?? null;
  };
  const had = await read();
  if (had) return had;
  const win = birthdayWindow(year, month);
  for (let i = 0; i < 6; i++) {
    const { data: ins, error } = await sb
      .from("store_coupons")
      .insert({
        shop_id: shopId,
        code: makeBirthdayCode(),
        kind: "fixed",
        value: 1,
        min_subtotal: 0,
        per_phone_once: false,
        new_customers_only: false,
        members_only: true,
        usage_limit: 1,
        active: true,
        starts_at: win.startsAt,
        ends_at: win.endsAt,
        note: `🎂 คูปองวันเกิด ${year} (สร้างอัตโนมัติ)`,
        owner_id: member.id,
        birthday_year: year,
      })
      .select("id, code")
      .maybeSingle();
    if (ins) return ins as { id: string; code: string };
    const again = await read();
    if (again) return again;
    // 23505 = โค้ดสุ่มชนของคนอื่น → สุ่มใหม่ · อย่างอื่น = เลิก (ไม่ทำให้หน้าบัญชีพัง)
    if (error && (error as { code?: string }).code !== "23505") return null;
  }
  return null;
}
