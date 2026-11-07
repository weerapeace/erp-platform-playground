/**
 * ⚡ ของกลาง "ตรวจความเร็ว" — ใช้ร่วม 2 ที่ (กติกาเดียวกัน ตัดสินเหมือนกัน)
 *   1) สคริปต์ `npm run perf-check` (scripts/perf-check.mjs) — Claude รันหลัง deploy กับหน้าที่เพิ่งแก้
 *   2) ตัวตรวจรายวัน /api/cron/perf-watch (ผู้ตรวจความเร็ว ในออฟฟิศทีม AI) — วัดหน้าหลัก + คำสั่งฐานข้อมูลทุกคืน
 *
 * วัดอะไร (ไม่ต้องล็อกอิน):
 *   - ขนาดโค้ด JS ที่หน้าโหลดตอนเปิด (รวม chunk ทุกตัวที่ HTML อ้าง · บีบอัด brotli เอง → ใกล้เคียงขนาดที่ดาวน์โหลดจริง)
 *   - เวลาตอบ (อุ่น 1 รอบ + วัด 5 รอบ เอาค่ากลาง) · ก่อนวัดเช็ก /api/ping ว่าระบบทั้งก้อนช้าอยู่ไหม (เช่นช่วงหลัง deploy)
 * ค่าฐาน (baseline) เก็บใน ui_config key `perf_baseline:<path>` 1 แถวต่อหน้า — ใช้ร่วมทุกเซสชัน/ทุกเครื่อง/ตัวตรวจรายวัน
 *   ค่าฐาน = ค่ากลางของ 7 ครั้งล่าสุดที่ "ปกติ" · ครั้งที่ช้าลงไม่ถูกนับเป็นค่าฐาน (กันช้าแล้วกลายเป็นเรื่องปกติ) จนกว่าจะสั่งยอมรับ (--accept)
 *   เวลาตอบแยกตามที่วัด (local = เครื่องในไทย · cron = Vercel โตเกียว) เพราะระยะทางต่างกัน · ขนาดโค้ดใช้ร่วมกัน
 *
 * ⚠️ ไฟล์นี้ห้าม import แบบ "@/..." หรือไฟล์ .ts อื่น — สคริปต์ Node อ่านไฟล์นี้ตรง ๆ (ตัด type เอง) · ฝั่ง server/สคริปต์เท่านั้น (ใช้ node:zlib)
 * คู่มือ: docs/perf-check.md
 */
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

export const PERF_PROD_URL = "https://erp-platform-playground.vercel.app";
export const PERF_BASELINE_PREFIX = "perf_baseline:";
export const PERF_REPORT_KEY = "perf_watch_report";
export const perfBaselineKey = (path: string) => `${PERF_BASELINE_PREFIX}${path}`;

/** หน้าหลักที่ตัวตรวจรายวันวัดทุกคืน + ใช้แทน "ทุกหน้า" เมื่อแก้ของกลางที่ใช้ทั่วระบบ (เทสต์เช็กว่ามีหน้าจริง) */
export const PERF_KEY_PAGES = [
  "/apps", "/purchasing", "/master/skus", "/master/parent-skus", "/tasks", "/master/work-board",
  "/master/design-dashboard", "/master/design-sheets", "/sales-orders", "/quotations",
  "/purchase-orders", "/dashboard", "/app/china-pay", "/cashflow",
];

