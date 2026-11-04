/**
 * จดผลรอบล่าสุดของงานตั้งเวลา ให้หน้า "ออฟฟิศทีม AI" (/master/ai-office) รู้ว่าทำงานหรือล้ม
 * เก็บใน ui_config key `ai_office_run:<id>` แถวเดียวต่อผู้ช่วย (ไม่สร้างแถวใหม่ทุกรอบ ไม่ต้องมีตารางใหม่)
 * ไม่ throw เด็ดขาด — จดไม่สำเร็จต้องไม่ทำให้งานหลักล้ม · ฝั่ง server เท่านั้น
 * ใช้ใน app/api/cron/* (ตัวที่อยู่ใน vercel.json) · ทะเบียน id อยู่ที่ lib/ai-office.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { workerRunKey, type WorkerRun } from "@/lib/ai-office";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function recordWorkerRun(admin: Admin, id: string, r: { ok: boolean; summary?: string; error?: string; warn?: boolean }): Promise<void> {
  try {
    const key = workerRunKey(id);
    const { data } = await admin.from("ui_config").select("value").eq("key", key).maybeSingle();
    const prev = ((data as { value?: WorkerRun } | null)?.value ?? null) as WorkerRun | null;
    const at = new Date().toISOString();
    const value: WorkerRun = {
      at,
      ok: r.ok,
      ...(r.summary ? { summary: r.summary.slice(0, 200) } : {}),
      ...(r.error ? { error: r.error.slice(0, 300) } : {}),
      ...(r.warn ? { warn: true } : {}),
      last_ok_at: r.ok ? at : prev?.last_ok_at ?? null,
      fails: r.ok ? 0 : (prev?.fails ?? 0) + 1,
    };
    const { error } = await admin.from("ui_config").upsert({ key, value, updated_at: at }, { onConflict: "key" });
    if (error) console.error("[ai-office] recordWorkerRun", id, error.message);
  } catch (e) {
    console.error("[ai-office] recordWorkerRun", id, e instanceof Error ? e.message : e);
  }
}
