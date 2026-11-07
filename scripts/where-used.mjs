// 🔎 ตัวเช็ก "ใครใช้บ้าง" — ก่อนแก้ workflow / ของกลาง ให้รันก่อน แล้วเอารายการไปบอกเจ้าของในแผน
//
//   npm run where-used                       → สรุปทุก workflow ในทะเบียน (lib/workflow-registry.ts)
//   npm run where-used -- mo-production      → workflow เดียว (ใช้ key)
//   npm run where-used -- mo-dispatch        → หา workflow จากชื่อไฟล์กติกา
//   npm run where-used -- lib/po-total.ts    → ไฟล์ไหนก็ได้ (ไม่ต้องอยู่ในทะเบียน)
//   เพิ่ม --all = โชว์ทุกรายการ (ปกติตัดที่ 15) · --json = ผลแบบเครื่องอ่าน
//
// ไล่จากโค้ดจริงทุกครั้ง (ไม่จดมือ): import ตรง → import ต่อทอด → หน้าเว็บที่เรียก API นั้น
// ข้อจำกัด: หา URL API ที่ต่อสตริงแบบ "/api/x/" + id ไม่เจอ (เจอเฉพาะ "..." / `...${id}...`)
// ต้องใช้ Node 22.18+ (อ่านไฟล์ .ts ได้เอง)
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIRS = ["app", "components", "lib"];
const EXTS = [".ts", ".tsx"];
const LIMIT = 15;

const norm = (p) => p.replace(/\\/g, "/");
const rel = (abs) => norm(relative(ROOT, abs));

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.some((e) => name.endsWith(e)) && !/\.test\.tsx?$/.test(name)) out.push(rel(p));
  }
  return out;
}

function resolveImport(fromFile, spec, fileSet) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = norm(join(dirname(fromFile), spec));
  else return null;
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) if (fileSet.has(c)) return c;
  return null;
}

/** โหลดโค้ดทั้งโปรเจกต์ครั้งเดียว: เนื้อไฟล์ + ใคร import ใคร (กลับด้าน) */
export function loadProject(root = ROOT) {
  const files = SRC_DIRS.flatMap((d) => walk(join(root, d), []));
  const fileSet = new Set(files);
  const text = new Map();
  const importers = new Map();   // ไฟล์ → ไฟล์ที่ import มัน
  const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
  for (const f of files) {
    const t = readFileSync(join(root, f), "utf8");
    text.set(f, t);
    for (const m of t.matchAll(IMPORT_RE)) {
      const to = resolveImport(f, m[1], fileSet);
      if (!to || to === f) continue;
      if (!importers.has(to)) importers.set(to, new Set());
      importers.get(to).add(f);
    }
  }
  return { root, files, fileSet, text, importers, labels: loadMenuLabels(root) };
}

/** ชื่อเมนูภาษาไทยจากแถบเมนู (components/playground-shell.tsx) — href → ชื่อ */
function loadMenuLabels(root) {
  const p = join(root, "components/playground-shell.tsx");
  const out = new Map();
  if (!existsSync(p)) return out;
  for (const m of readFileSync(p, "utf8").matchAll(/href:\s*"([^"]+)"[^}]*?labelTH:\s*"([^"]+)"/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].replace(/[⭐️]/gu, "").trim());
  }
  return out;
}

const isPage = (f) => /^app\/.*\/?page\.tsx?$/.test(f);
const isApi = (f) => /^app\/api\/.*\/route\.ts$/.test(f);

