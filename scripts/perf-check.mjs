// ⚡ ตรวจความเร็วหลัง deploy — วัดหน้าที่เพิ่งแก้ เทียบค่าฐาน แล้วพิมพ์ผลสั้น ๆ (Claude อ่านแค่ไม่กี่บรรทัด = ประหยัด token)
//
//   npm run perf-check -- --changed            หน้าที่กระทบจากไฟล์ใน commit ล่าสุด + ที่ยังไม่ commit (ไล่ด้วย where-used)
//   npm run perf-check -- --changed --base origin/feat/host-portable~3   เทียบไฟล์ตั้งแต่ ref นี้
//   npm run perf-check -- /purchasing /tasks   ระบุหน้าเอง
//   npm run perf-check -- components/x.tsx     ระบุไฟล์ → หาหน้าที่ใช้ไฟล์นี้
//   npm run perf-check -- --key                หน้าหลัก 14 หน้า (ชุดเดียวกับตัวตรวจรายวัน)
//   เพิ่ม --db      = ดูคำสั่งฐานข้อมูลที่ช้าขึ้นตั้งแต่รอบตรวจรายวันล่าสุด (ไม่ขยับรอบ)
//        --accept  = ยอมรับค่าที่วัดได้เป็นค่าฐานใหม่ (ใช้เมื่อเจ้าของตกลงแล้วว่าหนักขึ้นได้ — Claude ห้ามใช้เอง)
//        --no-wait = ไม่รอพ้นช่วงหลัง deploy · --no-save = ไม่จดค่าฐาน · --verbose = แสดงทุกหน้า · --json = ผลแบบเครื่องอ่าน
//        --url <base> = วัดที่อื่น (เช่น dev เครื่องตัวเอง) — ไม่เทียบ/ไม่จดค่าฐาน
//
// ขั้นตอน: รอพ้น 3 นาทีหลัง deploy (gh) → เช็ก /api/ping ว่าระบบทั้งก้อนช้าไหม → วัดทีละหน้า (อุ่น 1 + วัด 5 ค่ากลาง + ขนาด JS)
//          → เทียบค่าฐานใน ui_config `perf_baseline:<path>` (อ่าน/เขียนด้วย .env.local) → จดค่าฐานเฉพาะหน้าที่ปกติ
// exit 0 = ปกติ/ข้าม · exit 1 = มีหน้าช้าลงหรือโตเกินเกณฑ์ · exit 2 = deploy ล้ม/ใช้งานผิด
// กติกา/เกณฑ์อยู่ที่ lib/perf-check.ts (ใช้ร่วมกับตัวตรวจรายวัน /api/cron/perf-watch) · คู่มือ docs/perf-check.md · ต้องใช้ Node 22.18+
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "weerapeace/erp-platform-playground";
const PROD_BRANCH = "feat/host-portable";
const MAX_PAGES = 15;

const P = await import(pathToFileURL(join(ROOT, "lib/perf-check.ts")).href);
const W = await import(pathToFileURL(join(ROOT, "scripts/where-used.mjs")).href);

// Git Bash บน Windows แปลง "/purchasing" เป็น "C:/Program Files/Git/purchasing" เอง → แปลงกลับ
const unMsys = (a) => { const m = /^[A-Za-z]:[\\/](?:Program Files[\\/])?Git[\\/](.*)$/i.exec(a); return m ? "/" + m[1].replace(/\\/g, "/") : a; };
const argv = process.argv.slice(2).map(unMsys);
const flag = (f) => argv.includes(f);
const optVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const BASE_URL = (optVal("--url") ?? P.PERF_PROD_URL).replace(/\/$/, "");
const IS_PROD = BASE_URL === P.PERF_PROD_URL;
const JSON_OUT = flag("--json");
const VERBOSE = flag("--verbose");
const valueOpts = new Set([optVal("--url"), optVal("--base")].filter(Boolean));
const positional = argv.filter((a) => !a.startsWith("--") && !valueOpts.has(a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];

if (!positional.length && !flag("--changed") && !flag("--key") && !flag("--db")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 12).map((l) => l.slice(3)).join("\n"));
  process.exit(2);
}

