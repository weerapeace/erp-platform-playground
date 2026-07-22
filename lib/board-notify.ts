/**
 * แจ้งเตือนบอร์ดจ่ายงาน + โกดัง QC (ของกลาง) — 2 ช่องทาง:
 *   • กระดิ่งในระบบ: erp_notify_for_event (ขับด้วยกฎ erp_notification_rules → เด้งหา role ที่ตั้งไว้)
 *   • LINE: ส่งเข้ากลุ่มตาม slot (line_config.groups[slot]) + DM ช่างรายคน (employees.line_user_id)
 * ทุกฟังก์ชัน best-effort — LINE/แจ้งเตือนล้มเหลว "ไม่กระทบ" การบันทึกงานหลัก
 * reuse: china_app_settings.line_config (token/groups/templates) + RPC erp_notify_for_event
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
type LineCfg = { token?: string; group_id?: string; groups?: Record<string, string>; templates?: Record<string, string> };

const appBase = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
export const boardLink = (path: string): string => `${appBase()}${path}`;

// แทนตัวแปร {key} ด้วย vars[key] (ว่าง = ลบทิ้ง) — array→join, ตัดบรรทัดว่างซ้อน
function render(tpl: string, vars: Record<string, unknown>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k) => { const v = vars[k]; return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v); })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// แม่แบบข้อความ LINE ต่อเหตุการณ์ (แก้เองได้ที่ line_config.templates[eventKey])
const DEFAULT_TPL: Record<string, string> = {
  wo_dispatched: "📤 จ่ายงานใหม่ · {sku}\n{product_name}\n👷 {worker} · 🪑 {dept} · {qty} ชิ้น\n📅 กำหนด {due}\n🔗 {link}",
  qc_pending: "📥 มีงานรอ QC · {sku}\n{product_name}\n👷 {worker} · {qty} ชิ้น\n🔗 {link}",
  qc_defect: "⚠️ พบของเสีย · {sku}\n{product_name}\n❌ {reason} · {qty} ชิ้น · 👷 {worker}\n🔗 {link}",
  wo_due_soon: "⏰ งานใกล้/เกินกำหนด · {sku}\n🪑 {dept} · เหลือส่ง {remaining} ชิ้น\n📅 {due} ({due_text})\n🔗 {link}",
};

async function lineCfg(admin: Admin): Promise<LineCfg> {
  const { data } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
  return ((data as { sval?: LineCfg } | null)?.sval ?? {}) as LineCfg;
}
async function linePush(token: string, to: string, text: string): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
}

/** ส่งเข้ากลุ่ม LINE ตาม slot (production/qc) + แม่แบบต่อเหตุการณ์
 *  ⚠️ ส่งเฉพาะเมื่อ "ตั้งกลุ่มของ slot นั้น" แล้ว (ไม่ fallback ไปกลุ่มหลัก — กันส่งผิดกลุ่ม) */
export async function pushLineTpl(admin: Admin, slot: string, eventKey: string, vars: Record<string, unknown>): Promise<void> {
  try {
    const cfg = await lineCfg(admin);
    const target = cfg.groups?.[slot] || "";
    if (!cfg.token || !target) return;
    const tplRaw = (cfg.templates?.[eventKey] && cfg.templates[eventKey].trim()) || DEFAULT_TPL[eventKey] || "";
    const text = render(tplRaw, vars);
    if (!text) return;
    await linePush(cfg.token, target, text);
  } catch { /* เงียบ — LINE ล้มไม่กระทบการบันทึก */ }
}

/** ส่งข้อความ LINE เข้า "กลุ่มแรกที่ตั้งค่าไว้" ตามลำดับ groupKeys (เช่น ['goods_receipt','purchase_request'])
 *  ใช้กับเหตุการณ์จัดซื้อ (ออก PO / รับของ) — ถ้ายังไม่ตั้งกลุ่มเฉพาะ จะ fallback ไปกลุ่มขอซื้อที่มีอยู่ */
export async function pushLineText(admin: Admin, groupKeys: string[], text: string): Promise<void> {
  try {
    const cfg = await lineCfg(admin);
    if (!cfg.token || !text.trim()) return;
    let target = "";
    for (const k of groupKeys) { const g = cfg.groups?.[k]; if (g) { target = g; break; } }
    if (!target) return;
    await linePush(cfg.token, target, text);
  } catch { /* เงียบ — LINE ล้มไม่กระทบการบันทึก */ }
}

/** DM ช่างรายคน ผ่าน employees.id → line_user_id */
export async function dmEmployeeById(admin: Admin, employeeId: string | null | undefined, text: string): Promise<void> {
  if (!employeeId) return;
  try {
    const cfg = await lineCfg(admin); if (!cfg.token) return;
    const { data: emp } = await admin.from("employees").select("line_user_id").eq("id", employeeId).maybeSingle();
    const uid = (emp as { line_user_id?: string | null } | null)?.line_user_id;
    if (uid) await linePush(cfg.token, uid, text);
  } catch { /* เงียบ */ }
}

/** DM ช่างรายคน แบบจับชื่อ (best-effort ชื่อเล่น/ชื่อจริง) — ใช้เมื่อมีแต่ชื่อ (เช่นงานเสียใน QC) */
export async function dmEmployeeByName(admin: Admin, name: string | null | undefined, text: string): Promise<void> {
  const nm = (name ?? "").trim(); if (!nm) return;
  try {
    const cfg = await lineCfg(admin); if (!cfg.token) return;
    const { data: emps } = await admin.from("employees").select("line_user_id, nickname, first_name_th, last_name_th").not("line_user_id", "is", null);
    const hit = (emps ?? []).find((e: Record<string, unknown>) => {
      const nick = String(e.nickname ?? "").trim();
      const full = `${e.first_name_th ?? ""} ${e.last_name_th ?? ""}`.trim();
      return (nick && (nick === nm || nm.startsWith(nick))) || (full && (full === nm || full.startsWith(nm)));
    }) as { line_user_id?: string | null } | undefined;
    if (hit?.line_user_id) await linePush(cfg.token, hit.line_user_id, text);
  } catch { /* เงียบ */ }
}

/** เด้งกระดิ่งในระบบตามกฎ (erp_notification_rules) — ctx = ตัวแปรสำหรับ {{var}} ในแม่แบบกฎ */
export async function notifyEvent(admin: Admin, eventType: string, entityType: string, entityId: string | null, actorId: string | null, ctx: Record<string, unknown>): Promise<void> {
  try {
    await admin.rpc("erp_notify_for_event", { p_event_type: eventType, p_entity_type: entityType, p_entity_id: entityId, p_actor_id: actorId, p_ctx: ctx });
  } catch { /* เงียบ — แจ้งเตือนล้มไม่กระทบการบันทึก */ }
}
