/**
 * 🗂️ สูตร "Content" ของตัวแยกไฟล์ ERP (pure · ไม่แตะฐานข้อมูล) — โฟลเดอร์ชุดคอนเทนต์ → อัลบั้มในหน้า Contents
 *
 *   รูป/วิดีโอ (นามสกุลใน albumExts) → ลงอัลบั้ม (ตัวจริงขึ้น Drive <แบรนด์>/Content/อัลบั้ม · รูปย่อ R2 · ผ่าน /api/content-albums/*)
 *   ในโฟลเดอร์ไฟล์ดิบ (00_rawfiles, rawfiles_1 …) / PSD / ไฟล์อื่น → ไม่ลงอัลบั้ม (อยู่บน Z: อย่างเดียว)
 *   โฟลเดอร์ชั้นบนชื่อแพลตฟอร์ม (01_Instagram, 02_Facebook, 03_X …) → แพลตฟอร์มที่จะลง (planned_platforms ของอัลบั้ม)
 *   ไฟล์ที่อัลบั้มมีแล้ว (ชื่อ + ขนาดตรงกัน) → ข้าม (กดซ้ำได้ ไม่ลงซ้ำ)
 *   ชื่อไฟล์ซ้ำกันคนละโฟลเดอร์ย่อย (01_Images_1/1.jpg กับ 01_Images_2/1.jpg) → ตั้งชื่อในอัลบั้มนำหน้าด้วยโฟลเดอร์ กันสับสน
 *
 * ใช้ที่ /api/file-sort/plan (profile "content") · คู่มือ docs/file-sorter.md
 */
import { fillNasPattern, isJunkFile, nasDateValues, relPathOf, safeFolderName, type ContentSortConfig } from "@/lib/file-sort";

export const CONTENT_MAX_FILES = 3000;

/** คำในชื่อโฟลเดอร์ → รหัสแพลตฟอร์ม (ชุดเดียวกับ lib/creative-tasks PLATFORMS) */
const PLATFORM_WORDS: [string, string[]][] = [
  ["instagram", ["instagram", "ig"]],
  ["facebook", ["facebook", "fb"]],
  ["x", ["x", "twitter"]],
  ["tiktok", ["tiktok", "tik tok"]],
  ["youtube", ["youtube", "yt"]],
  ["pinterest", ["pinterest"]],
  ["line_oa", ["line", "line oa", "line_oa"]],
  ["shopee", ["shopee"]],
  ["lazada", ["lazada"]],
  ["website", ["website", "web"]],
];

export type ContentFileIn = { path: string; size?: number | null };
export type ContentExisting = { file_name: string; size_bytes: number | null };
export type ContentWhy = "raw" | "not_media" | "junk" | "already";
export type ContentFileAction = {
  rel: string;
  name: string;
  ext: string;
  size: number;
  /** ลงอัลบั้มรอบนี้ */
  album: boolean;
  /** ชื่อไฟล์ในอัลบั้ม/Drive (ปกติ = ชื่อเดิม · ชื่อชนกันคนละโฟลเดอร์ = นำหน้าด้วยโฟลเดอร์) */
  albumName: string | null;
  /** อยู่บน Z: (ทุกไฟล์ยกเว้นไฟล์ระบบ) */
  nas: boolean;
  why: ContentWhy | null;
  /** แพลตฟอร์มจากโฟลเดอร์ชั้นบน */
  platform: string | null;
  kind: "image" | "video" | "other";
};
export type ContentPlan = {
  files: ContentFileAction[];
  platforms: string[];
  counts: { total: number; album: number; already: number; raw: number; other: number; nas: number };
  warnings: string[];
};

/** ชื่อโฟลเดอร์ไม่เอาเลขนำหน้า ([01] / (1) / 01_ / 1. ) · ตัวเล็ก */
export const contentFolderKey = (name: string): string =>
  String(name ?? "").trim().replace(/^(\[\s*\d+\s*\]|\(\s*\d+\s*\)|\d+\s*[._)\-]+|\d+\s+)\s*/, "").trim().toLowerCase();

export function platformOfFolder(name: string): string | null {
  const k = contentFolderKey(name).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [code, words] of PLATFORM_WORDS) if (words.includes(k)) return code;
  return null;
}

/** โฟลเดอร์ไฟล์ดิบ: ชื่อ (ไม่สนเลขนำหน้า) = คำ หรือ คำ + เลขลำดับ เช่น rawfiles_1 / Raw Files 2 */
export function isRawFolder(name: string, rawFolders: string[]): boolean {
  const k = contentFolderKey(name);
  return rawFolders.some((w) => w && (k === w || (k.startsWith(w) && /^[\s_\-.\d]*$/.test(k.slice(w.length)))));
}

