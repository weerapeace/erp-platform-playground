// ============================================================
// Creative Reminders — แจ้งเตือน "ใกล้ถึงกำหนดส่ง / เกินกำหนด" (lazy sweep, ไม่ใช้ cron)
// เรียกตอนเปิดหน้า /tasks → หางานที่ครบ/ใกล้ครบกำหนด แล้วเตือนผู้รับผิดชอบทุกคน
// กันสแปม: เตือนซ้ำได้แค่วันละ 1 ครั้งต่อ (คน × งาน × ชนิด)
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notify, taskAssigneesMap } from "@/lib/creative-tasks-server";

type Admin = ReturnType<typeof supabaseAdmin>;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function runDueReminders(admin: Admin): Promise<{ created: number }> {
  const now = new Date();
  const today = iso(now);
  const soon = iso(new Date(now.getTime() + 24 * 3600 * 1000)); // ภายในพรุ่งนี้

  // สถานะที่ถือว่าจบแล้ว — ไม่ต้องเตือน
  const { data: terms } = await admin.from("erp_creative_statuses").select("key").eq("is_terminal", true);
  const terminal = new Set(((terms ?? []) as { key: string }[]).map((r) => r.key));

  const { data: tks } = await admin.from("erp_creative_tasks")
    .select("id, task_no, title, due_date, status").eq("is_active", true)
    .not("due_date", "is", null).lte("due_date", soon).limit(500);
  const tasks = ((tks ?? []) as { id: string; task_no: string | null; title: string; due_date: string; status: string }[])
    .filter((t) => !terminal.has(t.status));
  if (!tasks.length) return { created: 0 };

  const aMap = await taskAssigneesMap(admin, tasks.map((t) => t.id));

  type Cand = { userId: string; taskId: string; type: string; title: string; due: string };
  const cands: Cand[] = [];
  for (const tk of tasks) {
    const overdue = tk.due_date < today;
    const type = overdue ? "task_overdue" : "task_due_soon";
    const label = overdue ? "เกินกำหนด" : "ใกล้ถึงกำหนด";
    const head = `${tk.task_no ? tk.task_no + " " : ""}${tk.title}`.trim();
    for (const p of aMap.get(tk.id) ?? []) cands.push({ userId: p.id, taskId: tk.id, type, title: `${label}: ${head}`, due: tk.due_date });
  }
  if (!cands.length) return { created: 0 };

  // กันเตือนซ้ำ: ข้ามถ้าวันนี้เคยเตือน (คน+งาน+ชนิด) ไปแล้ว
  const userIds = [...new Set(cands.map((c) => c.userId))];
  const taskIds = [...new Set(cands.map((c) => c.taskId))];
  const { data: existing } = await admin.from("erp_notifications")
    .select("user_id, entity_id, event_type")
    .in("user_id", userIds).in("entity_id", taskIds).in("event_type", ["task_due_soon", "task_overdue"])
    .gte("created_at", `${today}T00:00:00Z`);
  const seen = new Set(((existing ?? []) as { user_id: string; entity_id: string; event_type: string }[]).map((r) => `${r.user_id}|${r.entity_id}|${r.event_type}`));

  let created = 0;
  for (const c of cands) {
    const key = `${c.userId}|${c.taskId}|${c.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await notify(admin, { userId: c.userId, eventType: c.type, priority: c.type === "task_overdue" ? "high" : "normal", title: c.title, body: `กำหนดส่ง ${c.due}`, linkUrl: `/tasks?task=${c.taskId}`, entityId: c.taskId });
    created++;
  }
  return { created };
}
