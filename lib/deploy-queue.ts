/**
 * ขึ้นเว็บเป็นรอบ (เจ้าของเลือก 2026-11-10: "10 นาที แต่มีปุ่มขึ้นทันทีด้วย") — ไฟล์ pure ใช้ทั้งหน้า /admin/deploy และ API
 *
 *   ทุก session push ลง feat/host-portable เหมือนเดิม (Vercel ไม่ build สาขานี้)
 *   GitHub Actions "deploy-round.yml" (เด้งทุก push): รอรวมงาน ~10 นาที → เลื่อนสาขา prod ไปงานล่าสุด → Vercel build prod = เว็บจริง
 *   ขึ้นทันที = รัน "deploy-batch.yml" (บนสาขา main) เดี๋ยวนี้ (ปุ่มในหน้า /admin/deploy · `gh workflow run deploy-batch.yml`)
 * memory vercel_cost_breakdown · docs/deploy-batch.md
 */

export const DEPLOY_REPO = "weerapeace/erp-platform-playground";
export const WORK_BRANCH = "feat/host-portable";
export const PROD_BRANCH = "prod";
export const DEPLOY_WORKFLOW = "deploy-batch.yml";
export const ROUND_MINUTES = 10;

/** หน้า GitHub ที่กด "Run workflow" เองได้ (ใช้ตอนยังไม่ได้ตั้งกุญแจให้แอปกดแทน) */
export const DEPLOY_WORKFLOW_PAGE = `https://github.com/${DEPLOY_REPO}/actions/workflows/${DEPLOY_WORKFLOW}`;

export type QueueCommit = { sha: string; message: string; author: string; date: string | null };
export type DeployQueue = {
  /** งานที่ส่งมาแล้วแต่ยังไม่ขึ้นเว็บจริง (ใหม่สุดก่อน) */
  waiting: QueueCommit[];
  /** ไม่ตรงกันแบบแปลก ๆ (prod ไปไกลกว่า/แยกทาง) — ปกติไม่ควรเกิด */
  diverged: boolean;
};

type GhCompare = {
  status?: string;
  ahead_by?: number;
  behind_by?: number;
  commits?: { sha: string; commit?: { message?: string; author?: { name?: string; date?: string }; committer?: { date?: string } } }[];
};

/** ผล compare ของ GitHub (prod...feat/host-portable) → รายการงานที่รอขึ้นเว็บ */
export function queueFromCompare(c: GhCompare | null | undefined): DeployQueue {
  const commits = (c?.commits ?? []).map((x) => ({
    sha: x.sha,
    message: (x.commit?.message ?? "").split("\n")[0].trim(),
    author: x.commit?.author?.name ?? "",
    date: x.commit?.committer?.date ?? x.commit?.author?.date ?? null,   // committer = ตอนถูก commit/rebase จริง (author อาจเก่ากว่า)
  })).reverse();
  return { waiting: commits, diverged: c?.status === "diverged" || (c?.behind_by ?? 0) > 0 };
}

/**
 * "อีกราว N นาที" ถึงรอบถัดไป — รอบเริ่มนับตอนงานแรกที่ยังไม่ขึ้นเว็บถูก push (deploy-round.yml รอ ~10 นาทีแล้วขึ้นทั้งก้อน)
 * oldestWaitingIso = เวลาของงานที่รอนานสุด · ไม่รู้ = ROUND_MINUTES · เลยเวลาแล้ว (กำลังขึ้น/ช้า) = 0
 */
export function minutesToNextRound(oldestWaitingIso: string | null | undefined, now: Date = new Date()): number {
  const t = oldestWaitingIso ? Date.parse(oldestWaitingIso) : NaN;
  if (!Number.isFinite(t)) return ROUND_MINUTES;
  const left = ROUND_MINUTES - (now.getTime() - t) / 60000;
  return Math.max(0, Math.ceil(left));
}

/** สถานะ build ของ Vercel (GitHub commit status) → ข้อความภาษาคน */
export function buildStateText(state: string | null | undefined): { text: string; tone: "ok" | "wait" | "bad" | "none" } {
  switch (state) {
    case "success": return { text: "ขึ้นเว็บแล้ว", tone: "ok" };
    case "pending": return { text: "กำลัง build (~4 นาที)", tone: "wait" };
    case "failure":
    case "error": return { text: "build ล้ม — เว็บจริงยังเป็นรอบก่อนหน้า", tone: "bad" };
    default: return { text: "ยังไม่มีสถานะ", tone: "none" };
  }
}
