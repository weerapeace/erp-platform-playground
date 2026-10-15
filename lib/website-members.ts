/**
 * 👤 สมาชิกเว็บร้าน — กฎกลาง (ฟังก์ชันล้วน ใช้ได้ทั้ง API และหน้าจอ · มี test)
 *
 * ระบบสมาชิกแยกจาก login พนักงานโดยสิ้นเชิง (ดู migration 202610160100):
 *   เว็บร้านทำ OAuth เอง (Google/LINE/Facebook) → ส่งข้อมูลโปรไฟล์ที่ตรวจแล้วมาที่ ERP /api/storefront-member/* พร้อมกุญแจภายใน
 *   ERP หา/สร้างสมาชิกของร้านนั้น (แยกบัญชีต่อร้าน) แล้วคืนรหัสสมาชิก → เว็บร้านเก็บในคุกกี้ที่เซ็นแล้ว
 *
 * กฎผูกบัญชีตอนเข้าสู่ระบบ (resolveLogin):
 *   1) เคยเข้าด้วยวิธีนี้แล้ว (provider + id ตรง) → สมาชิกเดิม
 *   2) อีเมลที่ "ผู้ให้บริการยืนยันแล้ว" ตรงกับสมาชิกเดิมในร้าน → ผูกวิธีใหม่เข้าบัญชีเดิม (เช่น เคยใช้ Google แล้วมาใช้ Facebook อีเมลเดียวกัน)
 *   3) ไม่เจอ → สร้างสมาชิกใหม่
 *   อีเมลที่ไม่ได้ยืนยัน ห้ามใช้ผูกบัญชีเด็ดขาด (กันคนอื่นตั้งอีเมลเราแล้วเข้าบัญชีเรา)
 */

export type MemberProvider = "google" | "line" | "facebook" | "password";
export const MEMBER_PROVIDERS: readonly MemberProvider[] = ["google", "line", "facebook", "password"];
export const PROVIDER_LABEL: Record<MemberProvider, string> = { google: "Google", line: "LINE", facebook: "Facebook", password: "อีเมล" };

export interface MemberLoginInput {
  provider: MemberProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ข้อมูลจากเว็บร้าน → ตรวจครบ (บอกว่าผิดตรงไหน) */
export function sanitizeLoginInput(raw: unknown): { ok: true; input: MemberLoginInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const provider = String(r.provider ?? "") as MemberProvider;
  if (!MEMBER_PROVIDERS.includes(provider)) return { ok: false, error: "วิธีเข้าสู่ระบบไม่ถูกต้อง" };
  const providerUserId = clean(r.providerUserId, 200);
  if (!providerUserId) return { ok: false, error: "ไม่มีรหัสผู้ใช้จากผู้ให้บริการ" };
  const emailRaw = clean(r.email, 200).toLowerCase();
  const email = EMAIL_RE.test(emailRaw) ? emailRaw : null;
  const avatar = clean(r.avatarUrl, 500);
  return {
    ok: true,
    input: {
      provider,
      providerUserId,
      email,
      emailVerified: !!email && r.emailVerified === true,
      name: clean(r.name, 120),
      avatarUrl: /^https:\/\//i.test(avatar) ? avatar : null,
    },
  };
}

/** ผลการตัดสินว่าเข้าสู่ระบบเป็นใคร (ฝั่งฐานข้อมูลทำตาม) */
export type LoginDecision =
  | { kind: "existing"; customerId: string }
  | { kind: "link"; customerId: string }
  | { kind: "create" }
  | { kind: "blocked" };

export function resolveLogin(
  input: Pick<MemberLoginInput, "email" | "emailVerified">,
  found: { byIdentity: { customerId: string; status: string } | null; byEmail: { customerId: string; status: string } | null }
): LoginDecision {
  if (found.byIdentity) return found.byIdentity.status === "active" ? { kind: "existing", customerId: found.byIdentity.customerId } : { kind: "blocked" };
  if (input.email && input.emailVerified && found.byEmail) {
    return found.byEmail.status === "active" ? { kind: "link", customerId: found.byEmail.customerId } : { kind: "blocked" };
  }
  return { kind: "create" };
}

/** ที่อยู่จัดส่งที่สมาชิกบันทึก — กฎเดียวกับหน้าชำระเงิน (ชื่อ/เบอร์/ที่อยู่ต้องมี) */
export interface MemberAddressInput {
  label: string;
  name: string;
  phone: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postal: string;
  isDefault: boolean;
}

export function sanitizeAddress(raw: unknown): { ok: true; address: MemberAddressInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = clean(r.name, 120);
  const phone = String(r.phone ?? "").replace(/\D/g, "");
  const addressLine = clean(r.addressLine, 500);
  if (name.length < 2) return { ok: false, error: "กรุณากรอกชื่อผู้รับ" };
  if (phone.length < 9 || phone.length > 12) return { ok: false, error: "กรุณากรอกเบอร์โทรให้ถูกต้อง (9–10 หลัก)" };
  if (addressLine.length < 5) return { ok: false, error: "กรุณากรอกที่อยู่จัดส่ง" };
  return {
    ok: true,
    address: {
      label: clean(r.label, 40),
      name,
      phone,
      addressLine,
      subdistrict: clean(r.subdistrict, 80),
      district: clean(r.district, 80),
      province: clean(r.province, 80),
      postal: String(r.postal ?? "").replace(/\D/g, "").slice(0, 5),
      isDefault: r.isDefault === true,
    },
  };
}

export const addressToRow = (a: MemberAddressInput) => ({
  label: a.label,
  name: a.name,
  phone: a.phone,
  address_line: a.addressLine,
  subdistrict: a.subdistrict || null,
  district: a.district || null,
  province: a.province || null,
  postal: a.postal || null,
  is_default: a.isDefault,
});

export const addressFromRow = (r: Record<string, unknown>) => ({
  id: String(r.id),
  label: String(r.label ?? ""),
  name: String(r.name ?? ""),
  phone: String(r.phone ?? ""),
  addressLine: String(r.address_line ?? ""),
  subdistrict: String(r.subdistrict ?? ""),
  district: String(r.district ?? ""),
  province: String(r.province ?? ""),
  postal: String(r.postal ?? ""),
  isDefault: r.is_default === true,
});
export type MemberAddress = ReturnType<typeof addressFromRow>;

/** แก้โปรไฟล์ (ชื่อ/เบอร์/รับข่าวสาร) — อีเมลแก้ไม่ได้ (มาจากผู้ให้บริการที่ยืนยันแล้ว) */
export function sanitizeProfilePatch(raw: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (r.name !== undefined) {
    const name = clean(r.name, 120);
    if (name.length < 1) return { ok: false, error: "ชื่อว่างไม่ได้" };
    patch.name = name;
  }
  if (r.phone !== undefined) {
    const phone = String(r.phone ?? "").replace(/\D/g, "");
    if (phone && (phone.length < 9 || phone.length > 12)) return { ok: false, error: "เบอร์โทรไม่ถูกต้อง (9–10 หลัก)" };
    patch.phone = phone || null;
  }
  if (r.marketingOptIn !== undefined) patch.marketing_opt_in = r.marketingOptIn === true;
  return { ok: true, patch };
}