/* ───────── ฐานข้อมูล (ค่าฐาน) ───────── */
async function db() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return null;
  const env = { ...process.env };
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "").replace(/^﻿/, "").trim();
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/* ───────── รอพ้นช่วงหลัง deploy ───────── */
function latestDeploy() {
  try {
    const out = execFileSync("gh", ["api", `repos/${REPO}/commits/${PROD_BRANCH}/statuses?per_page=20`, "--jq", '[.[] | select(.context=="Vercel")][0] | "\\(.state)\\t\\(.updated_at)"'],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }).trim();
    if (!out || out === "null") return { state: "pending", at: null };
    const [state, at] = out.split("\t");
    return { state, at };
  } catch {
    return null;
  }
}

async function waitForDeploy() {
  if (!IS_PROD || flag("--no-wait")) return;
  const until = Date.now() + 10 * 60_000;
  let said = false;
  for (;;) {
    const d = latestDeploy();
    if (!d) { notes.push("เช็กสถานะ deploy ไม่ได้ (gh) — วัดเลยโดยไม่รอ"); return; }
    if (d.state === "failure" || d.state === "error") { console.log(`❌ deploy ล่าสุดล้ม (${d.state}) — แก้ deploy ก่อน แล้วค่อยวัดความเร็ว`); process.exit(2); }
    if (d.state === "success" && d.at) {
      const wait = Date.parse(d.at) + P.PERF_LIMITS.postDeployWaitSec * 1000 - Date.now();
      if (wait <= 0) return;
      if (!JSON_OUT) console.log(`⏳ รอพ้นช่วงหลัง deploy อีก ${Math.ceil(wait / 1000)} วิ (ฐานข้อมูลช้าทั้งระบบช่วงนี้)`);
      await sleep(wait + 2000);
      return;
    }
    if (Date.now() > until) { notes.push("deploy ยังไม่เสร็จหลังรอ 10 นาที — วัดของที่ขึ้นอยู่ตอนนี้"); return; }
    if (!said && !JSON_OUT) { console.log("⏳ deploy ยังไม่เสร็จ รอก่อน…"); said = true; }
    await sleep(20_000);
  }
}

/* ───────── ไฟล์ที่แก้ → หน้าที่ต้องวัด ───────── */
function git(args) {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/).filter(Boolean); }
  catch { return []; }
}

function changedFiles() {
  const base = optVal("--base") ?? "HEAD~1";
  return [...new Set([...git(["diff", "--name-only", base, "HEAD"]), ...git(["diff", "--name-only", "HEAD"]), ...git(["ls-files", "--others", "--exclude-standard"])])];
}

