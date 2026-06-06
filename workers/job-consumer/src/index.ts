/**
 * Queue consumer — หยิบงานจากคิว erp-jobs แล้วสั่งแอปหลักประมวลผลผ่าน /api/jobs/run
 * ถ้า fetch ไม่สำเร็จ → retry (Cloudflare Queue จะลองใหม่ตาม max_retries)
 */
export interface Env {
  APP_URL: string;
  JOB_RUNNER_SECRET: string;
}

type JobMsg = { job_id: string };

export default {
  async queue(batch: MessageBatch<JobMsg>, env: Env): Promise<void> {
    for (const m of batch.messages) {
      try {
        const res = await fetch(`${env.APP_URL.replace(/\/$/, "")}/api/jobs/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-job-secret": env.JOB_RUNNER_SECRET },
          body: JSON.stringify({ job_id: m.body.job_id }),
        });
        if (res.ok) m.ack();
        else m.retry();
      } catch {
        m.retry();
      }
    }
  },
};
