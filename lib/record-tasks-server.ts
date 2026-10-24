/**
 * เช็กลิสต์กลาง — ฝั่งเซิร์ฟเวอร์ (API/อีเมล/Discord/ป๊อป)
 *   loadChecklistSummaries = สรุปของหลายเรคคอร์ดในครั้งเดียว (ไม่ยิงทีละใบ)
 *   userNames             = id ผู้ใช้ → ชื่อ (ผู้รับผิดชอบ)
 *   notifyAssignee        = กระดิ่งเด้งบอกผู้รับผิดชอบคนใหม่ (ไม่เด้งถ้ามอบให้ตัวเอง)
 *   loadChecklistPresets / findUserByName / createRecordTasks = เพิ่มข้อจากนอกหน้าเว็บ (Discord: ปุ่มพิมพ์เพิ่ม + เมนูค่าที่ใช้บ่อย)
 * doc: docs/record-tasks.md
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { linksOf, summarizeTasks, type ChecklistSummary } from "@/lib/record-tasks";
import type { RecordTask } from "@/app/api/record-tasks/route";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import { writeAudit } from "@/lib/audit";

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

/** แถวจากตาราง → ที่ส่งให้หน้าเว็บ (API รายการ/เพิ่ม/แก้) — metadata ไม่ส่งออกไปทั้งก้อน ส่งแค่ links */
export function toRecordTask(r: RecordTask & { metadata?: unknown }, names: Map<string, string>): RecordTask {
  const { metadata, ...rest } = r;
  return { ...rest, assigned_name: r.assigned_to ? names.get(r.assigned_to) ?? null : null, links: linksOf(metadata) };
}

/** record_id → สรุป (ไม่มีรายการเลย = ไม่มีใน Map) */
export async function loadChecklistSummaries(admin: Admin, moduleKey: string, recordIds: string[]): Promise<Map<string, ChecklistSummary>> {
  const out = new Map<string, ChecklistSummary>();
  const ids = [...new Set(recordIds)].filter(Boolean);
  if (!ids.length) return out;
  type Row = { id: string; record_id: string; title: string; status: string; assigned_to: string | null; metadata: unknown };
  const by = new Map<string, Row[]>();
  for (let i = 0; i < ids.length; i += 150) {   // .in() ยาวเกินจะชนเพดานความยาว URL
    const { data, error } = await admin.from("erp_record_tasks").select("id, record_id, title, status, assigned_to, metadata")
      .eq("module_key", moduleKey).in("record_id", ids.slice(i, i + 150))
      .order("created_at", { ascending: true }).limit(5000);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Row[]) {
      (by.get(r.record_id) ?? by.set(r.record_id, []).get(r.record_id)!).push(r);
    }
  }
  const names = await userNames(admin, [...by.values()].flat().map((t) => t.assigned_to));
  for (const [id, items] of by) out.set(id, summarizeTasks(items.map((t) => ({ ...t, assigned_name: t.assigned_to ? names.get(t.assigned_to) ?? null : null, links: linksOf(t.metadata) }))));
  return out;
}

// ---- แจ้งผู้รับผิดชอบ ----
/** ชนิดเช็กลิสต์ → ลิงก์เปิดเรคคอร์ด + ชื่อเรคคอร์ด (ใช้ในกระดิ่ง) — เช็กลิสต์ชนิดใหม่เพิ่มที่นี่ */
const TARGETS: Record<string, { entity: string; presetType: string | null; link: (id: string) => string; label: (admin: Admin, id: string) => Promise<string | null> }> = {
  [DESIGN_WAITING.moduleKey]: {
    entity: DESIGN_WAITING.recordType, presetType: DESIGN_WAITING.presetType,
    link: (id) => `/master/design-dashboard?open=${encodeURIComponent(id)}`,
    label: async (admin, id) => {
      const { data } = await admin.from("design_sheets").select("code, name").eq("id", id).maybeSingle();
      const d = data as { code: string; name: string } | null;
      return d ? `${d.code} ${d.name}` : null;
    },
  },
};
export const checklistRecordLink = (moduleKey: string, recordId: string) => TARGETS[moduleKey]?.link(recordId) ?? null;
/** เช็กลิสต์ชนิดนี้รู้จักไหม (เพิ่มจากนอกระบบ เช่น Discord ได้เฉพาะชนิดที่ลงทะเบียน) */
export const isKnownChecklist = (moduleKey: string) => !!TARGETS[moduleKey];

