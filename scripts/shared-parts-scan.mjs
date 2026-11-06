// ตัวนับ "ของกลางแต่ละตัวถูกใช้ที่ไหนบ้าง" — อ่านจากโค้ดจริง แล้วเขียนผลลง lib/shared-parts-usage.json
//
//   npm run parts:scan        → นับใหม่ (รันเองอัตโนมัติก่อน build ทุกครั้งผ่าน "prebuild" = นับใหม่ทุกครั้งที่ขึ้นเว็บ)
//
// หน้า /admin/plugins อ่านผลนี้ คู่กับทะเบียน lib/shared-parts-registry.ts (ชื่อ · ใช้ทำอะไร · กลุ่มงานเดียวกัน)
// - นับ import ตรง: ไฟล์ไหน import ของกลางตัวนั้น (ไม่นับไฟล์ข้างในตัวเอง · ไม่นับเทสต์ · หน้าทดลอง app/_demos แยกนับ)
// - source ที่มี names (เช่น components/pickers รวมหลายตัว) → นับเฉพาะไฟล์ที่ import ชื่อนั้น
// - ชิ้นส่วนทุกตัวใน components/ ถูกนับด้วย → หน้าเว็บโชว์ "ยังไม่ลงทะเบียน"
// ⚠️ อ่านทะเบียนด้วย regex (ไม่ import ไฟล์ .ts) — Node บนเครื่อง build ไม่ต้องอ่าน TypeScript ได้
// ⚠️ ห้ามทำให้ build ล้ม: ถ้านับพลาด ให้เก็บไฟล์ผลเดิมไว้แล้วจบแบบปกติ
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "lib/shared-parts-usage.json";
const REGISTRY = "lib/shared-parts-registry.ts";
const EXTS = [".ts", ".tsx"];
const PLACE_CAP = 40;       // เก็บรายชื่อที่ใช้ของแต่ละตัวไม่เกินนี้
const UNIT_PLACE_CAP = 8;   // ชิ้นส่วนที่ยังไม่ลงทะเบียน เก็บสั้นกว่า

const norm = (p) => p.replace(/\\/g, "/");
const isTest = (f) => /\.test\.tsx?$/.test(f) || f.includes("/__tests__/");
const isDemo = (f) => f.startsWith("app/_demos/");
const isPage = (f) => /^app\/(.*\/)?page\.tsx?$/.test(f);
const isApi = (f) => /^app\/api\/.*route\.tsx?$/.test(f);

function walk(root, dir, out) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name === ".next") continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(rel);
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

