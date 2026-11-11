/**
 * ขึ้นเว็บเป็นรอบ (เจ้าของเลือก 2026-11-10: "10 นาที แต่มีปุ่มขึ้นทันทีด้วย") — ไฟล์ pure ใช้ทั้งหน้า /admin/deploy และ API
 *
 *   ทุก session push ลง feat/host-portable เหมือนเดิม (Vercel ไม่ build สาขานี้)
 *   GitHub Actions "deploy-round.yml" (เด้งทุก push): รอรวมงาน ~10 นาที → เลื่อนสาขา prod ไปงานล่าสุด → Vercel build prod = เว็บจริง
 *   ขึ้นทันที = รัน "deploy-batch.yml" (บนสาขา main) เดี๋ยวนี้ (ปุ่มในหน้า /admin/deploy · `gh workflow run deploy-batch.yml`)
 *   ตัวนับถอยหลัง (หน้า /admin/deploy + หน้าต่างลอยมุมจอ) = statusFromGitHub() → deployPhase() — server รวมข้อมูลให้ (GET /api/admin/deploy)
 * memory vercel_cost_breakdown · docs/deploy-batch.md
 */

export const DEPLOY_REPO = "weerapeace/erp-platform-playground";
export const WORK_BRANCH = "feat/host-portable";
export const PROD_BRANCH = "prod";
export const DEPLOY_WORKFLOW = "deploy-batch.yml";
/** ตัวรวมงานเป็นรอบ (บน feat/host-portable · เด้งทุก push) */
export const ROUND_WORKFLOW = "deploy-round.yml";
export const ROUND_MINUTES = 10;
/** ⚠️ ต้องตรงกับ WAIT_SECONDS ใน .github/workflows/deploy-round.yml — รอบตื่นมาเลื่อน prod หลังเริ่มรันเท่านี้วินาที */
export const ROUND_WAIT_SECONDS = 540;
/** เวลา build ของ Vercel โดยประมาณ (เฉลี่ยจริง ~4.3 นาที: compile ~2.2 + page data ~1 + อัปโหลดแคช ~1) — ใช้เดาเท่านั้น */
export const BUILD_SECONDS = 270;

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

// ── ตัวนับถอยหลังขึ้นเว็บ (หน้า /admin/deploy + หน้าต่างลอยมุมจอ) ─────────────────────────────

/** สถานะรวมที่ server ส่งให้หน้าจอ (GET /api/admin/deploy) — หน้าจอนับวินาทีเองจากเวลาในนี้ ไม่ต้องถามบ่อย */
export type DeployStatus = DeployQueue & {
  /** เว็บจริงตอนนี้ (สาขา prod) + สถานะ build ของ Vercel */
  live: { sha: string; message: string; date: string | null; state: string | null; stateSince: string | null };
  /** รอบที่กำลังรอรวมงานอยู่ (deploy-round.yml ที่กำลังรัน) — null = ไม่มีรอบเดินอยู่ */
  round: { startedAt: string } | null;
  fetchedAt: string;
  /** server แนะนำให้ถามใหม่ทุกกี่วินาที (มีกุญแจ GitHub = ถี่ได้) */
  refreshSeconds: number;
  /** ข้อมูลเก่า (GitHub จำกัดจำนวนครั้ง/ล่ม) — โชว์ของล่าสุดที่มี */
  stale?: boolean;
  note?: string | null;
};

type GhStatus = { state?: string; sha?: string; statuses?: { state?: string; context?: string; created_at?: string; updated_at?: string }[] };
type GhRuns = { workflow_runs?: { status?: string; created_at?: string; run_started_at?: string; updated_at?: string }[] };
type GhCompareFull = GhCompare & { base_commit?: { sha?: string; commit?: { message?: string; author?: { date?: string }; committer?: { date?: string } } } };