function targetsFromFiles(files) {
  const proj = W.loadProject(ROOT);
  const pages = new Set(), apis = new Set();
  let hub = null;
  const norm = files.map((f) => f.replace(/\\/g, "/").replace(/^\.\//, ""));
  const missing = norm.filter((f) => /^(app|components|lib)\//.test(f) && /\.tsx?$/.test(f) && !proj.fileSet.has(f) && !existsSync(join(ROOT, f)));
  if (missing.length && !flag("--changed")) notes.push(`ไม่พบไฟล์: ${missing.slice(0, 3).join(", ")}`);
  const src = norm.filter((f) => /^(app|components|lib)\/.*\.tsx?$/.test(f) && !/__tests__|\.test\.tsx?$/.test(f) && proj.fileSet.has(f));
  const noteHub = (r) => { for (const h of r.hubs) if (!hub || h.pages > hub.pages) hub = h; };
  const others = [];
  for (const f of src) {
    if (W.isPage(f)) pages.add(W.urlOf(f));
    else if (W.isApi(f)) {
      const url = W.urlOf(f);
      apis.add(url);
      const re = W.apiCallRe(url);
      for (const c of proj.files) {
        if (c === f || W.isApi(c) || !re.test(proj.text.get(c))) continue;
        if (W.isPage(c)) pages.add(W.urlOf(c));
        else others.push(c);
      }
    } else others.push(f);
  }
  if (others.length) {
    const r = W.analyzeFiles(proj, [...new Set(others)]);
    for (const p of r.pages) pages.add(p.url);
    for (const a of r.apis) apis.add(a.url);
    noteHub(r);
  }
  if (hub) {
    notes.push(`แก้ของกลางที่ใช้ ~${hub.pages} หน้า (${hub.file}) → วัดหน้าหลักแทน`);
    for (const p of P.PERF_KEY_PAGES) pages.add(p);
  }
  if (src.length && !pages.size && !apis.size) notes.push("ไฟล์ที่แก้ไม่ขึ้นหน้าไหนโดยตรง (เช่น สคริปต์/เทสต์/ของฝั่งเซิร์ฟเวอร์) — ไม่มีหน้าให้วัด");
  return { pages: [...pages], apis: [...apis] };
}

/* ───────── main ───────── */
let pageList = [], apiList = [];
if (flag("--key")) pageList.push(...P.PERF_KEY_PAGES);
const fileArgs = positional.filter((a) => !a.startsWith("/"));
pageList.push(...positional.filter((a) => a.startsWith("/") && !a.startsWith("/api/")));
apiList.push(...positional.filter((a) => a.startsWith("/api/")));
const files = [...fileArgs, ...(flag("--changed") ? changedFiles() : [])];
if (files.length) { const t = targetsFromFiles(files); pageList.push(...t.pages); apiList.push(...t.apis); }

const skipped = [];
const uniq = (a) => [...new Set(a)];
pageList = uniq(pageList).filter((p) => (P.isMeasurablePath(p) ? true : (skipped.push(`${p} (มีพารามิเตอร์)`), false)));
apiList = uniq(apiList).filter((p) => (P.isMeasurablePath(p) ? true : (skipped.push(`${p} (มีพารามิเตอร์)`), false)));
// หน้าหลักมาก่อน แล้วตัดที่ MAX_PAGES
pageList.sort((a, b) => Number(!P.PERF_KEY_PAGES.includes(a)) - Number(!P.PERF_KEY_PAGES.includes(b)) || a.localeCompare(b));
if (pageList.length > MAX_PAGES) { notes.push(`กระทบ ${pageList.length} หน้า วัด ${MAX_PAGES} หน้าแรก (ระบุหน้าเองได้)`); pageList = pageList.slice(0, MAX_PAGES); }
apiList = apiList.slice(0, 10);

const sb = await db();
if (!sb) notes.push("ไม่มี .env.local (กุญแจฐานข้อมูล) → วัดอย่างเดียว เทียบค่าฐานไม่ได้");

await waitForDeploy();

const ping = await P.measurePing(BASE_URL);
const systemSlow = ping == null || ping > P.PERF_LIMITS.pingSlowMs;

const targets = [...pageList.map((p) => ({ path: p, kind: "page" })), ...apiList.map((p) => ({ path: p, kind: "api" }))];
const useBaseline = IS_PROD && !!sb;
const baselines = new Map();
if (useBaseline && targets.length) {
  const { data, error } = await sb.from("ui_config").select("key, value").in("key", targets.map((t) => P.perfBaselineKey(t.path)));
  if (error) notes.push(`อ่านค่าฐานไม่ได้: ${error.message}`);
  for (const r of data ?? []) { const b = P.parseBaseline(r.value); if (b) baselines.set(r.key.slice(P.PERF_BASELINE_PREFIX.length), b); }
}

const cache = new Map();
const results = [];
for (const t of targets) {
  const s = await P.measurePath(BASE_URL, t.path, t.kind, { cache });
  const b = useBaseline ? baselines.get(t.path) : null;
  const v = P.judgeSample(s, b, { source: "local", systemSlow });
  results.push({ s, v, b });
}

// จดค่าฐาน (เฉพาะหน้าที่ปกติ หรือสั่งยอมรับ)
let saved = 0;
if (useBaseline && !flag("--no-save")) {
  const now = new Date().toISOString();
  const rows = [];
  for (const r of results) {
    const nb = P.nextBaseline(r.b, r.s, r.v, { source: "local", accept: flag("--accept"), systemSlow, now });
    if (nb) rows.push({ key: P.perfBaselineKey(r.s.path), value: nb, updated_at: now });
  }
  if (rows.length) {
    const { error } = await sb.from("ui_config").upsert(rows, { onConflict: "key" });
    if (error) notes.push(`จดค่าฐานไม่ได้: ${error.message}`); else saved = rows.length;
  }
}

// คำสั่งฐานข้อมูลที่ช้าขึ้น (ไม่ขยับรอบของตัวตรวจรายวัน)
let dbFlags = null, dbSince = null;
if (flag("--db")) {
  if (!sb) notes.push("ดูฝั่งฐานข้อมูลไม่ได้ — ไม่มี .env.local");
  else {
    const { data, error } = await sb.rpc("erp_perf_query_delta", { p_commit: false });
    if (error) notes.push(`อ่านสถิติฐานข้อมูลไม่ได้: ${error.message}`);
    else { dbSince = data?.prev_at ?? null; dbFlags = dbSince ? P.judgeDbRows(data?.rows ?? []) : null; if (!dbSince) notes.push("ฐานข้อมูล: ยังไม่มีรอบเทียบ (ตัวตรวจรายวันยังไม่เคยเก็บ)"); }
  }
}

/* ───────── พิมพ์ผล ───────── */
const count = (lv) => results.filter((r) => r.v.level === lv).length;
const bad = results.filter((r) => r.v.level === "warn" || r.v.level === "slow");
for (const r of results) if (r.v.level === "skip") skipped.push(`${r.s.path} (${r.v.reasons[0] ?? "ข้าม"})`);

if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE_URL, ping, systemSlow, results: results.map((r) => ({ ...r.s, level: r.v.level, reasons: r.v.reasons, jsBase: r.v.jsBase, msBase: r.v.msBase })), skipped, saved, db: dbFlags, notes }, null, 2));
} else {
  const health = ping == null ? "เช็กระบบไม่ได้" : systemSlow ? `🐢 ระบบช้าทั้งก้อน (ping ${P.fmtSec(ping)}) — ไม่ตัดสินเวลา วัดใหม่ทีหลัง` : `ระบบปกติ (ping ${P.fmtSec(ping)})`;
  const tally = [["✅", count("ok")], ["🆕", count("new")], ["⚠️", count("warn")], ["🐢", count("slow")]].filter(([, n]) => n).map(([i, n]) => `${i} ${n}`).join(" · ");
  const measured = results.length - results.filter((r) => r.v.level === "skip").length;
  console.log(`⚡ perf-check · วัด ${measured} รายการ · ${health}${tally ? ` · ${tally}` : ""}${!IS_PROD ? ` · ที่ ${BASE_URL}` : ""}`);
  for (const r of results) {
    const lv = r.v.level;
    if (lv === "warn" || lv === "slow" || (VERBOSE && lv !== "skip")) console.log(P.formatSampleLine(r.s, r.v));
  }
  if (!VERBOSE) {
    const okList = results.filter((r) => r.v.level === "ok").map((r) => r.s.path);
    const newList = results.filter((r) => r.v.level === "new").map((r) => `${r.s.path} ${P.fmtKB(r.s.jsKB)}${r.v.reasons.length ? " (หนักเกินเพดาน)" : ""}`);
    if (okList.length) console.log(`✅ ปกติ: ${okList.join(", ")}`);
    if (newList.length) console.log(`🆕 ยังไม่มีค่าฐาน${saved ? " (จดเป็นค่าแรกแล้ว)" : ""}: ${newList.join(", ")}`);
  }
  if (skipped.length) {
    // รวมตามเหตุผล กันบรรทัดยาว (ประหยัด token): "ต้องล็อกอิน 9 (/api/a, /api/b, …)"
    const groups = new Map();
    for (const x of skipped) {
      const m = /^(\S+) \((.*)\)$/.exec(x);
      const why = (m?.[2] ?? "ข้าม").split(" — ")[0];
      if (!groups.has(why)) groups.set(why, []);
      groups.get(why).push(m?.[1] ?? x);
    }
    console.log(`⏭️ ข้าม ${skipped.length}: ${[...groups].map(([why, ps]) => `${why} ${ps.length} (${ps.slice(0, 2).join(", ")}${ps.length > 2 ? ", …" : ""})`).join(" · ")}`);
  }
  if (dbFlags) {
    if (!dbFlags.length) console.log(`🗄️ ฐานข้อมูล: ไม่มีคำสั่งที่ช้าขึ้นตั้งแต่ ${dbSince.slice(0, 16).replace("T", " ")} UTC`);
    else for (const f of dbFlags.slice(0, 5)) console.log(`🗄️ ${P.queryLabel(f.query)} — ${f.why}`);
  }
  if (flag("--accept") && saved) console.log(`📌 ยอมรับเป็นค่าฐานใหม่ ${saved} รายการ`);
  if (bad.length) console.log("→ ช้าลง/โตเกินเกณฑ์: หาสาเหตุแล้วแก้ ถ้าตั้งใจให้หนักขึ้น บอกเจ้าของก่อน (เจ้าของตกลงแล้วจึงรันซ้ำด้วย --accept)");
  for (const n of notes) console.log(`ℹ️ ${n}`);
}
process.exit(bad.length ? 1 : 0);