/** ชื่อที่ import ในวงเล็บปีกกา · null = ใช้ทั้งไฟล์ (default / * as / dynamic import) */
function namesOf(clause) {
  if (clause == null) return null;
  const brace = clause.match(/\{([^}]*)\}/);
  const outside = clause.replace(/\{[^}]*\}/, "").replace(/^type\s+/, "").replace(/[\s,]/g, "");
  if (!brace || outside) return null;   // มี default หรือ * as ns ด้วย = นับว่าใช้ทั้งไฟล์
  return new Set(brace[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim()).filter(Boolean));
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?([^;"'`]*?)\s*from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function urlOfDir(f) {
  const segs = f.replace(/^app\/?/, "").split("/");
  segs.pop();
  return "/" + segs.filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
}

/** ข้อความหัวไฟล์ (บรรทัดคำอธิบายแรก ๆ) — ตัดอีโมจิออก */
function headerOf(text) {
  const out = [];
  for (const line of text.split(/\r?\n/).slice(0, 30)) {
    const s = line.trim();
    if (!s || /^["']use (client|server)["'];?$/.test(s)) { if (out.length) break; continue; }
    const m = s.match(/^(?:\/\/+|\/\*+|\*)\s?(.*?)(?:\*\/)?$/);
    if (!m) break;
    const body = m[1].replace(/\p{Extended_Pictographic}|️/gu, "").replace(/^[-=─━*\s]+$/, "").trim();
    // บรรทัดตัวอย่างโค้ด (<Tag …> · const x = · import) = จบคำอธิบาย
    if (out.length && /<[A-Za-z]|\b(const|let|import|export|return)\s|=>|^[{}()[\]]/.test(body)) break;
    if (body) out.push(body);
    if (out.join(" ").length > 160) break;
  }
  const d = out.join(" ").replace(/\s+/g, " ").trim();
  return d.length > 180 ? d.slice(0, 177) + "…" : d;
}

/** อ่าน source ทั้งหมดในทะเบียน (ช่วง SHARED_PARTS เท่านั้น) */
export function readRegistrySources(root = ROOT_DEFAULT) {
  const t = readFileSync(join(root, REGISTRY), "utf8");
  const start = t.indexOf("export const SHARED_PARTS");
  const end = t.indexOf("export function sourceId");
  const body = t.slice(start, end > start ? end : undefined);
  const out = [];
  for (const m of body.matchAll(/source:\s*\{\s*path:\s*"([^"]+)"(?:,\s*names:\s*\[([^\]]*)\])?\s*\}/g)) {
    const names = m[2] ? [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : undefined;
    out.push({ path: m[1], names });
  }
  return out;
}

export const sourceId = (s) => (s.names?.length ? `${s.path}#${[...s.names].sort().join(",")}` : s.path);

export function scanSharedParts(root = ROOT_DEFAULT) {
  const files = ["app", "components", "lib"].flatMap((d) => walk(root, d, [])).filter((f) => !isTest(f));
  const fileSet = new Set(files);
  const text = new Map(files.map((f) => [f, readFileSync(join(root, f), "utf8")]));
  const pageUrls = new Set(files.filter(isPage).map(urlOfDir));

  // ใคร import ใคร (กลับด้าน) + ชื่อที่ import
  const importers = new Map();   // target file → Map(importer → Set(names) | null)
  for (const f of files) {
    for (const m of text.get(f).matchAll(IMPORT_RE)) {
      const spec = m[2] ?? m[3];
      const to = resolveImport(f, spec, fileSet);
      if (!to || to === f) continue;
      const names = m[3] ? null : namesOf(m[1]);
      if (!importers.has(to)) importers.set(to, new Map());
      const cur = importers.get(to);
      if (!cur.has(f)) cur.set(f, names);
      else if (cur.get(f) && names) for (const n of names) cur.get(f).add(n);
      else cur.set(f, null);
    }
  }

  const filesOf = (path) => {
    const single = EXTS.map((e) => path + e).find((c) => fileSet.has(c));
    return single ? [single] : files.filter((f) => f.startsWith(path + "/"));
  };
  const placeOf = (f) => {
    if (f.startsWith("app/api/")) return { label: "API " + urlOfDir(f), kind: "api" };
    if (f.startsWith("app/")) {
      const u = urlOfDir(f);
      return { label: u, href: pageUrls.has(u) && !u.includes("[") ? u : null, kind: "page" };
    }
    const m = f.match(/^(components|lib)\/([^/]+?)(?:\.tsx?)?(?:\/|$)/);
    if (m) return { label: m[1] === "lib" ? `lib/${m[2]}` : m[2], kind: m[1] === "lib" ? "lib" : "component" };
    return { label: f, kind: "other" };
  };

  function usageOf(path, names, cap) {
    const own = new Set(filesOf(path));
    const users = new Set();
    let demo = 0;
    const demoSet = new Set();
    for (const target of own) {
      for (const [imp, impNames] of importers.get(target) ?? []) {
        if (own.has(imp) || imp.startsWith(path + "/")) continue;
        if (names && impNames && !names.some((n) => impNames.has(n))) continue;
        if (isDemo(imp)) { demoSet.add(imp); continue; }
        users.add(imp);
      }
    }
    demo = demoSet.size;
    const places = new Map();
    for (const f of [...users].sort()) {
      const p = placeOf(f);
      if (!places.has(p.label)) places.set(p.label, p);
    }
    // หน้าเว็บก่อน แล้วชิ้นส่วน / lib / API
    const order = { page: 0, component: 1, lib: 2, api: 3, other: 4 };
    const list = [...places.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label));
    return { files: users.size, demo, placeCount: list.length, places: list.slice(0, cap) };
  }

  const regSources = readRegistrySources(root);
  const sources = {};
  for (const s of regSources) sources[sourceId(s)] = usageOf(s.path, s.names, PLACE_CAP);

  // ชิ้นส่วนใน components/ (ระดับบนสุด) ที่ยังไม่ลงทะเบียน → แท็บ "ยังไม่ลงทะเบียน"
  const registered = new Set(regSources.map((s) => s.path));
  const unitNames = [...new Set(files.filter((f) => f.startsWith("components/")).map((f) => f.split("/")[1].replace(/\.tsx?$/, "")))].sort();
  const units = unitNames.filter((name) => !registered.has(`components/${name}`)).map((name) => {
    const path = `components/${name}`;
    const own = filesOf(path);
    const entry = own.find((f) => /\/index\.tsx?$/.test(f)) ?? own[0];
    const website = name.startsWith("website-");
    return {
      path, ...usageOf(path, undefined, website ? 3 : UNIT_PLACE_CAP),
      desc: entry ? headerOf(text.get(entry)) : "",
      website,
      loc: own.reduce((n, f) => n + text.get(f).split("\n").length, 0),
    };
  });

  // หน้าที่ยังทำเองแทนของกลาง (ตัวชี้วัดคร่าว ๆ)
  const pages = files.filter(isPage);
  const loadingPages = pages.filter((f) => text.get(f).includes("กำลังโหลด"));
  const usesShared = (f, re) => [...(text.get(f).matchAll(IMPORT_RE))].some((m) => re.test(m[2] ?? m[3] ?? ""));
  const handMade = {
    loadingPages: loadingPages.filter((f) => !usesShared(f, /components\/(state-views|spinner)/)).length,
    loadingPagesTotal: loadingPages.length,
    rawTableFiles: files.filter((f) => f.startsWith("app/") && text.get(f).includes("<table") && !usesShared(f, /components\/(mini-table|data-table|master-crud|line-items-grid)/)).length,
  };

  const libUnits = new Set(files.filter((f) => f.startsWith("lib/")).map((f) => f.split("/")[1].replace(/\.tsx?$/, "")));
  return {
    generatedAt: new Date().toISOString(),
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 8) || null,
    totals: {
      components: unitNames.filter((n) => !n.startsWith("website-")).length,
      website: unitNames.filter((n) => n.startsWith("website-")).length,
      lib: libUnits.size,
      pages: pages.length,
      apis: files.filter(isApi).length,
    },
    handMade,
    sources,
    units,
  };
}

function main() {
  const root = ROOT_DEFAULT;
  try {
    const t0 = Date.now();
    const r = scanSharedParts(root);
    writeFileSync(join(root, OUT), JSON.stringify(r) + "\n");
    const unused = Object.values(r.sources).filter((s) => s.files === 0).length;
    console.log(`[parts:scan] ของกลางในทะเบียน ${Object.keys(r.sources).length} (ไม่มีใครใช้ ${unused}) · ยังไม่ลงทะเบียน ${r.units.length} · ${Date.now() - t0}ms → ${OUT}`);
  } catch (e) {
    // ห้ามทำให้ build ล้ม — เก็บผลเดิมไว้
    console.warn(`[parts:scan] นับไม่สำเร็จ ใช้ผลเดิม: ${e instanceof Error ? e.message : e}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