/** ผลจาก GitHub 3 ตัว (compare prod...feat · status ของ prod · รอบ deploy-round ล่าสุด) → สถานะรวม */
export function statusFromGitHub(
  cmp: GhCompareFull | null | undefined,
  st: GhStatus | null | undefined,
  runs: GhRuns | null | undefined,
  opts: { now?: Date; refreshSeconds: number },
): DeployStatus {
  const q = queueFromCompare(cmp);
  const base = cmp?.base_commit;
  const state = st?.state ?? null;
  // เวลาเริ่มสถานะปัจจุบันของ Vercel (ใช้เดาว่า build จะเสร็จเมื่อไร)
  const vercel = (st?.statuses ?? []).filter((s) => s.state === state && (s.context ?? "").toLowerCase().startsWith("vercel"));
  const since = vercel.map((s) => s.created_at ?? s.updated_at ?? "").filter(Boolean).sort()[0] ?? null;
  // รอบรันได้ทีละตัว (concurrency) — ตัวที่ต่อคิวไว้ GitHub ยังให้ run_started_at = ตอน push (ทั้งที่เริ่มนับจริงตอนตัวก่อนจบ)
  //   → เวลาเริ่มจริง = ช้ากว่าระหว่าง run_started_at กับเวลาจบของรอบก่อนหน้าล่าสุด
  const all = runs?.workflow_runs ?? [];
  const active = all.find((r) => r.status === "in_progress");
  const prevDone = all.filter((r) => r.status === "completed" && r.updated_at).map((r) => r.updated_at as string).sort().pop() ?? "";
  const rawStart = active?.run_started_at ?? active?.created_at ?? null;
  const startedAt = rawStart && Date.parse(prevDone) > Date.parse(rawStart) ? prevDone : rawStart;
  return {
    ...q,
    live: {
      sha: base?.sha ?? st?.sha ?? "",
      message: (base?.commit?.message ?? "").split("\n")[0].trim(),
      date: base?.commit?.committer?.date ?? base?.commit?.author?.date ?? null,
      state,
      stateSince: since,
    },
    round: startedAt ? { startedAt } : null,
    fetchedAt: (opts.now ?? new Date()).toISOString(),
    refreshSeconds: opts.refreshSeconds,
  };
}

export type DeployPhaseKey = "idle" | "round" | "promoting" | "queued" | "building" | "failed";
export type DeployPhase = {
  key: DeployPhaseKey;
  /** หัวข้อสั้น (บนตัวเลข) */
  title: string;
  /** วินาทีที่เหลือ — null = ไม่มีตัวเลขนับ */
  secondsLeft: number | null;
  /** true = ตัวเลขเป็นค่าประมาณ (เวลา build) · false = แม่น (รอบรอรวมงาน) */
  approx: boolean;
  /** บรรทัดรอง (ภาษาคน) */
  detail: string;
  tone: "blue" | "amber" | "green" | "red" | "slate";
};

const secsUntil = (iso: string | null | undefined, plus: number, now: Date): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.round((t + plus * 1000 - now.getTime()) / 1000) : null;
};

/** ตอนนี้อยู่ขั้นไหน + เหลือกี่วินาที — เรียกทุกวินาทีได้ (pure) */
export function deployPhase(s: Pick<DeployStatus, "waiting" | "live" | "round">, now: Date = new Date()): DeployPhase {
  const n = s.waiting.length;
  const latest = s.waiting[0]?.message ?? "";
  const jobs = n ? `รอ ${n.toLocaleString("th-TH")} งาน${latest ? ` · ${latest}` : ""}` : "";
  const building = s.live.state === "pending";
  const buildLeft = building ? secsUntil(s.live.stateSince, BUILD_SECONDS, now) : null;

  if (n > 0) {
    const left = s.round ? secsUntil(s.round.startedAt, ROUND_WAIT_SECONDS, now) : null;
    const prevBuild = building ? " · เว็บกำลัง build รอบก่อนอยู่" : "";
    if (left != null && left > 0) return { key: "round", title: "ขึ้นเว็บรอบถัดไปใน", secondsLeft: left, approx: false, detail: jobs + prevBuild, tone: "blue" };
    if (s.round) return { key: "promoting", title: "กำลังส่งขึ้นเว็บ…", secondsLeft: null, approx: false, detail: jobs, tone: "amber" };
    return { key: "queued", title: "รอรอบถัดไป", secondsLeft: null, approx: false, detail: `${jobs} · งานนี้ไม่ได้เริ่มรอบเอง จะขึ้นพร้อมงานถัดไป (ด่วนกด ขึ้นเว็บทันที)`, tone: "slate" };
  }
  if (building) {
    return buildLeft != null && buildLeft > 0
      ? { key: "building", title: "กำลัง build เว็บจริง", secondsLeft: buildLeft, approx: true, detail: s.live.message || "", tone: "amber" }
      : { key: "building", title: "กำลัง build — ใกล้เสร็จแล้ว", secondsLeft: null, approx: true, detail: s.live.message || "", tone: "amber" };
  }
  if (s.live.state === "failure" || s.live.state === "error")
    return { key: "failed", title: "build ล้ม", secondsLeft: null, approx: false, detail: "เว็บจริงยังเป็นรอบก่อนหน้า — บอกทีมดูแลระบบ", tone: "red" };
  return { key: "idle", title: "เว็บจริงเป็นงานล่าสุดแล้ว", secondsLeft: null, approx: false, detail: s.live.message || "", tone: "green" };
}

/** วินาที → "m:ss" (เกินชั่วโมง → "h:mm:ss") */
export function formatCountdown(sec: number): string {
  const v = Math.max(0, Math.floor(sec));
  const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), x = v % 60;
  const pad = (k: number) => String(k).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
}
