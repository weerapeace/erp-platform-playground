/**
 * 🗂️ สูตรแยกไฟล์ (ของกลาง · pure ไม่แตะฐานข้อมูล) — ใช้กับ "ตัวแยกไฟล์ ERP" (โปรแกรมบนเครื่อง)
 *
 * โยนโฟลเดอร์ 1 งาน → แต่ละไฟล์ไปที่ไหน:
 *   คลังกลาง (library) = ใช้เป็น "รูปตัวอย่าง" ของการ์ด Artwork ได้ (เลือกแค่ 1 รูป ตามลำดับแถวในสูตร)
 *   drive              = อัปขึ้น Google Drive (โครง แบรนด์ › ชนิด › ชื่องาน · lib/artwork-drive)
 *   nas                = ก๊อปลง Synology Z: (ราก › โฟลเดอร์แบรนด์ › ซับชนิด › ชื่องาน · ใช้ชื่อเดียวกับ Drive)
 *
 * ค่าตั้งเก็บใน ui_config key = FILE_SORT_CONFIG_KEY (ขึ้นต้น admin_ → API กลาง /api/ui-config แก้ไม่ได้ถ้าไม่ใช่แอดมิน)
 * อ่าน/บันทึกผ่าน /api/file-sort/config · วางแผนต่องานผ่าน /api/file-sort/plan (โปรแกรมไม่คิดเอง = กฎอยู่ที่เดียว)
 * คู่มือ: docs/file-sorter.md
 */

export const FILE_SORT_CONFIG_KEY = "admin_file_sort_config";

/** นามสกุลที่ทำเป็นรูปตัวอย่างได้ (ย่อรูปได้ทั้งในโปรแกรมและเบราว์เซอร์) */
export const PREVIEWABLE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

export type FileSortRule = { ext: string; library: boolean; drive: boolean; nas: boolean };
export type FileSortProfile = {
  key: string;
  label: string;
  /** รากบน Z: เช่น Z:\Assets — ว่าง = ไม่ส่งลง Z: */
  nasRoot: string;
  /** ลำดับแถว = ลำดับเลือกรูปตัวอย่าง (แถวบนก่อน) */
  rules: FileSortRule[];
  /** นามสกุลที่ไม่อยู่ในตาราง */
  other: { drive: boolean; nas: boolean };
};
export type FileSortConfig = { profiles: FileSortProfile[] };

const r = (ext: string, library: boolean, drive: boolean, nas: boolean): FileSortRule => ({ ext, library, drive, nas });

export const DEFAULT_ARTWORK_PROFILE: FileSortProfile = {
  key: "artwork",
  label: "โลโก้ / Artwork",
  nasRoot: "Z:\\Assets",
  rules: [
    r("jpg", true, false, true), r("jpeg", true, false, true), r("png", true, true, true), r("webp", true, false, true),
    r("psd", false, true, true), r("ai", false, true, true), r("pdf", false, true, true), r("eps", false, true, true),
    r("svg", false, true, true), r("tif", false, true, true), r("tiff", false, true, true),
  ],
  other: { drive: false, nas: true },
};

export const DEFAULT_FILE_SORT_CONFIG: FileSortConfig = { profiles: [DEFAULT_ARTWORK_PROFILE] };

// ── ทำความสะอาดค่าตั้ง (ค่าจาก DB / จากหน้าจอ) ──

export const normalizeExt = (s: unknown): string =>
  String(s ?? "").trim().toLowerCase().replace(/^\*?\.+/, "").replace(/[^a-z0-9]/g, "").slice(0, 10);

const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);

function cleanProfile(raw: unknown, fallback: FileSortProfile): FileSortProfile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const rules: FileSortRule[] = [];
  const src = Array.isArray(o.rules) ? o.rules : fallback.rules;
  for (const it of src) {
    const x = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const ext = normalizeExt(x.ext);
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    const previewable = (PREVIEWABLE_EXTS as readonly string[]).includes(ext);
    rules.push({ ext, library: previewable && bool(x.library, false), drive: bool(x.drive, false), nas: bool(x.nas, false) });
    if (rules.length >= 60) break;
  }
  const other = (o.other && typeof o.other === "object" ? o.other : {}) as Record<string, unknown>;
  return {
    key: String(o.key ?? fallback.key).trim() || fallback.key,
    label: String(o.label ?? fallback.label).trim().slice(0, 60) || fallback.label,
    nasRoot: typeof o.nasRoot === "string" ? o.nasRoot.trim().replace(/[\\/]+$/, "").slice(0, 260) : fallback.nasRoot,
    rules,
    other: { drive: bool(other.drive, fallback.other.drive), nas: bool(other.nas, fallback.other.nas) },
  };
}

