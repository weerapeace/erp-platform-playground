// ============================================================
// 📤 คิวโพสต์โซเชียลอัตโนมัติ (ของกลาง · ฝั่งเซิร์ฟเวอร์) — ตาราง social_publish_jobs
//  ตั้งคิว (enqueueJobs) → pg_cron ทุก 5 นาที → /api/cron/social-publish → runDueJobs → publishMeta (ตัวเดียวกับปุ่ม "โพสต์เลย")
//  สถานะ: queued → running → posted | processing (IG Reels รอประมวลผล) → posted | failed · cancelled
//  ผลเขียนกลับ post_status ของคอนเทนต์: ตั้งคิว = scheduled · ล้ม = failed · สำเร็จ = posted (+ ลิงก์)
//  กันโพสต์ซ้ำ: จองงานด้วย social_publish_claim (FOR UPDATE SKIP LOCKED) · งานที่ค้าง running นาน = failed (ไม่ยิงซ้ำเอง)
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";
import { checkMetaReady, finalizeIgReel, normalizeMedia, publishMeta, setContentPostStatus, type Actor } from "./meta";
import type { PostMedia } from "./media";

export type JobStatus = "queued" | "running" | "processing" | "posted" | "failed" | "cancelled";
export type PublishJob = {
  id: string; content_id: string; platform: string; format: string | null; caption_text: string; media: PostMedia[];
  run_at: string; status: JobStatus; attempts: number; remote_id: string | null; result_url: string | null; last_error: string | null;
  locked_at: string | null; posted_at: string | null; created_by: string | null; created_by_name: string | null; created_at: string; updated_at: string;
};
export type EnqueueItem = { platform: string; format?: string | null; caption_text?: string; media?: PostMedia[]; run_at: string };

export const ACTIVE_STATUSES: JobStatus[] = ["queued", "running", "processing"];
const STALE_RUNNING_MIN = 15;     // running ค้างนานเกินนี้ = ตัวเดินพังกลางทาง
const PROCESSING_GIVE_UP_MIN = 60; // IG ประมวลผลวิดีโอนานเกินนี้ = ถือว่าล้ม
const SYSTEM: Actor = { id: null, name: "ระบบ (คิวโพสต์)" };
const PLATFORM_TH: Record<string, string> = { facebook: "Facebook", instagram: "Instagram" };

/** ตั้งคิวหลายแพลตฟอร์มของคอนเทนต์เดียว — ตรวจครบก่อน (ไม่ผ่านสักอัน = ไม่ตั้งเลย) · คิวเดิมของแพลตฟอร์มเดียวกันถูกแทน */
export async function enqueueJobs(admin: SupabaseClient, contentId: string, items: EnqueueItem[], actor: Actor): Promise<{ jobs: PublishJob[] } | { error: string }> {
  if (!items.length) return { error: "ยังไม่ได้เลือกแพลตฟอร์ม" };
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const it of items) {
    const platform = (it.platform ?? "").trim();
    if (seen.has(platform)) return { error: `เลือก ${platform} ซ้ำ` };
    seen.add(platform);
    const notReady = await checkMetaReady(admin, contentId, platform);
    if (notReady) return { error: notReady };
    const format = (it.format ?? "").trim() || null;
    const nm = normalizeMedia(format ?? "", it.media ?? []);
    if ("error" in nm) return { error: `${PLATFORM_TH[platform] ?? platform}: ${nm.error}` };
    const t = Date.parse(it.run_at);
    if (!Number.isFinite(t)) return { error: "เวลาโพสต์ไม่ถูกต้อง" };
    if (t < Date.now() - 60_000) return { error: "เวลาโพสต์ผ่านไปแล้ว — เลือกเวลาใหม่ หรือกด “โพสต์เลย”" };
    if (t > Date.now() + 180 * 86400_000) return { error: "ตั้งคิวล่วงหน้าได้ไม่เกิน 180 วัน" };
    rows.push({ content_id: contentId, platform, format, caption_text: it.caption_text ?? "", media: nm.media, run_at: new Date(t).toISOString(), created_by: actor.id, created_by_name: actor.name });
  }
  // คิวที่กำลังยิงอยู่ แทนไม่ได้ (กันโพสต์ซ้ำ)
  const { data: running } = await admin.from("social_publish_jobs").select("platform").eq("content_id", contentId).eq("status", "running").in("platform", [...seen]);
  if ((running ?? []).length) return { error: "มีแพลตฟอร์มที่ระบบกำลังโพสต์อยู่ — รอสักครู่แล้วค่อยแก้คิว" };
  await admin.from("social_publish_jobs").update({ status: "cancelled", last_error: "ถูกแทนด้วยคิวใหม่", updated_at: new Date().toISOString() })
    .eq("content_id", contentId).in("platform", [...seen]).in("status", ["queued", "processing"]);
  const { data, error } = await admin.from("social_publish_jobs").insert(rows).select("*");
  if (error) return { error: `ตั้งคิวไม่สำเร็จ: ${error.message}` };
  for (const p of seen) await setContentPostStatus(admin, contentId, p, "scheduled");
  await writeAudit(admin, { action: "social_publish:queue", entityType: "creative_content", entityId: contentId, actorId: actor.id, actorName: actor.name, metadata: { platforms: [...seen], run_at: rows.map((r) => r.run_at) } });
  return { jobs: (data ?? []) as PublishJob[] };
}

