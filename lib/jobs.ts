/**
 * ของกลาง — งานเบื้องหลัง (background jobs) เก็บสถานะในตาราง erp_jobs
 * Phase 2: ปุ่ม → สร้าง job → เด้งกลับทันที → ประมวลผลเบื้องหลัง → หน้าจอ poll สถานะ
 *
 * เบื้องหลังตอนนี้ใช้ ctx.waitUntil (รันงานต่อหลังส่ง response) — Step ถัดไปจะสลับเป็น Cloudflare Queue
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function createJob(type: string, payload: Record<string, unknown>, createdBy?: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin().from("erp_jobs")
    .insert({ type, payload, created_by: createdBy ?? null, status: "queued" })
    .select("id").single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

export async function updateJob(id: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin().from("erp_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** ส่งงานเข้า Cloudflare Queue (binding JOB_QUEUE) — คืน true ถ้าส่งสำเร็จ
 *  ถ้ายังไม่มี binding (queue ยังไม่ถูกตั้ง) คืน false → ฝั่งเรียกจะ fallback ไป waitUntil */
export async function sendToQueue(msg: Record<string, unknown>): Promise<boolean> {
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const env = mod.getCloudflareContext ? mod.getCloudflareContext()?.env : null;
    if (env?.JOB_QUEUE?.send) { await env.JOB_QUEUE.send(msg); return true; }
  } catch { /* ไม่มี binding / ไม่ใช่ CF */ }
  return false;
}

/** ดึง ctx.waitUntil ของ Cloudflare (รันงานต่อหลังส่ง response) — คืน null ถ้าไม่ใช่ CF runtime */
export async function getWaitUntil(): Promise<((p: Promise<unknown>) => void) | null> {
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const cf = mod.getCloudflareContext ? mod.getCloudflareContext() : null;
    const exec = cf?.ctx;
    if (exec?.waitUntil) return (p: Promise<unknown>) => exec.waitUntil(p);
  } catch { /* ไม่ใช่ runtime CF (เช่น next dev) */ }
  return null;
}

/** รันงานเบื้องหลัง: ถ้ามี waitUntil ใช้มัน (ปลอดภัยบน CF, response เด้งทันที)
 *  ไม่งั้น await ให้จบ (ช้าแต่ job ไม่หาย) — กันเคส context ไม่พร้อม */
export async function runInBackground(work: () => Promise<void>): Promise<void> {
  const waitUntil = await getWaitUntil();
  if (waitUntil) waitUntil(work());
  else await work();
}
