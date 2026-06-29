// ============================================================
// Creative Recurring — สร้างงานจากกฎงานประจำ (lazy generate, ไม่ใช้ cron)
// เรียกตอนเปิดหน้า/กดปุ่ม: หา rule ที่ next_run <= วันนี้ → สร้างงานจากเทมเพลต → เลื่อน next_run
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { nextTaskNo, nextContentNo, setSubtaskAssignees } from "@/lib/creative-tasks-server";

type Admin = ReturnType<typeof supabaseAdmin>;

export type RecurringRule = {
  id: string; name: string; template_id: string | null;
  frequency: string; interval_n: number; assignee_id: string | null;
  brand_id: string | null; campaign_id: string | null;
  start_date: string; end_date: string | null; next_run: string | null; last_run: string | null;
  created_by: string | null;
  // section งาน — ตั้งบนกฎ (ทับค่าจากเทมเพลต)
  description?: string | null; task_type?: string | null; priority?: string | null; platforms?: string[] | null; due_day?: number | null;
};
export type TemplateStepDef = { title: string; description?: string | null; required_before_next?: boolean; assignee_ids?: string[] };
export type TemplateContentDef = { title: string; post_type?: string | null; platforms?: string[]; assignee_id?: string | null };
export type Template = {
  id: string; task_type: string | null; default_priority: string; brand_id: string | null;
  default_reviewer_id?: string | null;
  platforms: string[] | null; steps: TemplateStepDef[] | null; content_items?: TemplateContentDef[] | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());

function addMonths(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 0)).getUTCDate();
  nd.setUTCDate(Math.min(day, last));
  return nd;
}

/** กำหนดส่ง = วันที่ `day` ของเดือนเดียวกับวันถึงรอบ (เกินสิ้นเดือน → ปัดเป็นวันสุดท้าย) */
function withDayOfMonth(dateStr: string, day: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(Math.max(1, day), last));
  return iso(d);
}

/** เลื่อนวันถัดไปตามความถี่ */
export function advance(dateStr: string, frequency: string, interval: number): string {
  const n = Math.max(1, interval || 1);
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (frequency === "daily") { d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  if (frequency === "weekly") { d.setUTCDate(d.getUTCDate() + 7 * n); return iso(d); }
  return iso(addMonths(d, n)); // monthly
}

async function createTaskFromRule(admin: Admin, rule: RecurringRule, tpl: Template | null, runDate: string): Promise<string | null> {
  const taskNo = await nextTaskNo(admin);
  // ค่าจากกฎมาก่อน (section งาน) ถ้าไม่ตั้งค่อย fallback ไปเทมเพลต
  const dueDate = rule.due_day ? withDayOfMonth(runDate, rule.due_day) : runDate;
  const { data, error } = await admin.from("erp_creative_tasks").insert({
    task_no: taskNo, title: `${rule.name} — ${runDate}`, task_type: rule.task_type ?? tpl?.task_type ?? null,
    description: rule.description ?? null,
    brand_id: rule.brand_id ?? tpl?.brand_id ?? null, campaign_id: rule.campaign_id ?? null,
    priority: rule.priority ?? tpl?.default_priority ?? "normal", status: "backlog", progress_percent: 0,
    assignee_id: rule.assignee_id ?? null, reviewer_id: tpl?.default_reviewer_id ?? null, due_date: dueDate,
    platforms: (rule.platforms && rule.platforms.length) ? rule.platforms : (tpl?.platforms ?? []),
    created_by: rule.created_by ?? null,
  }).select("id").single();
  if (error || !data) return null;
  const steps = (Array.isArray(tpl?.steps) ? tpl!.steps! : []).filter((s) => s?.title);
  if (steps.length) {
    const { data: subs } = await admin.from("erp_creative_subtasks")
      .insert(steps.map((s, i) => ({ task_id: data.id, title: s.title, description: s.description ?? null, assignee_id: s.assignee_ids?.[0] ?? null, required_before_next: !!s.required_before_next, sort_order: i })))
      .select("id");
    const subIds = (subs ?? []) as { id: string }[];
    for (let i = 0; i < subIds.length; i++) {
      const ids = steps[i]?.assignee_ids;
      if (Array.isArray(ids) && ids.length) await setSubtaskAssignees(admin, subIds[i].id, ids);
    }
  }
  // คอนเทนต์พ่วงจากแม่แบบ → สร้างผูกกับงานที่ระบบสร้าง
  const contentItems = (Array.isArray(tpl?.content_items) ? tpl!.content_items! : []).filter((c) => c?.title);
  for (const ci of contentItems) {
    let cno = await nextContentNo(admin);
    const crow = { content_no: cno, title: ci.title, task_id: data.id, brand_id: rule.brand_id ?? tpl?.brand_id ?? null, post_type: ci.post_type ?? null, platforms: ci.platforms ?? [], assignee_id: ci.assignee_id ?? null, status: "draft", created_by: rule.created_by ?? null };
    let { error: cErr } = await admin.from("erp_creative_content").insert(crow);
    if (cErr && /duplicate|unique/i.test(cErr.message)) { cno = await nextContentNo(admin); ({ error: cErr } = await admin.from("erp_creative_content").insert({ ...crow, content_no: cno })); }
  }
  await writeAudit(admin, { action: "recurring:generate", entityType: "creative_task", entityId: data.id, actorId: rule.created_by ?? null, actorName: null, metadata: { rule: rule.id, due: dueDate } });
  return data.id;
}

/** รัน 1 กฎ: สร้างงานที่ถึงรอบทั้งหมด (cap 60 รอบกัน runaway) แล้วเลื่อน next_run */
export async function runRule(admin: Admin, rule: RecurringRule, tpl: Template | null, upTo?: string): Promise<{ created: number; ids: string[] }> {
  const limitDate = upTo ?? today();
  let next = rule.next_run ?? rule.start_date;
  let last = rule.last_run ?? null;
  const ids: string[] = [];
  let guard = 0;
  while (next && next <= limitDate && (!rule.end_date || next <= rule.end_date) && guard < 60) {
    const id = await createTaskFromRule(admin, rule, tpl, next);
    if (id) ids.push(id);
    last = next;
    next = advance(next, rule.frequency, rule.interval_n);
    guard++;
  }
  await admin.from("erp_creative_recurring").update({ next_run: next, last_run: last, updated_at: new Date().toISOString() }).eq("id", rule.id);
  return { created: ids.length, ids };
}

/** รันทุกกฎที่ active และถึงรอบ → คืนจำนวนงานที่สร้าง */
export async function runAllDue(admin: Admin): Promise<{ created: number; rules: number }> {
  const t = today();
  const { data: rules } = await admin.from("erp_creative_recurring").select("*").eq("is_active", true).lte("next_run", t);
  const list = (rules ?? []) as RecurringRule[];
  if (list.length === 0) return { created: 0, rules: 0 };
  const tplIds = [...new Set(list.map((r) => r.template_id).filter(Boolean))] as string[];
  const tplMap = new Map<string, Template>();
  if (tplIds.length) {
    const { data: tpls } = await admin.from("erp_creative_task_templates").select("id, task_type, default_priority, brand_id, default_reviewer_id, platforms, steps, content_items").in("id", tplIds);
    for (const tp of (tpls ?? []) as Template[]) tplMap.set(tp.id, tp);
  }
  let created = 0;
  for (const r of list) { const res = await runRule(admin, r, r.template_id ? tplMap.get(r.template_id) ?? null : null); created += res.created; }
  return { created, rules: list.length };
}
