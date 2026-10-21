// ============================================================
// Creative Reminders — แจ้งเตือน "ใกล้ถึงกำหนดส่ง / เกินกำหนด" (lazy sweep, ไม่ใช้ cron)
// เรียกตอนเปิดหน้า /tasks → หางานที่ครบ/ใกล้ครบกำหนด แล้วเตือนผู้รับผิดชอบ
// แบบ "สรุปวันละครั้ง": 1 คน × 1 ชนิด (เกินกำหนด / ใกล้กำหนด) = แจ้ง 1 ครั้งต่อวัน รวมทุกงานไว้ในข้อความเดียว
//   (เดิมแจ้งแยกทีละงาน ทุกวัน → คนละ ~30 ครั้ง/วัน ไม่มีใครเปิดอ่าน แจ้งเตือนสำคัญจมหาย)
// ไม่เตือน: งานที่จบแล้ว · งานที่ผ่านการตรวจแล้ว (รอแค่ปิดงาน ไม่ใช่งานที่ทำช้า) · คนที่ปิดบัญชีแล้ว (taskAssigneesMap กรองให้)
// "วันนี้" นับตามเวลาไทย (เดิมใช้เวลาสากล → 00:00–07:00 เพี้ยนไป 1 วัน)
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notify, taskAssigneesMap } from "@/lib/creative-tasks-server";
import { approvedStatusKeys, terminalStatusKeys } from "@/lib/creative-statuses-server";

type Admin = ReturnType<typeof supabaseAdmin>;
const BKK_OFFSET_MS = 7 * 3600 * 1000;
const bkkDate = (d: Date) => new Date(d.getTime() + BKK_OFFSET_MS).toISOString().slice(0, 10);
const MAX_LISTED = 3;   // ในข้อความสรุป โชว์ชื่องานกี่งาน ที่เหลือบอกเป็นจำนวน

export async function runDueReminders(admin: Admin): Promise<{ created: number }> {
  const now = new Date();
  const today = bkkDate(now);
  const soon = bkkDate(new Date(now.getTime() + 24 * 3600 * 1000)); // ภายในพรุ่งนี้
  const dayStart = new Date(`${today}T00:00:00+07:00`).toISOString();   // เที่ยงคืนเวลาไทย

  const [terminal, approved] = await Promise.all([terminalStatusKeys(admin), approvedStatusKeys(admin)]);
  const { data: tks } = await admin.from("erp_creative_tasks")
    .select("id, task_no, title, due_date, status").eq("is_active", true)
    .not("due_date", "is", null).lte("due_date", soon).order("due_date", { ascending: true }).limit(500);
  const tasks = ((tks ?? []) as { id: string; task_no: string | null; title: string; due_date: string; status: string }[])
    .filter((t) => !terminal.has(t.status) && !approved.has(t.status));
  if (!tasks.length) return { created: 0 };

  const aMap = await taskAssigneesMap(admin, tasks.map((t) => t.id));

  // รวมเป็นกลุ่ม: คน × ชนิด → รายการงาน (เรียงกำหนดส่งเก่าสุดก่อน)
  type Item = { taskId: string; head: string; due: string };
  const groups = new Map<string, { userId: string; type: "task_overdue" | "task_due_soon"; items: Item[] }>();
  for (const tk of tasks) {
    const type = tk.due_date < today ? "task_overdue" : "task_due_soon";
    const head = `${tk.task_no ? tk.task_no + " " : ""}${tk.title}`.trim();
    for (const p of aMap.get(tk.id) ?? []) {
      const k = `${p.id}|${type}`;
      const g = groups.get(k) ?? { userId: p.id, type, items: [] };
      g.items.push({ taskId: tk.id, head, due: tk.due_date });
      groups.set(k, g);
    }
  }
  if (!groups.size) return { created: 0 };

  // กันเตือนซ้ำ: วันนี้ (เวลาไทย) คนนี้เคยได้แจ้งชนิดนี้แล้ว → ข้าม
  const userIds = [...new Set([...groups.values()].map((g) => g.userId))];
  const { data: existing } = await admin.from("erp_notifications")
    .select("user_id, event_type")
    .in("user_id", userIds).in("event_type", ["task_due_soon", "task_overdue"])
    .gte("created_at", dayStart);
  const seen = new Set(((existing ?? []) as { user_id: string; event_type: string }[]).map((r) => `${r.user_id}|${r.event_type}`));

  const todo = [...groups.entries()].filter(([k]) => !seen.has(k)).map(([, g]) => g);
  await Promise.all(todo.map((g) => {
    const overdue = g.type === "task_overdue";
    const label = overdue ? "เกินกำหนด" : "ใกล้ถึงกำหนด";
    if (g.items.length === 1) {
      const it = g.items[0];
      return notify(admin, { userId: g.userId, eventType: g.type, priority: overdue ? "high" : "normal", title: `${label}: ${it.head}`, body: `กำหนดส่ง ${it.due}`, linkUrl: `/tasks?task=${it.taskId}`, entityId: it.taskId });
    }
    const listed = g.items.slice(0, MAX_LISTED).map((it) => it.head).join(" · ");
    const more = g.items.length > MAX_LISTED ? ` และอีก ${g.items.length - MAX_LISTED} งาน` : "";
    return notify(admin, { userId: g.userId, eventType: g.type, priority: overdue ? "high" : "normal", title: `งาน${label} ${g.items.length} งาน`, body: `${listed}${more}`, linkUrl: "/tasks", entityId: null });
  }));
  return { created: todo.length };
}
