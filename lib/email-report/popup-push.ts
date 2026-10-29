/**
 * 🖥️ ป๊อปเตือนงาน → เด้งเป็นแจ้งเตือนของเบราว์เซอร์/มือถือ ตอนถึงเวลาป๊อป (เจ้าของขอ 2026-10-29)
 *
 * ตัวตั้งเวลา (/api/cron/email-reports · pg_cron ทุก 15 นาที) เรียก pushDuePopups:
 *  - ผู้รับ = คนที่มีเครื่องรับป๊อป (erp_push_subscriptions.event_filter เป็น null = ทุกเรื่อง หรือมี report.popup)
 *  - ต่อคน: activePopupsFor (อยู่ในช่วงเวลา · ยังไม่รับทราบวันนี้ · เป็นคนที่ควรเห็น) → วันนี้ยังไม่เคยแจ้งรายงานนี้
 *    → insert erp_notifications (event report.popup · ลิงก์ /apps?popup=<id>) → trigger ส่ง push เอง (lib/push-server)
 *  - วันละครั้งต่อคนต่อรายงาน · กดรับทราบในป๊อป = แจ้งเตือนนี้ถือว่าอ่านแล้ว (/api/popups/ack)
 * คนที่ไม่ได้เปิดรับบนเครื่องไหนเลย = ไม่สร้างอะไร (กระดิ่งไม่รก)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { activePopupsFor, type WorkPopupPayload } from "@/lib/email-report/popup";
import { nowTH } from "@/lib/email-report/send";

type Admin = ReturnType<typeof supabaseAdmin>;

export const POPUP_PUSH_EVENT = "report.popup";

/** หัวเรื่อง + ข้อความสั้นของแจ้งเตือน (มุมจอมีที่น้อย) */
export function popupPushText(p: Pick<WorkPopupPayload, "audience" | "heading" | "stats" | "mine">): { title: string; body: string } {
  const mineOpen = p.mine.reduce((n, m) => n + m.tasks.length, 0);
  if (p.audience === "mine") return { title: "🔔 งานที่รอคุณอยู่", body: `ของคุณ ${mineOpen} ข้อ · กดเพื่อดู` };
  const parts = [
    `ค้าง ${p.stats.total}`,
    p.stats.overdue ? `เกินกำหนด ${p.stats.overdue}` : null,
    p.stats.waiting ? `มีของรอ ${p.stats.waiting} ใบ` : null,
    mineOpen ? `ของคุณ ${mineOpen} ข้อ` : null,
  ].filter(Boolean);
  return { title: `🔔 ${p.heading}`, body: parts.join(" · ") };
}

export type PopupPushStats = { candidates: number; created: number };

export async function pushDuePopups(admin: Admin, now = new Date()): Promise<PopupPushStats> {
  const stats: PopupPushStats = { candidates: 0, created: 0 };
  const { data: subs, error } = await admin.from("erp_push_subscriptions").select("user_id, event_filter");
  if (error) throw new Error(error.message);
  const userIds = Array.from(new Set(((subs ?? []) as { user_id: string; event_filter: string[] | null }[])
    .filter((s) => !s.event_filter || s.event_filter.includes(POPUP_PUSH_EVENT))
    .map((s) => s.user_id)));
  stats.candidates = userIds.length;
  if (!userIds.length) return stats;

  // แจ้งไปแล้ววันนี้ (เวลาไทย)
  const { data: sent } = await admin.from("erp_notifications").select("user_id, entity_id")
    .eq("event_type", POPUP_PUSH_EVENT).gte("created_at", `${nowTH(now).date}T00:00:00+07:00`).in("user_id", userIds);
  const done = new Set(((sent ?? []) as { user_id: string; entity_id: string | null }[]).map((r) => `${r.user_id}:${r.entity_id}`));

  for (const uid of userIds) {
    let popups: WorkPopupPayload[] = [];
    try { popups = await activePopupsFor(admin, uid, { now }); }
    catch (e) { console.error("[popup-push] active", uid, e); continue; }   // คนหนึ่งพัง ไม่ให้คนอื่นหาย
    for (const p of popups) {
      if (done.has(`${uid}:${p.report_id}`)) continue;
      const { title, body } = popupPushText(p);
      const { error: insErr } = await admin.from("erp_notifications").insert({
        user_id: uid, event_type: POPUP_PUSH_EVENT, title: title.slice(0, 200), body,
        link_url: `/apps?popup=${p.report_id}`, entity_type: "email_report", entity_id: p.report_id, priority: "normal",
      });
      if (insErr) console.error("[popup-push] insert", uid, insErr.message);
      else stats.created++;
    }
  }
  return stats;
}