/** เกณฑ์ (ปรับที่นี่ที่เดียว — สคริปต์และตัวตรวจรายวันใช้ร่วมกัน) */
export const PERF_LIMITS = {
  /** /api/ping (ไม่แตะ DB) ค่ากลางเกินนี้ = ระบบช้าทั้งก้อน → ไม่ตัดสินเวลาตอบรอบนี้ (ปกติ 0.2-0.3 วิ) */
  pingSlowMs: 600,
  /** เวลาตอบ: ช้ากว่าค่าฐานเกิน 50% และช้าลงเกิน 150ms (กันตัวเลขเล็ก ๆ แกว่งเอง) = ⚠️ */
  timeRatio: 1.5,
  timeMinDeltaMs: 150,
  /** เกินนี้ = 🐢 ช้าผิดปกติ ถึงจะไม่มีค่าฐาน */
  pageSlowMs: 1000,
  apiSlowMs: 1500,
  /** ขนาดโค้ด: โตเกิน 10% หรือเกิน 50KB = ⚠️ · เกินเพดาน 700KB ต่อหน้า = ⚠️ เสมอ (2026-11-07 ใหญ่สุด /tasks ~590KB) */
  jsRatio: 0.10,
  jsMinDeltaKB: 50,
  jsCeilingKB: 700,
  /** คำสั่งฐานข้อมูล: เฉลี่ยเกิน 500ms และถูกเรียก ≥ 20 ครั้งในรอบ · ใหม่ หรือช้ากว่าเดิมเกิน 50% = ⚠️ */
  dbSlowMeanMs: 500,
  dbMinCalls: 20,
  dbRatio: 1.5,
  /** หลัง deploy สำเร็จ รอเท่านี้ก่อนวัด (ฐานข้อมูลช้าทั้งระบบ ~2 นาทีหลัง deploy — memory deploy_reload_auth_storm) */
  postDeployWaitSec: 180,
  /** เก็บกี่ครั้งล่าสุดไว้คิดค่าฐาน */
  historySize: 7,
};

export type PerfSource = "local" | "cron";
export type PerfKind = "page" | "api";

export type PerfSample = {
  path: string;
  kind: PerfKind;
  status: number;
  /** ค่ากลางเวลาตอบ (ms) — null = ไม่ได้วัด */
  ms: number | null;
  /** ขนาด JS รวมแบบบีบอัด (KB) — เฉพาะหน้า */
  jsKB: number | null;
  /** ขนาด JS ดิบ (KB) */
  jsRawKB: number | null;
  chunks: number;
  error?: string;
};

export type PerfBaseline = {
  path: string;
  js: number[];
  ms: Partial<Record<PerfSource, number[]>>;
  at: string;
};

export type PerfLevel = "ok" | "new" | "warn" | "slow" | "skip";
export type PerfVerdict = { level: PerfLevel; reasons: string[]; jsBase: number | null; msBase: number | null };

/* ───────────── ตัวช่วยเล็ก ───────────── */

export function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export const fmtKB = (kb: number | null) => (kb == null ? "-" : `${Math.round(kb)}KB`);
export const fmtSec = (ms: number | null) => (ms == null ? "-" : `${(ms / 1000).toFixed(2)}s`);
const pct = (now: number, base: number) => `${now >= base ? "+" : ""}${Math.round(((now - base) / base) * 100)}%`;

/** path ของหน้า/API ที่วัดได้ตรง ๆ (ไม่มีช่องพารามิเตอร์ [id]) */
export const isMeasurablePath = (p: string) => p.startsWith("/") && !/[[\]:]/.test(p) && !p.includes("?");

/** รายการ chunk JS ที่ HTML ของหน้าอ้างถึง (script tag + ข้อมูลหน้าที่ฝังใน HTML) ไม่ซ้ำ */
export function extractChunkPaths(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\/_next\/static\/chunks\/[A-Za-z0-9_\-./%~@[\]()]+?\.js/g)) out.add(m[0]);
  return [...out];
}

/** ขนาดแบบบีบอัด brotli (ระดับกลาง เร็ว) — ใช้แทนขนาดที่ดาวน์โหลดจริง (เว็บไม่บอก content-length ของไฟล์บีบอัด) */
export function compressedBytes(buf: Uint8Array): number {
  return brotliCompressSync(buf, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }).length;
}

/* ───────────── ค่าฐาน + ตัดสิน ───────────── */

export function baselineValues(b: PerfBaseline | null | undefined, source: PerfSource): { js: number | null; ms: number | null } {
  if (!b) return { js: null, ms: null };
  return { js: median(b.js ?? []), ms: median(b.ms?.[source] ?? []) };
}

/**
 * ตัดสินผลวัด 1 หน้าเทียบค่าฐาน
 * systemSlow = ระบบช้าทั้งก้อนตอนวัด → ไม่ตัดสินเวลา (ขนาดโค้ดยังตัดสินได้ เพราะไม่ขึ้นกับความเร็วเน็ต)
 */
