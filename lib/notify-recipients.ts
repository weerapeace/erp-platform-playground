/**
 * คนรับกระดิ่งของเรื่องที่ "โค้ดสร้างข้อความเอง" (เช่น ตัวตั้งเวลาทุกเช้า) แต่ให้แอดมินเลือกคนรับ/เปิดปิดได้จากกฎแจ้งเตือน
 *
 *   const r = await ruleRecipients(admin, "cashflow.low_cash");
 *   if (r.source === "off") → ไม่ส่ง (ปิดกฎไว้) · ไม่งั้นส่ง erp_notify ถึง r.ids
 *
 * อ่านจาก erp_notification_rules (event_type เดียวกับที่ส่ง) — แก้ได้ที่แท็บแจ้งเตือนของแผนผัง (/master/flow-map) หรือหน้า /admin/notification-rules
 *   คนรับแบบ role (ทุกคนที่ active ใน role นั้น) + user (รายคน · ต้อง active) — แบบอื่น (ผู้ขอ / ผู้อนุมัติ / ถูกแท็ก) ใช้กับเอกสาร ไม่ใช้ที่นี่
 *   กันเงียบ: ไม่มีกฎ / กฎเปิดแต่หาคนรับไม่เจอ → ส่งหาแอดมินทุกคนแทน (fallback) · ปิดทุกกฎของเรื่องนี้ = "off" ไม่ส่ง
 * ⚠️ server เท่านั้น (ใช้ supabaseAdmin)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export type RuleRecipient = { type: string; value?: string };
export type RuleRecipientsResult = { ids: string[]; source: "rule" | "fallback" | "off" };

/** แยกคนรับจากกฎ (pure — เทสต์ได้) → role ที่ต้องหา + user id รายคน */
export function splitRuleRecipients(rules: { recipients: unknown; active: boolean }[]): { roles: string[]; users: string[]; anyActive: boolean } {
  const roles = new Set<string>(), users = new Set<string>();
  const live = rules.filter((r) => r.active);
  for (const r of live) {
    const list = Array.isArray(r.recipients) ? (r.recipients as RuleRecipient[]) : [];
    for (const x of list) {
      const v = String(x?.value ?? "").trim();
      if (!v) continue;
      if (x.type === "role") roles.add(v);
      else if (x.type === "user") users.add(v);
    }
  }
  return { roles: [...roles], users: [...users], anyActive: live.length > 0 };
}

async function activeAdmins(admin: Admin): Promise<string[]> {
  const { data } = await admin.from("user_profiles").select("id").eq("role", "admin").eq("active", true);
  return ((data ?? []) as { id: string }[]).map((a) => a.id);
}

export async function ruleRecipients(admin: Admin, eventType: string): Promise<RuleRecipientsResult> {
  const { data: rules, error } = await admin.from("erp_notification_rules").select("recipients, active").eq("event_type", eventType);
  if (error || !rules?.length) return { ids: await activeAdmins(admin), source: "fallback" };
  const { roles, users, anyActive } = splitRuleRecipients(rules as { recipients: unknown; active: boolean }[]);
  if (!anyActive) return { ids: [], source: "off" };

  const ids = new Set<string>();
  if (roles.length) {
    const { data } = await admin.from("user_profiles").select("id").in("role", roles).eq("active", true);
    for (const u of (data ?? []) as { id: string }[]) ids.add(u.id);
  }
  if (users.length) {
    const { data } = await admin.from("user_profiles").select("id").in("id", users).eq("active", true);
    for (const u of (data ?? []) as { id: string }[]) ids.add(u.id);
  }
  if (!ids.size) return { ids: await activeAdmins(admin), source: "fallback" };
  return { ids: [...ids], source: "rule" };
}