/** ยกเลิกคิว (เฉพาะที่ยังไม่ยิง) — สถานะโพสต์ "ตั้งเวลาแล้ว/ล้ม" ของแพลตฟอร์มนั้นถูกล้างออก */
export async function cancelJob(admin: SupabaseClient, id: string, actor: Actor): Promise<{ job: PublishJob } | { error: string }> {
  const { data } = await admin.from("social_publish_jobs").select("*").eq("id", id).maybeSingle();
  const job = data as PublishJob | null;
  if (!job) return { error: "ไม่พบคิวนี้" };
  if (job.status === "running") return { error: "ระบบกำลังโพสต์อยู่ ยกเลิกไม่ทันแล้ว" };
  if (job.status === "processing") return { error: "Instagram รับไฟล์ไปแล้ว (กำลังประมวลผล) ยกเลิกไม่ได้" };
  if (!["queued", "failed"].includes(job.status)) return { error: "คิวนี้จบไปแล้ว" };
  const { data: upd } = await admin.from("social_publish_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).in("status", ["queued", "failed"]).select("*").maybeSingle();
  if (!upd) return { error: "สถานะคิวเปลี่ยนไปแล้ว ลองโหลดใหม่" };
  await setContentPostStatus(admin, job.content_id, job.platform, null, ["scheduled", "failed"]);
  await writeAudit(admin, { action: "social_publish:cancel", entityType: "creative_content", entityId: job.content_id, actorId: actor.id, actorName: actor.name, metadata: { job_id: id, platform: job.platform } });
  return { job: upd as PublishJob };
}

/** ลองใหม่ (คิวที่ล้ม) — ยิงในรอบถัดไป (≤5 นาที) หรือเวลาที่ระบุ */
export async function retryJob(admin: SupabaseClient, id: string, actor: Actor, runAt?: string | null): Promise<{ job: PublishJob } | { error: string }> {
  const { data } = await admin.from("social_publish_jobs").select("*").eq("id", id).maybeSingle();
  const job = data as PublishJob | null;
  if (!job) return { error: "ไม่พบคิวนี้" };
  if (job.status !== "failed") return { error: "ลองใหม่ได้เฉพาะคิวที่ล้ม" };
  const notReady = await checkMetaReady(admin, job.content_id, job.platform);
  if (notReady) return { error: notReady };
  const t = runAt ? Date.parse(runAt) : Date.now();
  const { data: upd, error } = await admin.from("social_publish_jobs")
    .update({ status: "queued", run_at: new Date(Number.isFinite(t) ? t : Date.now()).toISOString(), last_error: null, locked_at: null, remote_id: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "failed").select("*").maybeSingle();
  if (error || !upd) return { error: error?.message ?? "สถานะคิวเปลี่ยนไปแล้ว ลองโหลดใหม่" };
  await setContentPostStatus(admin, job.content_id, job.platform, "scheduled");
  await writeAudit(admin, { action: "social_publish:retry", entityType: "creative_content", entityId: job.content_id, actorId: actor.id, actorName: actor.name, metadata: { job_id: id, platform: job.platform } });
  return { job: upd as PublishJob };
}

/** แก้แคปชั่นของคิวที่ยังรอ (ผู้ใช้แก้แคปชั่นหลังตั้งคิว → กด "ใช้แคปชั่นล่าสุด") */
export async function updateQueuedCaption(admin: SupabaseClient, id: string, caption: string, actor: Actor): Promise<{ job: PublishJob } | { error: string }> {
  const { data: upd } = await admin.from("social_publish_jobs").update({ caption_text: caption, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "queued").select("*").maybeSingle();
  if (!upd) return { error: "แก้ได้เฉพาะคิวที่ยังไม่ถึงเวลา" };
  const job = upd as PublishJob;
  await writeAudit(admin, { action: "social_publish:caption", entityType: "creative_content", entityId: job.content_id, actorId: actor.id, actorName: actor.name, metadata: { job_id: id, platform: job.platform } });
  return { job };
}

async function failJob(admin: SupabaseClient, job: PublishJob, message: string): Promise<void> {
  await admin.from("social_publish_jobs").update({ status: "failed", last_error: message, updated_at: new Date().toISOString() }).eq("id", job.id);
  await setContentPostStatus(admin, job.content_id, job.platform, "failed");
  await writeAudit(admin, { action: "social_publish:failed", entityType: "creative_content", entityId: job.content_id, actorId: null, actorName: SYSTEM.name, metadata: { job_id: job.id, platform: job.platform, error: message } });
  // แจ้งคนตั้งคิว (กระดิ่งในระบบ) — ล้มเงียบ ๆ ไม่ได้ เพราะคนคิดว่าโพสต์ไปแล้ว
  if (job.created_by) {
    const { data: c } = await admin.from("erp_creative_content").select("title, content_no").eq("id", job.content_id).maybeSingle();
    const head = ((c as { title?: string | null; content_no?: string | null } | null)?.title ?? "") || ((c as { content_no?: string | null } | null)?.content_no ?? "คอนเทนต์");
    try {
      await admin.from("erp_notifications").insert({
        user_id: job.created_by, event_type: "social_publish_failed", priority: "high",
        title: `โพสต์ ${PLATFORM_TH[job.platform] ?? job.platform} ไม่สำเร็จ: ${head}`, body: message.slice(0, 300),
        link_url: `/tasks/content-calendar?content=${job.content_id}`, entity_type: "creative_content", entity_id: job.content_id,
      });
    } catch { /* แจ้งเตือนล้มไม่กระทบคิว */ }
  }
}

/** ตัวเดินคิว (เรียกจาก cron) — งานที่ถึงเวลา + งาน IG ที่รอประมวลผล · ทีละ ≤ limit งาน */
export async function runDueJobs(admin: SupabaseClient, limit = 5): Promise<{ claimed: number; results: { id: string; platform: string; outcome: string; error?: string }[] }> {
  // 1) running ค้าง = ตัวเดินรอบก่อนพังกลางทาง → ไม่ยิงซ้ำเอง (อาจโพสต์ไปแล้ว) ให้คนเช็กแล้วกดลองใหม่
  const staleIso = new Date(Date.now() - STALE_RUNNING_MIN * 60_000).toISOString();
  const { data: stale } = await admin.from("social_publish_jobs").select("*").eq("status", "running").lt("locked_at", staleIso);
  for (const j of (stale ?? []) as PublishJob[]) await failJob(admin, j, "ระบบหยุดกลางคันระหว่างโพสต์ — เช็กที่เพจก่อนว่าขึ้นแล้วหรือยัง แล้วค่อยกดลองใหม่ (กันโพสต์ซ้ำ)");

  // 2) จองงาน
  const { data, error } = await admin.rpc("social_publish_claim", { p_limit: limit });
  if (error) throw new Error(`จองคิวไม่สำเร็จ: ${error.message}`);
  const jobs = (data ?? []) as PublishJob[];
  const results: { id: string; platform: string; outcome: string; error?: string }[] = [];

  for (const job of jobs) {
    try {
      // IG Reels ที่รอประมวลผล → เช็กต่อ
      if (job.status === "processing") {
        if (!job.remote_id) { await failJob(admin, job, "ไม่พบรหัสงานของ Instagram"); results.push({ id: job.id, platform: job.platform, outcome: "failed" }); continue; }
        const res = await finalizeIgReel(admin, { contentId: job.content_id, creationId: job.remote_id, actor: SYSTEM, via: "queue" });
        if (res.ok && res.state === "posted") {
          await admin.from("social_publish_jobs").update({ status: "posted", result_url: res.url, posted_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
          results.push({ id: job.id, platform: job.platform, outcome: "posted" });
        } else if (res.ok) {
          const since = Date.now() - Date.parse(job.run_at);
          if (since > PROCESSING_GIVE_UP_MIN * 60_000) { await failJob(admin, job, "Instagram ประมวลผลวิดีโอนานเกิน 1 ชั่วโมง — ลองตั้งคิวใหม่"); results.push({ id: job.id, platform: job.platform, outcome: "failed" }); }
          else results.push({ id: job.id, platform: job.platform, outcome: "processing" });
        } else { await failJob(admin, job, res.error); results.push({ id: job.id, platform: job.platform, outcome: "failed", error: res.error }); }
        continue;
      }
      // ถึงเวลา → ยิง
      const res = await publishMeta(admin, { contentId: job.content_id, platform: job.platform, caption: job.caption_text, media: job.media ?? [], format: job.format, actor: SYSTEM, via: "queue" });
      if (!res.ok) { await failJob(admin, job, res.error); results.push({ id: job.id, platform: job.platform, outcome: "failed", error: res.error }); continue; }
      if (res.state === "processing") {
        await admin.from("social_publish_jobs").update({ status: "processing", remote_id: res.creationId, updated_at: new Date().toISOString() }).eq("id", job.id);
        results.push({ id: job.id, platform: job.platform, outcome: "processing" });
        continue;
      }
      await admin.from("social_publish_jobs").update({ status: "posted", result_url: res.url, posted_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      results.push({ id: job.id, platform: job.platform, outcome: "posted" });
    } catch (e) {
      const msg = `ระบบผิดพลาดระหว่างโพสต์: ${(e as Error).message}`;
      await failJob(admin, job, msg).catch(() => {});
      results.push({ id: job.id, platform: job.platform, outcome: "failed", error: msg });
    }
  }
  return { claimed: jobs.length, results };
}
