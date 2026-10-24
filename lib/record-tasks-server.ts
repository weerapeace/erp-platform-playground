/**
 * เช็กลิสต์กลาง — ฝั่งเซิร์ฟเวอร์ (API/อีเมล/Discord/ป๊อป)
 *   loadChecklistSummaries = สรุปของหลายเรคคอร์ดในครั้งเดียว (ไม่ยิงทีละใบ)
 *   userNames             = id ผู้ใช้ → ชื่อ (ผู้รับผิดชอบ)
 *   notifyAssignee        = กระดิ่งเด้งบอกผู้รับผิดชอบคนใหม่ (ไม่เด้งถ้ามอบให้ตัวเอง)
 * doc: docs/record-tasks.md
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { summarizeTasks, type ChecklistSummary } from "@/lib/record-tasks";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";

type Admin = ReturnType<typeof supabaseAdmin>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** id ผู้ใช้ → ชื่อที่โชว์ (display_name → username → email) */
export async function userNames(admin: Admin, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(isUuid))];
  if (!uniq.length) return out;
  const { data } = await admin.from("user_profiles").select("id, display_name, username, email").in("id", uniq);
  for (const u of (data ?? []) as { id: string; display_name: string | null; username: string | null; email: string | null }[]) {
    out.set(u.id, u.display_name || u.username || u.email || "ผู้ใช้");
  }
  return out;
}

/** record_id → สรุป (ไม่มีรายการเลย = ไม่มีใน Map) */
export async function loadChecklistSummaries(admin: Admin, moduleKey: string, recordIds: string[]): Promise<Map<string, ChecklistSummary>> {
  const out = new Map<string, ChecklistSummary>();
  const ids = [...new Set(recordIds)].filter(Boolean);
  if (!ids.length) return out;
  const by = new Map<string, { id: string; title: string; status: string; assigned_to: string | null }[]>();
  for (let i = 0; i < ids.length; i += 150) {   // .in() ยาวเกินจะชนเพดานความยาว URL
    const { data, error } = await admin.from("erp_record_tasks").select("id, record_id, title, status, assigned_to")
      .eq("module_key", moduleKey).in("record_id", ids.slice(i, i + 150))
      .order("created_at", { ascending: true }).limit(5000);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; record_id: string; title: string; status: string; assigned_to: string | null }[]) {
      (by.get(r.record_id) ?? by.set(r.record_id, []).get(r.record_id)!).push(r);
    }
  }
  const names = await userNames(admin, [...by.values()].flat().map((t) => t.assigned_to));
  for (const [id, items] of by) out.set(id, summarizeTasks(items.map((t) => ({ ...t, assigned_name: t.assigned_to ? names.get(t.assigned_to) ?? null : null }))));
  return out;
}

// ---- แจ้งผู้รับผิดชอบ ----
/** ชนิดเช็กลิสต์ → ลิงก์เปิดเรคคอร์ด + ชื่อเรคคอร์ด (ใช้ในกระดิ่ง) — เช็กลิสต์ชนิดใหม่เพิ่มที่นี่ */
const TARGETS: Record<string, { entity: string; link: (id: string) => string; label: (admin: Admin, id: string) => Promise<string | null> }> = {
  [DESIGN_WAITING.moduleKey]: {
    entity: "design_sheet",
    link: (id) => `/master/design-dashboard?open=${encodeURIComponent(id)}`,
    label: async (admin, id) => {
      const { data } = await admin.from("design_sheets").select("code, name").eq("id", id).maybeSingle();
      const d = data as { code: string; name: string } | null;
      return d ? `${d.code} ${d.name}` : null;
    },
  },
};
export const checklistRecordLink = (moduleKey: string, recordId: string) => TARGETS[moduleKey]?.link(recordId) ?? null;

export async function notifyAssignee(admin: Admin, task: { module_key: string; record_id: string; title: string; assigned_to: string | null }, actor: { id: string | null; name: string | null }) {
  if (!isUuid(task.assigned_to) || task.assigned_to === actor.id) return;
  try {
    const t = TARGETS[task.module_key];
    const label = t ? await t.label(admin, task.record_id).catch(() => null) : null;
    await admin.rpc("erp_notify", {
      p_user_ids: [task.assigned_to], p_event_type: "checklist.assigned",
      p_title: `มีงานรอคุณ: ${task.title}`.slice(0, 200),
      p_body: `${label ? `${label} · ` : ""}มอบโดย ${actor.name || "ผู้ใช้"}`,
      p_link_url: t?.link(task.record_id) ?? null, p_entity_type: t?.entity ?? task.module_key,
      p_entity_id: isUuid(task.record_id) ? task.record_id : null, p_priority: "normal",
    });
  } catch (e) { console.error("[record-tasks] notify assignee", e); }   // แจ้งไม่ได้ ไม่ทำให้บันทึกพลาด
}