/** ค่าจาก DB/หน้าจอ → ค่าที่ใช้ได้เสมอ (ไม่มี/พัง = ค่าเริ่มต้น) · มีสูตร artwork เสมอ */
export function cleanFileSortConfig(raw: unknown): FileSortConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(o.profiles) ? o.profiles : [];
  const profiles: FileSortProfile[] = [];
  const keys = new Set<string>();
  for (const p of list) {
    const key = String((p as Record<string, unknown> | null)?.key ?? "").trim();
    if (!key || keys.has(key)) continue;
    const fb = key === DEFAULT_ARTWORK_PROFILE.key ? DEFAULT_ARTWORK_PROFILE : { ...DEFAULT_ARTWORK_PROFILE, key, label: key };
    profiles.push(cleanProfile(p, fb));
    keys.add(key);
  }
  if (!keys.has(DEFAULT_ARTWORK_PROFILE.key)) profiles.unshift(cleanProfile(null, DEFAULT_ARTWORK_PROFILE));
  return { profiles };
}

export const findProfile = (cfg: FileSortConfig, key?: string | null): FileSortProfile =>
  cfg.profiles.find((p) => p.key === (key || DEFAULT_ARTWORK_PROFILE.key)) ?? cfg.profiles[0] ?? DEFAULT_ARTWORK_PROFILE;