const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic"]);

export function planContentSort(input: ContentFileIn[], cfg: ContentSortConfig, opts: { existing?: ContentExisting[] } = {}): ContentPlan {
  const exts = new Set(cfg.albumExts);
  const files: ContentFileAction[] = input
    .map((f): ContentFileAction | null => {
      const rel = relPathOf(f.path);
      const parts = rel.split("/");
      const name = parts[parts.length - 1] ?? rel;
      const ext = (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
      const dirs = parts.slice(0, -1);
      const kind: ContentFileAction["kind"] = VIDEO_EXTS.has(ext) ? "video" : IMAGE_EXTS.has(ext) ? "image" : "other";
      const base: ContentFileAction = { rel, name, ext, size: Math.max(0, Number(f.size) || 0), album: false, albumName: null, nas: true, why: null, platform: dirs.length ? platformOfFolder(dirs[0]) : null, kind };
      if (!rel) return null;
      if (isJunkFile(name)) return { ...base, nas: false, why: "junk" as const };
      if (dirs.some((d) => isRawFolder(d, cfg.rawFolders))) return { ...base, why: "raw" as const };
      if (!exts.has(ext)) return { ...base, why: "not_media" as const };
      return { ...base, album: true, albumName: name };
    })
    .filter((x): x is ContentFileAction => !!x)
    .sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: "base" }));

  // ชื่อชนกันในอัลบั้ม (ไม่สนตัวพิมพ์) → นำหน้าด้วยโฟลเดอร์ย่อย
  const byName = new Map<string, ContentFileAction[]>();
  for (const f of files) if (f.album) { const k = f.name.toLowerCase(); byName.set(k, [...(byName.get(k) ?? []), f]); }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const f of group) {
      const dirs = f.rel.split("/").slice(0, -1);
      if (dirs.length) f.albumName = safeFolderName(`${dirs.join("_")}_${f.name}`) || f.name;
    }
  }

  // อัลบั้มมีไฟล์นี้แล้ว (ชื่อในอัลบั้ม + ขนาดตรงกัน · ขนาดในระบบไม่รู้ = ดูแค่ชื่อ) → ข้าม
  const have = new Map<string, (number | null)[]>();
  for (const e of opts.existing ?? []) { const k = String(e.file_name ?? "").toLowerCase(); have.set(k, [...(have.get(k) ?? []), e.size_bytes == null ? null : Number(e.size_bytes)]); }
  for (const f of files) {
    if (!f.album || !f.albumName) continue;
    const sizes = have.get(f.albumName.toLowerCase());
    if (sizes && sizes.some((s) => s == null || s === f.size)) { f.album = false; f.why = "already"; }
  }

  const platforms = [...new Set(files.map((f) => f.platform).filter((p): p is string => !!p))];
  const counts = {
    total: files.length,
    album: files.filter((f) => f.album).length,
    already: files.filter((f) => f.why === "already").length,
    raw: files.filter((f) => f.why === "raw").length,
    other: files.filter((f) => f.why === "not_media").length,
    nas: files.filter((f) => f.nas).length,
  };
  const warnings: string[] = [];
  if (!counts.album && !counts.already) warnings.push("ไม่มีรูป/วิดีโอที่ลงอัลบั้มได้ (ไฟล์ทั้งหมดอยู่ในโฟลเดอร์ไฟล์ดิบ หรือไม่ใช่รูป/วิดีโอ) — จะก๊อปลง Z: อย่างเดียว");
  else if (!counts.album) warnings.push("ไฟล์ทุกไฟล์อยู่ในอัลบั้มแล้ว — ไม่ต้องลงซ้ำ");
  return { files, platforms, counts, warnings };
}

/** โฟลเดอร์ปลายทางบน Z: ของชุดคอนเทนต์ (ใช้เมื่อโฟลเดอร์ยังไม่อยู่บน Z:) · null = ไม่ได้ตั้ง/เติมไม่ได้ */
export function contentNasFolder(cfg: ContentSortConfig, jobFolder: string, albumName: string, brandFolder?: string | null, now: Date = new Date()): string | null {
  return fillNasPattern(cfg.nasPattern, { โฟลเดอร์: safeFolderName(jobFolder), ชื่องาน: safeFolderName(albumName), แบรนด์: brandFolder ?? "", ...nasDateValues(now) });
}
