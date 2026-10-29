/**
 * ✉️ เปิด/ปิด การสมัคร-เข้าสู่ระบบด้วยอีเมลของร้าน (ERP › สมาชิก › 🔑 ช่องทางเข้าสู่ระบบ) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 *   password = อีเมล + รหัสผ่าน (ยืนยันอีเมลด้วยลิงก์) · otp = อีเมล + รหัส 6 หลัก (ไม่ต้องมีรหัสผ่าน)
 * เก็บใน store_settings (ค่า "1"/"0") — ไม่อยู่ในทะเบียน site-info จึงไม่โผล่ในหน้าข้อมูลร้าน/ไม่ส่งออกสาธารณะเอง
 * เว็บร้านรู้ผ่าน /api/public/storefront/member-config (เปิด + ส่งอีเมลได้ เท่านั้น) — ไม่ต้องตั้ง env ฝั่งเว็บ
 * password = null = ร้านยังไม่เคยตั้ง (ร้านเก่าที่เปิดผ่าน env MEMBER_EMAIL_LOGIN ฝั่งเว็บยังใช้ได้เหมือนเดิม)
 */
type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export const EMAIL_LOGIN_KEYS = { password: "member_email_password", otp: "member_email_otp" } as const;

export interface EmailLoginSettings {
  password: boolean | null;
  otp: boolean;
}

export async function readEmailLogin(sb: Admin, shopId: string): Promise<EmailLoginSettings> {
  const { data } = await sb.from("store_settings").select("key, value").eq("shop_id", shopId).in("key", [EMAIL_LOGIN_KEYS.password, EMAIL_LOGIN_KEYS.otp]);
  const m = new Map(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, String(r.value ?? "")]));
  const pw = m.get(EMAIL_LOGIN_KEYS.password);
  return { password: pw === undefined ? null : pw === "1", otp: m.get(EMAIL_LOGIN_KEYS.otp) === "1" };
}

export async function writeEmailLogin(sb: Admin, shopId: string, v: { password: boolean; otp: boolean }): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await sb.from("store_settings").upsert(
    [
      { shop_id: shopId, key: EMAIL_LOGIN_KEYS.password, value: v.password ? "1" : "0", updated_at: now },
      { shop_id: shopId, key: EMAIL_LOGIN_KEYS.otp, value: v.otp ? "1" : "0", updated_at: now },
    ],
    { onConflict: "shop_id,key" }
  );
  return !error;
}