/** ค่าที่ใช้บ่อย (ค่ากลาง erp_lookups ชนิด presetType ของเช็กลิสต์นั้น) เรียงตาม sort_order — ไม่มี = [] */
export async function loadChecklistPresets(admin: Admin, moduleKey: string, limit = 25): Promise<string[]> {
  const type = TARGETS[moduleKey]?.presetType;
  if (!type) return [];
  const { data } = await admin.from("erp_lookups").select("name").eq("lookup_type", type).eq("is_active", true)
    .order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(limit);
  return [...new Set(((data ?? []) as { name: string | null }[]).map((r) => (r.name ?? "").trim()).filter(Boolean))];
}

/** หา "ผู้ใช้ที่ยังทำงานอยู่" จากชื่อที่พิมพ์ (ชื่อที่โชว์ / username / ชื่อหน้าอีเมล) — ตรงเป๊ะก่อน แล้วค่อยขึ้นต้น/มีคำนี้ (ต้องเจอคนเดียว) */
export async function findUserByName(admin: Admin, raw: string): Promise<{ id: string; name: string } | { error: string } | null> {
  const q = raw.trim().replace(/^@/, "").toLowerCase();
  if (!q) return null;
  const { data } = await admin.from("user_profiles").select("id, display_name, username, email, active").limit(1000);
  const users = ((data ?? []) as { id: string; display_name: string | null; username: string | null; email: string | null; active: boolean | null }[])
    .filter((u) => u.active !== false)
    .map((u) => ({ id: u.id, name: u.display_name || u.username || u.email || "ผู้ใช้", keys: [u.display_name, u.username, u.email?.split("@")[0]].filter(Boolean).map((s) => s!.toLowerCase()) }));
  for (const test of [(k: string) => k === q, (k: string) => k.startsWith(q), (k: string) => k.includes(q)]) {
    const hit = users.filter((u) => u.keys.some(test));
    if (hit.length === 1) return { id: hit[0].id, name: hit[0].name };
    if (hit.length > 1) return { error: `ชื่อ "${raw.trim()}" ตรงกับหลายคน (${hit.slice(0, 4).map((u) => u.name).join(", ")}) — พิมพ์ให้เจาะจงขึ้น` };
  }
  return { error: `ไม่พบผู้ใช้ชื่อ "${raw.trim()}" ในระบบ` };
}

/** เพิ่มข้อในเช็กลิสต์ (หลายข้อครั้งเดียว) + ประวัติ + แจ้งผู้รับผิดชอบ — ใช้จากนอกหน้าเว็บ (Discord) · หน้าเว็บใช้ POST /api/record-tasks */
export async function createRecordTasks(admin: Admin, p: { module_key: string; record_id: string; titles: string[]; assigned_to: string | null; actor: { id: string; name: string }; via?: string }) {
  const t = TARGETS[p.module_key];
  const titles = [...new Set(p.titles.map((s) => s.trim().slice(0, 300)).filter(Boolean))].slice(0, 10);
  if (!t || !titles.length) return [];
  const { data, error } = await admin.from("erp_record_tasks").insert(titles.map((title) => ({
    module_key: p.module_key, record_id: p.record_id, record_type: t.entity, title, status: "open", created_by: p.actor.name, assigned_to: p.assigned_to,
  }))).select("id, title, assigned_to");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; title: string; assigned_to: string | null }[];
  for (const r of rows) {
    await writeAudit(admin, { action: "create", entityType: "record_task", entityId: r.id, actorId: p.actor.id, actorName: `${p.actor.name}${p.via ? ` (${p.via})` : ""}`,
      metadata: { module_key: p.module_key, record_id: p.record_id, title: r.title, assigned_to: r.assigned_to, ...(p.via ? { via: p.via.toLowerCase() } : {}) } });
    await notifyAssignee(admin, { module_key: p.module_key, record_id: p.record_id, title: r.title, assigned_to: r.assigned_to }, p.actor);
  }
  return rows;
}

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
