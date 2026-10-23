/**
 * เช็กลิสต์กลาง — ฝั่งเซิร์ฟเวอร์ (API/อีเมล): สรุปเช็กลิสต์ของหลายเรคคอร์ดในครั้งเดียว (ไม่ยิงทีละใบ)
 * doc: docs/record-tasks.md
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { summarizeTasks, type ChecklistSummary } from "@/lib/record-tasks";

type Admin = ReturnType<typeof supabaseAdmin>;

/** record_id → สรุป (ไม่มีรายการเลย = ไม่มีใน Map) */
export async function loadChecklistSummaries(admin: Admin, moduleKey: string, recordIds: string[]): Promise<Map<string, ChecklistSummary>> {
  const out = new Map<string, ChecklistSummary>();
  const ids = [...new Set(recordIds)].filter(Boolean);
  if (!ids.length) return out;
  const by = new Map<string, { title: string; status: string }[]>();
  for (let i = 0; i < ids.length; i += 150) {   // .in() ยาวเกินจะชนเพดานความยาว URL
    const { data, error } = await admin.from("erp_record_tasks").select("record_id, title, status")
      .eq("module_key", moduleKey).in("record_id", ids.slice(i, i + 150))
      .order("created_at", { ascending: true }).limit(5000);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { record_id: string; title: string; status: string }[]) {
      (by.get(r.record_id) ?? by.set(r.record_id, []).get(r.record_id)!).push(r);
    }
  }
  for (const [id, items] of by) out.set(id, summarizeTasks(items));
  return out;
}
