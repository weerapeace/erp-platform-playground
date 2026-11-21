/**
 * ตัวแยกคน (ของกลาง · server เท่านั้น) — "คนไลน์คนนี้เป็นใครในระบบ"
 *
 * ใช้กับไลน์บริษัท (lib/line-company-server) และงานในอนาคตที่ต้องรู้ว่าใครทักมา ก่อนให้ดูข้อมูลส่วนตัว
 *   0) แอดมิน   = บัญชี ERP ที่ผูกไลน์นี้ (user_profiles.line_user_id · ผูกด้วยการล็อกอิน ERP — /api/account/line-link)
 *                 ที่ยังใช้งาน + มีสิทธิ์ admin.users · เช็กสิทธิ์สดทุกครั้ง (erp_can_user) → ถอนสิทธิ์ใน ERP = หมดทันทีที่กดครั้งถัดไป
 *   1) พนักงาน  = line_memberships (status linked) — ผูกด้วยบัตร QR / รหัส+เบอร์ (lib/line-employee-portal-db)
 *                 hrConfirmed = HR ยืนยันตัวตนแล้ว (ผูกด้วยรหัส+เบอร์ต้องยืนยันก่อนให้ดูเงินเดือน/ใบเตือน)
 *   2) ลูกค้า   = line_customer_links (status linked) — ร้านเดียวผูกได้หลายคน (ลิงก์เชิญรายร้าน · เฟส 4)
 *   3) ถูกระงับ = สถานะ blocked ในตารางใดตารางหนึ่ง → ไม่ให้ดูข้อมูลอะไร (เมนูกลาง)
 *   4) ไม่รู้จัก = ไม่อยู่ในตารางไหนเลย → เมนูกลาง + แชทเข้าห้องแชทรวม /chat ตามเดิม
 * ลำดับ: แอดมิน → พนักงาน → ลูกค้า (คนเดียวกันเป็นหลายแบบ = ถือแบบที่มาก่อน)
 *
 * ⚠️ ห้ามเชื่อ userId จากแชตอย่างเดียวเพื่อโชว์ตัวเงิน — userId จาก webhook ที่ลายเซ็นถูกต้องใช้ตอบสรุปสั้นได้
 *    แต่หน้าเล็ก (LIFF) ที่โชว์ตัวเงินต้องตรวจ ID token ใหม่ทุกครั้ง (verifyLineIdToken)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { CompanyWho } from "@/lib/line-company";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

export type LineIdentity =
  | { who: "admin"; lineUserId: string; userId: string; name: string }
  | { who: "employee"; lineUserId: string; employeeId: string; employeeCode: string; name: string; membershipId: string; hrConfirmed: boolean }
  | { who: "customer"; lineUserId: string; partnerId: string; partnerName: string; linkId: string; contactName: string }
  | { who: "blocked"; lineUserId: string; side: "employee" | "customer" }
  | { who: "unknown"; lineUserId: string };

/** สิทธิ์ที่ทำให้เห็นเมนูแอดมิน (เจ้าของเลือก 2026-11-21: คนที่มีสิทธิ์แอดมินใน ERP อยู่แล้ว) */
export const LINE_ADMIN_PERMISSION = "admin.users";

const t = (v: unknown) => String(v ?? "").trim();
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);

/** ชื่อเรียกพนักงาน: ชื่อเล่นก่อน ไม่มีก็ชื่อจริง */
const employeeCallName = (e: Row | null) => t(e?.nickname) || t(e?.first_name) || t(e?.employee_code);

async function canAdmin(admin: Admin, userId: string): Promise<boolean> {
  const r = await admin.rpc("erp_can_user", { p_user: userId, p_permission: LINE_ADMIN_PERMISSION });
  if (r.error) throw new Error(`erp_can_user: ${r.error.message}`);
  return r.data === true;
}