export function judgeSample(s: PerfSample, b: PerfBaseline | null | undefined, opt: { source: PerfSource; systemSlow?: boolean }): PerfVerdict {
  const L = PERF_LIMITS;
  const { js: jsBase, ms: msBase } = baselineValues(b, opt.source);
  const reasons: string[] = [];
  let level: PerfLevel = "ok";
  const bump = (to: PerfLevel) => { const rank: Record<PerfLevel, number> = { skip: 0, ok: 1, new: 2, warn: 3, slow: 4 }; if (rank[to] > rank[level]) level = to; };

  if (s.error) return { level: "skip", reasons: [s.error], jsBase, msBase };
  if (s.status === 401 || s.status === 403) return { level: "skip", reasons: ["ต้องล็อกอิน วัดจากข้างนอกไม่ได้ — ดูฝั่งฐานข้อมูลในรายงานรายวัน"], jsBase, msBase };
  if (s.status === 405) return { level: "skip", reasons: ["รับแค่การส่งข้อมูล (POST) วัดแบบเปิดดูไม่ได้"], jsBase, msBase };
  if (s.status >= 300 && s.status < 400) return { level: "skip", reasons: [`เด้งไปหน้าอื่น (${s.status})`], jsBase, msBase };
  if (s.status === 404) return { level: "skip", reasons: ["ไม่พบหน้า (404)"], jsBase, msBase };
  if (s.status >= 500) return { level: "slow", reasons: [`หน้าพัง (${s.status})`], jsBase, msBase };

  // ขนาดโค้ด
  if (s.kind === "page" && s.jsKB != null) {
    if (jsBase != null) {
      const grow = s.jsKB - jsBase;
      if (grow > jsBase * L.jsRatio || grow > L.jsMinDeltaKB) { bump("warn"); reasons.push(`โค้ดโต ${fmtKB(jsBase)}→${fmtKB(s.jsKB)} (${pct(s.jsKB, jsBase)}) — น่าจะเพิ่งดึงของหนักเข้ามา`); }
    }
    // เพดาน: เตือนตอน "ข้ามเพดาน" (ค่าฐานยังไม่เกิน แต่ตอนนี้เกิน) · หน้าที่หนักเกินอยู่แล้วตั้งแต่วัดครั้งแรก = จดไว้เป็นข้อมูล ไม่เตือนซ้ำทุกคืน
    if (s.jsKB > L.jsCeilingKB) {
      if (jsBase != null && jsBase <= L.jsCeilingKB) { bump("warn"); reasons.push(`โค้ดข้ามเพดาน ${L.jsCeilingKB}KB`); }
      else if (jsBase == null) reasons.push(`หนักเกินเพดาน ${L.jsCeilingKB}KB อยู่แล้ว (ควรหาทางลด)`);
    }
  }

  // เวลาตอบ
  if (s.ms != null && !opt.systemSlow) {
    const hardSlow = s.kind === "page" ? L.pageSlowMs : L.apiSlowMs;
    if (s.ms > hardSlow) { bump("slow"); reasons.push(`ตอบช้า ${fmtSec(s.ms)} (เกิน ${fmtSec(hardSlow)})`); }
    else if (msBase != null && s.ms > msBase * L.timeRatio && s.ms - msBase > L.timeMinDeltaMs) {
      bump("warn"); reasons.push(`ช้าลง ${fmtSec(msBase)}→${fmtSec(s.ms)} (${pct(s.ms, msBase)})`);
    }
  }

  if (level === "ok" && jsBase == null && msBase == null) level = "new";
  return { level, reasons, jsBase, msBase };
}

