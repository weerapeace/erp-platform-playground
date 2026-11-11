/**
 * สถานะขึ้นเว็บ (ฝั่ง server เท่านั้น) — ถาม GitHub แทนเบราว์เซอร์ แล้วแชร์คำตอบให้ทุกหน้าจอผ่านแคชกลางของ Vercel
 *
 * ทำไม: เดิมหน้า /admin/deploy ให้เบราว์เซอร์ถาม GitHub เอง 4 ครั้งทุก 30 วิ (~480 ครั้ง/ชม.) แต่ GitHub ให้ถามแบบไม่มีกุญแจได้
 *   60 ครั้ง/ชม. ต่ออินเทอร์เน็ต 1 จุด → เปิดค้างไม่กี่นาทีโดนบล็อก (ทั้งออฟฟิศที่ใช้เน็ตเดียวกัน) — ตัวนับถอยหลังที่เปิดทิ้งไว้ทั้งวันใช้ไม่ได้
 * ตอนนี้: server ถาม 3 ครั้งต่อรอบแคช ไม่ว่าจะเปิดค้างกี่จอ · มีกุญแจ GITHUB_DEPLOY_TOKEN = แคช 15 วิ · ไม่มี = 120 วิ
 *   (ไม่มีกุญแจ GitHub นับโควต้าตาม IP ของ Vercel ซึ่งใช้ร่วมกับเว็บอื่น — อาจโดนจำกัดบ้าง → คืนข้อมูลล่าสุดที่มีไว้ก่อน)
 * กติกาคิด/นับถอยหลัง = lib/deploy-queue.ts (pure + เทสต์) · docs/deploy-batch.md
 */
import { unstable_cache } from "next/cache";
import { DEPLOY_REPO, PROD_BRANCH, ROUND_WORKFLOW, WORK_BRANCH, statusFromGitHub, type DeployStatus } from "@/lib/deploy-queue";

export const DEPLOY_STATUS_TAG = "deploy-status";

const githubToken = () => (process.env.GITHUB_DEPLOY_TOKEN ?? "").trim();
/** มีกุญแจ (5,000 ครั้ง/ชม.) → ถามถี่ได้ · ไม่มี (60 ครั้ง/ชม./IP) → ห่าง ๆ */
export const refreshSecondsFor = (hasToken: boolean) => (hasToken ? 15 : 120);
const REFRESH = refreshSecondsFor(!!githubToken());

class GitHubLimited extends Error {
  constructor(public resetAt: number) { super("GitHub จำกัดจำนวนครั้งที่ถามได้ชั่วคราว"); }
}

async function gh(path: string): Promise<unknown> {
  const token = githubToken();
  const res = await fetch(`https://api.github.com/repos/${DEPLOY_REPO}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "erp-deploy-status",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    throw new GitHubLimited(Number.isFinite(reset) && reset > Date.now() ? reset : Date.now() + 60_000);
  }
  if (!res.ok) throw new Error(`อ่านข้อมูลจาก GitHub ไม่ได้ (${res.status})`);
  return res.json();
}

/** ตัวรอง (สถานะ build / รอบ) พังได้ไม่เป็นไร — แต่โดนจำกัดจำนวนครั้ง ให้ทั้งชุดล้ม จะได้ไม่เก็บข้อมูลแหว่งลงแคช */
const optional = (p: Promise<unknown>) => p.catch((e) => { if (e instanceof GitHubLimited) throw e; return null; });

async function fetchDeployStatus(): Promise<DeployStatus> {
  const [cmp, st, runs] = await Promise.all([
    gh(`/compare/${PROD_BRANCH}...${encodeURIComponent(WORK_BRANCH)}`),
    optional(gh(`/commits/${PROD_BRANCH}/status`)),
    optional(gh(`/actions/workflows/${ROUND_WORKFLOW}/runs?per_page=5`)),
  ]);
  const s = statusFromGitHub(cmp as never, st as never, runs as never, { refreshSeconds: REFRESH });
  return { ...s, waiting: s.waiting.slice(0, 50) };
}

// แคชกลาง (ใช้ร่วมทุกเครื่อง/ทุก instance) · หมดอายุแล้ว Next คืนของเดิมก่อนแล้วไปถามใหม่เบื้องหลัง — ถามพลาดก็ยังมีของเดิมให้
const cachedDeployStatus = unstable_cache(fetchDeployStatus, ["deploy-status-v1"], { revalidate: REFRESH, tags: [DEPLOY_STATUS_TAG] });

// สำรองในเครื่อง: ตอนแคชกลางยังว่างแล้ว GitHub บล็อก → ไม่ถามซ้ำจนพ้นเวลา และคืนของล่าสุดที่เคยได้
let lastGood: DeployStatus | null = null;
let blockedUntil = 0;

export async function getDeployStatus(): Promise<DeployStatus> {
  if (Date.now() < blockedUntil) {
    if (lastGood) return { ...lastGood, stale: true, note: "GitHub จำกัดจำนวนครั้งชั่วคราว — โชว์ข้อมูลล่าสุดที่มี" };
    throw new Error("GitHub จำกัดจำนวนครั้งที่ถามได้ชั่วคราว — ลองใหม่อีกสักครู่ (ตั้งกุญแจ GITHUB_DEPLOY_TOKEN จะหายขาด)");
  }
  try {
    const s = await cachedDeployStatus();
    lastGood = s;
    return s;
  } catch (e) {
    if (e instanceof GitHubLimited) blockedUntil = e.resetAt;
    if (lastGood) return { ...lastGood, stale: true, note: e instanceof Error ? e.message : null };
    throw e;
  }
}