/** อ่านไม่ได้ (ฐานข้อมูลล่ม) = โยน error — ผู้เรียกต้องไม่เดาว่าเป็น "ไม่รู้จัก" แล้วเปิดข้อมูลผิดคน */
export async function resolveLineIdentity(admin: Admin, lineUserId: string): Promise<LineIdentity> {
  const [usr, emp, cus] = await Promise.all([
    admin.from("user_profiles").select("id,display_name,username")
      .eq("line_user_id", lineUserId).eq("active", true).limit(1),
    admin.from("line_memberships")
      .select("id,status,employee_id,hr_confirmed_at,employees(employee_code,first_name,nickname,employment_status)")
      .eq("line_user_id", lineUserId).in("status", ["linked", "blocked"]).limit(1),
    admin.from("line_customer_links")
      .select("id,status,partner_id,contact_name,partners_v2(display_name,code,is_active)")
      .eq("line_user_id", lineUserId).in("status", ["linked", "blocked"]).limit(1),
  ]);
  if (usr.error) throw new Error(`user_profiles: ${usr.error.message}`);
  if (emp.error) throw new Error(`line_memberships: ${emp.error.message}`);
  if (cus.error) throw new Error(`line_customer_links: ${cus.error.message}`);

  const u = (usr.data?.[0] ?? null) as Row | null;
  if (u && (await canAdmin(admin, t(u.id)))) {
    return { who: "admin", lineUserId, userId: t(u.id), name: t(u.display_name) || t(u.username) };
  }

  const m = (emp.data?.[0] ?? null) as Row | null;
  if (m) {
    const e = one(m.employees);
    // ลาออกแล้ว = ไม่ให้เห็นเมนูพนักงาน (แม้ HR ยังไม่ได้ปลดผูก)
    if (t(m.status) === "blocked" || t(e?.employment_status) !== "active") return { who: "blocked", lineUserId, side: "employee" };
    return { who: "employee", lineUserId, employeeId: t(m.employee_id), employeeCode: t(e?.employee_code), name: employeeCallName(e), membershipId: t(m.id), hrConfirmed: !!m.hr_confirmed_at };
  }
  const c = (cus.data?.[0] ?? null) as Row | null;
  if (c) {
    const p = one(c.partners_v2);
    if (t(c.status) === "blocked" || p?.is_active === false) return { who: "blocked", lineUserId, side: "customer" };
    return { who: "customer", lineUserId, partnerId: t(c.partner_id), partnerName: t(p?.display_name) || t(p?.code), linkId: t(c.id), contactName: t(c.contact_name) };
  }
  return { who: "unknown", lineUserId };
}

export const identityWho = (id: LineIdentity): CompanyWho => id.who;

/** ชื่อที่บอทใช้เรียก */
export function identityCallName(id: LineIdentity): string | null {
  if (id.who === "admin" || id.who === "employee") return id.name || null;
  if (id.who === "customer") return id.contactName || id.partnerName || null;
  return null;
}

/** คนไลน์ทุกคนที่ผูกอยู่ แยกตามเมนูที่ควรเห็น (ใช้ตอนสร้างเมนูใหม่ → ผูกเมนูให้ทุกคนในครั้งเดียว) */
export async function listLinkedLineUsers(admin: Admin): Promise<{ admins: string[]; employees: string[]; customers: string[] }> {
  const [usr, emp, cus] = await Promise.all([
    admin.from("user_profiles").select("id,line_user_id").eq("active", true).not("line_user_id", "is", null).limit(1000),
    admin.from("line_memberships").select("line_user_id,employees(employment_status)").eq("status", "linked").limit(5000),
    admin.from("line_customer_links").select("line_user_id,partners_v2(is_active)").eq("status", "linked").limit(5000),
  ]);
  if (usr.error) throw new Error(usr.error.message);
  if (emp.error) throw new Error(emp.error.message);
  if (cus.error) throw new Error(cus.error.message);
  const admins: string[] = [];
  for (const r of (usr.data ?? []) as Row[]) {
    const lid = t(r.line_user_id);
    if (lid && (await canAdmin(admin, t(r.id)))) admins.push(lid);
  }
  const taken = new Set(admins);
  const employees = ((emp.data ?? []) as Row[]).filter((r) => t(one(r.employees)?.employment_status) === "active").map((r) => t(r.line_user_id)).filter((x) => x && !taken.has(x));
  for (const x of employees) taken.add(x);
  const customers = ((cus.data ?? []) as Row[]).filter((r) => one(r.partners_v2)?.is_active !== false).map((r) => t(r.line_user_id)).filter((x) => x && !taken.has(x));
  return { admins, employees, customers };
}