/** ค่าฐานถัดไป: ปกติ/ใหม่ = จดเพิ่ม · ช้าลง = ไม่จด (ยกเว้นสั่งยอมรับ → เริ่มนับใหม่จากค่านี้) */
export function nextBaseline(prev: PerfBaseline | null | undefined, s: PerfSample, v: PerfVerdict, opt: { source: PerfSource; accept?: boolean; systemSlow?: boolean; now?: string }): PerfBaseline | null {
  if (v.level === "skip") return null;
  const keep = (arr: number[] | undefined, val: number) => [...(arr ?? []), val].slice(-PERF_LIMITS.historySize);
  const good = v.level === "ok" || v.level === "new";
  if (!good && !opt.accept) return null;
  const at = opt.now ?? new Date().toISOString();
  const base: PerfBaseline = { path: s.path, js: [...(prev?.js ?? [])], ms: { ...(prev?.ms ?? {}) }, at };
  if (s.jsKB != null) base.js = opt.accept ? [s.jsKB] : keep(base.js, s.jsKB);
  if (s.ms != null && !opt.systemSlow) base.ms[opt.source] = opt.accept ? [s.ms] : keep(base.ms[opt.source], s.ms);
  return base;
}

/** อ่านค่าฐานจากแถว ui_config (กันข้อมูลเพี้ยน) */
export function parseBaseline(v: unknown): PerfBaseline | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const nums = (a: unknown) => (Array.isArray(a) ? a.map(Number).filter((n) => Number.isFinite(n)) : []);
  const ms = (o.ms && typeof o.ms === "object" ? o.ms : {}) as Record<string, unknown>;
  return { path: String(o.path ?? ""), js: nums(o.js), ms: { local: nums(ms.local), cron: nums(ms.cron) }, at: String(o.at ?? "") };
}

const ICON: Record<PerfLevel, string> = { ok: "✅", new: "🆕", warn: "⚠️", slow: "🐢", skip: "⏭️" };

/** 1 บรรทัดต่อหน้า (ภาษาคน สั้นที่สุด) */
export function formatSampleLine(s: PerfSample, v: PerfVerdict): string {
  const parts: string[] = [];
  if (s.kind === "page" && s.jsKB != null) parts.push(`โค้ด ${fmtKB(s.jsKB)}${v.jsBase != null ? ` (เดิม ${fmtKB(v.jsBase)})` : ""}`);
  if (s.ms != null) parts.push(`ตอบ ${fmtSec(s.ms)}${v.msBase != null ? ` (เดิม ${fmtSec(v.msBase)})` : ""}`);
  const tail = ` — ${[...(v.level === "new" ? ["ยังไม่มีค่าฐาน"] : []), ...v.reasons].join(" · ")}`.replace(/ — $/, "");
  return `${ICON[v.level]} ${s.path}  ${parts.join(" · ")}${tail}`;
}

/* ───────────── คำสั่งฐานข้อมูล (จาก RPC erp_perf_query_delta) ───────────── */

export type DbDeltaRow = { queryid: string; role: string; calls: number; mean_ms: number; prev_mean_ms: number | null; is_new: boolean; total_ms: number; query: string };
export type DbFlag = DbDeltaRow & { why: string };

/** คำสั่งที่ "ช้าขึ้น" ในรอบนี้: ใหม่และช้า หรือช้ากว่าค่าเฉลี่ยเดิมเกิน 50% (ตัวที่ช้ามานานแล้วไม่นับเป็นข่าวใหม่) */
export function judgeDbRows(rows: DbDeltaRow[]): DbFlag[] {
  const L = PERF_LIMITS;
  const out: DbFlag[] = [];
  for (const r of rows) {
    if (!(r.calls >= L.dbMinCalls && r.mean_ms >= L.dbSlowMeanMs)) continue;
    if (r.is_new || r.prev_mean_ms == null) out.push({ ...r, why: `คำสั่งใหม่ เฉลี่ย ${fmtSec(r.mean_ms)} × ${r.calls} ครั้ง` });
    else if (r.mean_ms >= r.prev_mean_ms * L.dbRatio) out.push({ ...r, why: `ช้าลง ${fmtSec(r.prev_mean_ms)}→${fmtSec(r.mean_ms)} × ${r.calls} ครั้ง` });
  }
  return out;
}