/** ไฟล์ → URL (ตัดกลุ่ม (xxx) ออก) */
function urlOf(f) {
  const u = "/" + f.replace(/^app\/?/, "").replace(/\/?(page|route)\.tsx?$/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
  return u === "/" ? "/" : u.replace(/\/$/, "");
}

/** ชื่อหน้าภาษาคน: เมนูตรงตัว → หัวข้อ <h1>/metadata ในไฟล์หน้า → เมนูแม่ › ส่วนท้าย URL */
function labelOf(proj, url, file) {
  if (proj.labels.has(url)) return proj.labels.get(url);
  const t = proj.text.get(file) ?? "";
  const m = t.match(/<h1[^>]*>\s*([^<{]*[ก-๙][^<{]*)/) ?? t.match(/metadata[^}]*title:\s*"([^"]*[ก-๙][^"]*)"/);
  if (m) return m[1].replace(/\s+/g, " ").trim();
  let best = null;
  for (const [href, label] of proj.labels) {
    if (url.startsWith(href + "/") && (!best || href.length > best[0].length)) best = [href, label];
  }
  return best ? `${best[1]} › ${url.slice(best[0].length + 1)}` : null;
}

/** ไล่ย้อน import แบบไม่หยุด → จำนวนหน้าที่ไฟล์นี้ไปโผล่ (จำไว้ ไม่คิดซ้ำ) */
function pageCount(proj, f) {
  proj.pageCountCache ??= new Map();
  if (proj.pageCountCache.has(f)) return proj.pageCountCache.get(f);
  const seen = new Set([f]); const queue = [f]; let n = 0;
  while (queue.length) {
    for (const imp of proj.importers.get(queue.shift()) ?? []) {
      if (seen.has(imp)) continue;
      seen.add(imp); queue.push(imp);
      if (isPage(imp)) n++;
    }
  }
  proj.pageCountCache.set(f, n);
  return n;
}

// ของกลางที่ใช้ทั่วระบบ (เช่น ตารางกลาง master-crud) — ถ้าไล่ทะลุไปจะได้ "ทุกหน้า" ซึ่งไม่ช่วยตัดสินใจ
// → หยุดที่ไฟล์นี้ แล้วรายงานรวบเป็นบรรทัดเดียว "ขึ้นผ่านของกลาง X (~N หน้า)"
const HUB_PAGES = 30;
const isHub = (proj, f) => !isPage(f) && !isApi(f) && pageCount(proj, f) > HUB_PAGES;

/** ไล่ย้อน import: ทุกไฟล์ที่พึ่ง targets (ตรง/ต่อทอด) → via: ไฟล์ → ผ่านไฟล์ไหน · hubs: ของกลางทั่วระบบที่หยุดไว้ → มาจากไฟล์ไหน */
function reverseReach(proj, targets) {
  const via = new Map();
  const hubs = new Map();
  const queue = [...targets];
  for (const t of targets) via.set(t, null);
  while (queue.length) {
    const cur = queue.shift();
    for (const imp of proj.importers.get(cur) ?? []) {
      if (via.has(imp) || hubs.has(imp)) continue;
      if (isHub(proj, imp)) { hubs.set(imp, cur); continue; }
      via.set(imp, cur);
      queue.push(imp);
    }
  }
  for (const t of targets) via.delete(t);
  return { via, hubs };
}

function apiCallRe(url) {
  const parts = url.split("/").map((s) => (/^\[.*\]$/.test(s) ? "(?:\\$\\{[^}]*\\}|[^/\"'`?\\s]+)" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp(parts.join("\\/") + "(?=[\"'`?#])");
}

/** วิเคราะห์ว่าใครใช้ไฟล์กติกาชุดนี้ */
export function analyzeFiles(proj, ruleFiles, { tables = [], signals = [] } = {}) {
  const targets = ruleFiles.filter((f) => proj.fileSet.has(f));
  const missing = ruleFiles.filter((f) => !proj.fileSet.has(f));
  const { via: reach, hubs: hubFrom } = reverseReach(proj, targets);

  const apis = [...reach.keys()].filter(isApi).sort();
  const pages = new Map();   // page → เหตุผล
  const addPage = (p, why) => { if (!pages.has(p)) pages.set(p, new Set()); pages.get(p).add(why); };
  for (const f of reach.keys()) if (isPage(f)) addPage(f, "ใช้ตรง");
  const hubs = new Map();    // ของกลางทั่วระบบ → มาจากไฟล์ไหน
  for (const [h, from] of hubFrom) hubs.set(h, new Set([from]));

  // หน้าที่เรียก API เหล่านั้น (ผ่าน component ต่อทอดก็นับ)
  for (const api of apis) {
    const url = urlOf(api);
    const re = apiCallRe(url);
    const callers = proj.files.filter((f) => f !== api && !isApi(f) && re.test(proj.text.get(f)));
    for (const c of callers) {
      if (isHub(proj, c)) { if (!hubs.has(c)) hubs.set(c, new Set()); hubs.get(c).add(url); continue; }
      if (isPage(c)) addPage(c, url);
      const up = reverseReach(proj, [c]);
      for (const f of up.via.keys()) if (isPage(f)) addPage(f, url);
      for (const h of up.hubs.keys()) { if (!hubs.has(h)) hubs.set(h, new Set()); hubs.get(h).add(url); }
    }
  }
  const components = [...reach.keys()].filter((f) => !isPage(f) && !isApi(f)).sort();

  // แตะข้อมูลของ workflow นี้เอง (อ่านตาราง/คอลัมน์ตรง ๆ) — ไม่ใช่ไฟล์กติกา
  const pats = [
    ...tables.map((t) => ({ name: t, re: new RegExp(`["'\`]${t}["'\`]`, "g") })),
    ...signals.map((s) => ({ name: s, re: new RegExp(`\\b${s}\\b`, "g") })),
  ];
  const touches = [];
  if (pats.length) {
    const ruleSet = new Set(targets);
    for (const f of proj.files) {
      if (ruleSet.has(f) || f === "lib/workflow-registry.ts") continue;
      const t = proj.text.get(f);
      const hits = {};
      for (const p of pats) { const n = (t.match(p.re) ?? []).length; if (n) hits[p.name] = n; }
      if (!Object.keys(hits).length) continue;
      const direct = targets.some((r) => proj.importers.get(r)?.has(f));
      const sig = signals.reduce((n, s) => n + (hits[s] ?? 0), 0);
      touches.push({ file: f, hits, usesRule: direct, viaRule: !direct && reach.has(f), signalHits: sig });
    }
    touches.sort((a, b) => Number(a.usesRule) - Number(b.usesRule) || b.signalHits - a.signalHits || a.file.localeCompare(b.file));
  }

  return {
    missing,
    pages: [...pages.entries()].map(([f, why]) => ({ file: f, url: urlOf(f), label: labelOf(proj, urlOf(f), f), via: [...why] }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    apis: apis.map((f) => ({ file: f, url: urlOf(f) })),
    hubs: [...hubs.entries()].map(([file, from]) => ({ file, pages: pageCount(proj, file), from: [...from] }))
      .sort((a, b) => b.pages - a.pages),
    components,
    touches,
  };
}

/* ───────────── แสดงผล ───────────── */
const cut = (arr, all) => (all ? arr : arr.slice(0, LIMIT));
const more = (arr, all) => (!all && arr.length > LIMIT ? `   … อีก ${arr.length - LIMIT} รายการ (เพิ่ม --all เพื่อดูทั้งหมด)\n` : "");

function printReport(title, def, r, all, registry) {
  let s = `\n🗺️  ${title}\n`;
  if (def) {
    s += `   เส้นทาง: ${def.flow}\n`;
    s += `   ไฟล์กติกากลาง: ${def.ruleFiles.join(" · ")}\n`;
  }
  if (r.missing.length) s += `   ⚠️ ไฟล์กติกาในทะเบียนหาไม่เจอ: ${r.missing.join(", ")}\n`;

  s += `\n ① หน้าจอที่กระทบ (${r.pages.length})\n`;
  for (const p of cut(r.pages, all)) {
    const via = p.via.filter((v) => v !== "ใช้ตรง");
    s += `   • ${p.label ? `${p.label}  ` : ""}${p.url}${via.length ? `   ← ผ่าน ${via.join(", ")}` : ""}\n`;
  }
  s += more(r.pages, all);
  for (const h of r.hubs) s += `   • + ขึ้นผ่านของกลางที่ใช้ทั่วระบบ ${h.file} (~${h.pages} หน้า)   ← จาก ${h.from.join(", ")}\n`;

  s += `\n ② API ที่ใช้กติกานี้ (${r.apis.length})\n`;
  for (const a of cut(r.apis, all)) s += `   • ${a.url}\n`;
  s += more(r.apis, all);

  if (r.components.length) {
    s += `\n ③ ของกลาง / component ที่ใช้ต่อ (${r.components.length})\n`;
    for (const c of cut(r.components, all)) s += `   • ${c}\n`;
    s += more(r.components, all);
  }

  if (def?.gates?.length) s += `\n ④ ประตูเปลี่ยนสถานะ (API ที่บันทึกสถานะจริง)\n${def.gates.map((g) => `   • ${urlOf(g)}`).join("\n")}\n`;

  const own = r.touches.filter((t) => !t.usesRule);
  if (own.length) {
    s += `\n ⑤ ⚠️ แตะข้อมูลของ workflow นี้เอง โดยไม่เรียกไฟล์กติกา (${own.length}) — ควรตรวจว่าคิดกติกาเองไหม\n`;
    for (const t of cut(own, all)) s += `   • ${t.file}  (${Object.entries(t.hits).map(([k, n]) => `${k}×${n}`).join(", ")})${t.viaRule ? "  · ใช้ของกลางทางอ้อมด้วย" : ""}\n`;
    s += more(own, all);
  }

  if (def?.gaps?.length) s += `\n ⑥ ยังไม่เป็นของกลาง\n${def.gaps.map((g) => `   • ${g}`).join("\n")}\n`;
  if (def?.logicIds?.length) s += `\n ⑦ กติกาธุรกิจที่เกี่ยวข้อง (หน้า /master/logic): ${def.logicIds.join(", ")}\n`;
  if (def?.feeds?.length) {
    const names = def.feeds.map((k) => registry.find((w) => w.key === k)?.label ?? k);
    s += `\n ⑧ workflow ที่ใช้ผลของตัวนี้ (แก้ตัวนี้กระทบด้วย): ${def.feeds.map((k, i) => `${names[i]} [${k}]`).join(" · ")}\n`;
  }
  return s;
}

async function loadRegistry() {
  try {
    return await import(pathToFileURL(join(ROOT, "lib/workflow-registry.ts")).href);
  } catch (e) {
    console.error("อ่าน lib/workflow-registry.ts ไม่ได้ — ต้องใช้ Node 22.18 ขึ้นไป (ตอนนี้ " + process.version + ")\n" + e.message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const json = args.includes("--json");
  const q = args.find((a) => !a.startsWith("--"));
  const { WORKFLOWS, findWorkflows } = await loadRegistry();
  const proj = loadProject();

  if (!q) {
    const rows = WORKFLOWS.map((w) => {
      const r = analyzeFiles(proj, w.ruleFiles, w);
      return { key: w.key, label: w.label, pages: r.pages.length, hubs: r.hubs.length, apis: r.apis.length, own: r.touches.filter((t) => !t.usesRule).length, gaps: w.gaps?.length ?? 0, missing: r.missing };
    });
    if (json) return console.log(JSON.stringify(rows, null, 2));
    console.log("\n🗺️  ทะเบียน workflow กลาง — ใครใช้บ้าง (lib/workflow-registry.ts)\n");
    for (const r of rows) {
      console.log(`  ${r.label} [${r.key}]\n     หน้าจอ ${r.pages}${r.hubs ? ` (+ ผ่านของกลางทั่วระบบ ${r.hubs})` : ""} · API ${r.apis} · แตะข้อมูลเอง ${r.own}${r.gaps ? ` · ยังไม่เป็นของกลาง ${r.gaps} ข้อ` : ""}${r.missing.length ? ` · ⚠️ หาไฟล์ไม่เจอ ${r.missing.length}` : ""}`);
    }
    console.log("\n  ดูละเอียด: npm run where-used -- <key>   เช่น  npm run where-used -- mo-production\n");
    return;
  }

  const defs = findWorkflows(q);
  if (defs.length) {
    for (const d of defs) {
      const r = analyzeFiles(proj, d.ruleFiles, d);
      if (json) console.log(JSON.stringify({ key: d.key, ...r }, null, 2));
      else console.log(printReport(`${d.label} [${d.key}]`, d, r, all, WORKFLOWS));
    }
    return;
  }

  // ไฟล์ทั่วไปที่ไม่อยู่ในทะเบียน
  const file = norm(q).replace(/^\.\//, "");
  const target = [file, ...EXTS.map((e) => file + e), ...EXTS.map((e) => `${file}/index${e}`), ...EXTS.map((e) => `lib/${file}${e}`)].find((c) => proj.fileSet.has(c));
  if (!target) {
    console.error(`ไม่เจอ "${q}" ในทะเบียน workflow หรือในโค้ด — key ที่มี: ${WORKFLOWS.map((w) => w.key).join(", ")}`);
    process.exit(1);
  }
  const r = analyzeFiles(proj, [target]);
  if (json) console.log(JSON.stringify({ file: target, ...r }, null, 2));
  else console.log(printReport(`${target}  (ไม่อยู่ในทะเบียน workflow)`, null, r, all, WORKFLOWS));
}

// ใช้ต่อในสคริปต์อื่น (เช่น scripts/perf-check.mjs แปลง "ไฟล์ที่แก้" → หน้าที่ต้องวัด)
export { urlOf, isPage, isApi, apiCallRe, pageCount };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