// ── ชื่อโฟลเดอร์ / path บน Windows ──

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** ชื่อที่ Windows รับได้ (ใช้ชื่อเดียวกันทั้ง Z: และ Drive) — ตัวต้องห้าม → "-" · ตัดจุด/ช่องว่างท้าย */
export function safeFolderName(name: string): string {
  let s = String(name ?? "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  s = s.replace(/[. ]+$/g, "").slice(0, 120).trim();
  if (!s) return "ไม่มีชื่อ";
  return RESERVED.test(s) ? `${s}_` : s;
}

/** ต่อ path แบบ Windows: ฐานคงรูป (drive letter / UNC) + ต่อชั้นถัดไปด้วย "\" ข้ามชั้นที่ว่าง */
export function winJoin(base: string, ...rest: string[]): string {
  const b = base.trim().replace(/[\\/]+$/, "");
  const tail = rest.map((p) => p.trim().replace(/^[\\/]+|[\\/]+$/g, "")).filter(Boolean);
  return [b, ...tail].filter(Boolean).join("\\");
}

/** โฟลเดอร์งานบน Z: — null = ส่งลง Z: ไม่ได้ (ไม่ได้ตั้งราก หรือแบรนด์ยังไม่มีชื่อโฟลเดอร์) */
export function nasFolderFor(profile: FileSortProfile, brandFolder: string | null | undefined, typeFolder: string | null | undefined, jobName: string): string | null {
  const root = profile.nasRoot.trim();
  const brand = (brandFolder ?? "").trim();
  if (!root || !brand) return null;
  const type = (typeFolder ?? "").trim();
  return winJoin(root, safeFolderName(brand), type ? safeFolderName(type) : "", safeFolderName(jobName));
}

// ── วางแผนแยกไฟล์ 1 งาน ──

/** ไฟล์ระบบ/ไฟล์ชั่วคราว — ข้ามเสมอ */
export function isJunkFile(name: string): boolean {
  const n = name.toLowerCase();
  return n === "thumbs.db" || n === "desktop.ini" || n === ".ds_store" || n.startsWith("~$") || n.startsWith("._");
}

export type FileSortInput = { path: string; size?: number | null };
export type FileSortSkip = "junk" | "no_destination" | "extra_preview";
export type FileSortItem = {
  /** path ในโฟลเดอร์งาน คั่นด้วย "/" (เช่น "export/logo.png") */
  rel: string;
  name: string;
  ext: string;
  size: number | null;
  /** โฟลเดอร์ย่อยในงาน (ว่าง = อยู่ชั้นบนสุด) — ทั้ง Z: และ Drive สร้างตามนี้ */
  dir: string;
  preview: boolean;
  drive: boolean;
  nas: boolean;
  skip: FileSortSkip | null;
};
export type FileSortPlan = {
  preview: string | null;
  files: FileSortItem[];
  counts: { total: number; drive: number; nas: number; skipped: number };
  warnings: string[];
};

const extOf = (name: string) => { const m = name.match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ""; };

/** path ดิบ (\ หรือ /, อาจมีชื่อโฟลเดอร์งานนำหน้า) → path ในงานแบบ "a/b.png" */
export function relPathOf(path: string, jobFolder?: string): string {
  let p = String(path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  const jf = (jobFolder ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (jf && p.toLowerCase().startsWith(jf.toLowerCase() + "/")) p = p.slice(jf.length + 1);
  return p.split("/").filter((s) => s && s !== "." && s !== "..").join("/");
}

export function planFileSort(profile: FileSortProfile, files: FileSortInput[], opts: { jobFolder?: string } = {}): FileSortPlan {
  const ruleIdx = new Map(profile.rules.map((x, i) => [x.ext, i]));
  const items: FileSortItem[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const rel = relPathOf(f.path, opts.jobFolder);
    if (!rel || seen.has(rel.toLowerCase())) continue;
    seen.add(rel.toLowerCase());
    const parts = rel.split("/");
    const name = parts[parts.length - 1];
    const ext = extOf(name);
    const rule = ruleIdx.has(ext) ? profile.rules[ruleIdx.get(ext)!] : null;
    const size = typeof f.size === "number" && Number.isFinite(f.size) ? f.size : null;
    const base = { rel, name, ext, size, dir: parts.slice(0, -1).join("/"), preview: false };
    if (isJunkFile(name)) { items.push({ ...base, drive: false, nas: false, skip: "junk" }); continue; }
    items.push({ ...base, drive: rule ? rule.drive : profile.other.drive, nas: rule ? rule.nas : profile.other.nas, skip: null });
  }

  // รูปตัวอย่าง: แถวบนในสูตรก่อน → ไฟล์ชั้นบนก่อน → ชื่อเรียงตามตัวอักษร
  const candidates = items.filter((it) => !it.skip && profile.rules[ruleIdx.get(it.ext) ?? -1]?.library);
  candidates.sort((a, b) =>
    (ruleIdx.get(a.ext)! - ruleIdx.get(b.ext)!) || (a.rel.split("/").length - b.rel.split("/").length) || a.rel.localeCompare(b.rel));
  const chosen = candidates[0] ?? null;
  if (chosen) chosen.preview = true;

  const warnings: string[] = [];
  let extraLost = 0;
  for (const it of items) {
    if (it.skip || it.preview || it.drive || it.nas) continue;
    if (candidates.includes(it)) { it.skip = "extra_preview"; extraLost++; } else it.skip = "no_destination";
  }
  if (!chosen) warnings.push("ไม่มีไฟล์ที่ใช้เป็นรูปตัวอย่างได้ (JPG/PNG/WEBP) — การ์ดในคลังจะไม่มีรูป ต้องเลือกรูปตัวอย่างเอง");
  if (extraLost) warnings.push(`มีรูปตัวอย่างหลายรูป ใช้ "${chosen?.name}" — อีก ${extraLost} รูปไม่ได้ส่งไปที่ไหน (ติ๊ก Drive หรือ Z: ในสูตรถ้าอยากเก็บ)`);
  const noDest = items.filter((it) => it.skip === "no_destination");
  if (noDest.length) warnings.push(`${noDest.length} ไฟล์ไม่ได้ส่งไปที่ไหนตามสูตร (${[...new Set(noDest.map((x) => x.ext || "ไม่มีนามสกุล"))].join(", ")}) — จะถูกข้าม`);
  if (!profile.nasRoot.trim() && items.some((it) => it.nas)) warnings.push("ยังไม่ได้ตั้งที่เก็บบน Z: ในสูตร — ไฟล์จะไม่ถูกก๊อปลง Z:");

  return {
    preview: chosen?.rel ?? null,
    files: items,
    counts: {
      total: items.length,
      drive: items.filter((it) => !it.skip && it.drive).length,
      nas: items.filter((it) => !it.skip && it.nas).length,
      skipped: items.filter((it) => it.skip).length,
    },
    warnings,
  };
}