/** ชื่อตาราง/ฟังก์ชันจากข้อความคำสั่ง (ให้คนอ่านรู้ว่าเกี่ยวกับอะไร) */
export function queryLabel(q: string): string {
  const fn = /"public"\."([a-z0-9_]+)"\s*\(/i.exec(q) ?? /\bpublic\.([a-z0-9_]+)\s*\(/i.exec(q);
  if (fn) return `ฟังก์ชัน ${fn[1]}()`;
  const tb = /\bFROM\s+"public"\."([a-z0-9_]+)"/i.exec(q) ?? /\b(?:FROM|UPDATE|INTO)\s+(?:public\.)?"?([a-z0-9_]+)"?/i.exec(q);
  return tb ? `ตาราง ${tb[1]}` : q.slice(0, 60);
}

/* ───────────── ตัววัด (ใช้ fetch ของระบบ — Node 18+ / Vercel) ───────────── */

type FetchLike = typeof fetch;

async function timed(fetchImpl: FetchLike, url: string): Promise<{ ms: number; status: number; body: Uint8Array }> {
  const t0 = performance.now();
  const res = await fetchImpl(url, { redirect: "manual", cache: "no-store", headers: { "user-agent": "erp-perf-check" } });
  const body = new Uint8Array(await res.arrayBuffer());
  return { ms: performance.now() - t0, status: res.status, body };
}

/** ค่ากลางเวลาตอบ /api/ping (อุ่น 1 + วัด 3) */
export async function measurePing(base: string, fetchImpl: FetchLike = fetch): Promise<number | null> {
  try {
    await timed(fetchImpl, `${base}/api/ping`);
    const ms: number[] = [];
    for (let i = 0; i < 3; i++) ms.push((await timed(fetchImpl, `${base}/api/ping`)).ms);
    return median(ms);
  } catch {
    return null;
  }
}

/** ขนาด chunk (จำไว้ข้ามหน้าในรอบเดียวกัน — ชื่อไฟล์มีแฮช เนื้อไม่เปลี่ยน) */
export type ChunkCache = Map<string, Promise<{ raw: number; zip: number }>>;

async function chunkSize(base: string, p: string, cache: ChunkCache, fetchImpl: FetchLike) {
  if (!cache.has(p)) {
    cache.set(p, (async () => {
      const res = await fetchImpl(`${base}${p}`, { headers: { "user-agent": "erp-perf-check" } });
      if (!res.ok) return { raw: 0, zip: 0 };
      const buf = new Uint8Array(await res.arrayBuffer());
      return { raw: buf.length, zip: compressedBytes(buf) };
    })().catch(() => ({ raw: 0, zip: 0 })));
  }
  return cache.get(p)!;
}

/**
 * วัด 1 หน้า/API: เวลาตอบ (อุ่น 1 + วัด runs รอบ เอาค่ากลาง) + ขนาด JS (เฉพาะหน้า)
 * วัดทีละหน้าตามลำดับ (กันคำขอแย่งกันเอง) · ดึง chunk พร้อมกันทีละ 8
 */
export async function measurePath(base: string, path: string, kind: PerfKind, opt: { runs?: number; cache?: ChunkCache; fetchImpl?: FetchLike } = {}): Promise<PerfSample> {
  const fetchImpl = opt.fetchImpl ?? fetch;
  const cache = opt.cache ?? new Map();
  const runs = opt.runs ?? 5;
  const sample: PerfSample = { path, kind, status: 0, ms: null, jsKB: null, jsRawKB: null, chunks: 0 };
  try {
    const first = await timed(fetchImpl, `${base}${path}`);
    sample.status = first.status;
    if (first.status !== 200) return sample;
    const ms: number[] = [];
    for (let i = 0; i < runs; i++) ms.push((await timed(fetchImpl, `${base}${path}`)).ms);
    sample.ms = Math.round(median(ms) ?? 0);
    if (kind === "page") {
      const chunks = extractChunkPaths(new TextDecoder().decode(first.body));
      sample.chunks = chunks.length;
      let raw = 0, zip = 0;
      for (let i = 0; i < chunks.length; i += 8) {
        const got = await Promise.all(chunks.slice(i, i + 8).map((c) => chunkSize(base, c, cache, fetchImpl)));
        for (const g of got) { raw += g.raw; zip += g.zip; }
      }
      sample.jsKB = Math.round(zip / 1024);
      sample.jsRawKB = Math.round(raw / 1024);
    }
  } catch (e) {
    sample.error = `วัดไม่ได้: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160);
  }
  return sample;
}
