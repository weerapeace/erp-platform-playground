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

import { cleanRoleFolders, DEFAULT_ROLE_FOLDERS, type RoleFolderConfig } from "./role-folders";

export const FILE_SORT_CONFIG_KEY = "admin_file_sort_config";

/** นามสกุลที่ทำเป็นรูปตัวอย่างได้ (ย่อรูปได้ทั้งในโปรแกรมและเบราว์เซอร์) */
export const PREVIEWABLE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

export type FileSortRule = { ext: string; library: boolean; drive: boolean; nas: boolean };
export type FileSortProfile = {
  key: string;
  label: string;
  /** แม่แบบที่เก็บบน Z: (ค่าตั้งต้น) เช่น Z:\Assets\{แบรนด์}\{ชนิด}\{ชื่องาน} — ว่าง = ไม่ส่งลง Z: */
  nasPattern: string;
  /** แม่แบบแยกตามชนิดงาน (ชื่อชนิด artwork → แม่แบบ) · ไม่มี/ว่าง = ใช้ค่าตั้งต้น */
  nasByType: Record<string, string>;
  /** ส่วนต้นของแม่แบบก่อนช่องเติมคำ (เช่น Z:\Assets) — คำนวณเอง ไว้โชว์/โปรแกรมรุ่นเก่า */
  nasRoot: string;
  /** ลำดับแถว = ลำดับเลือกรูปตัวอย่าง (แถวบนก่อน) */
  rules: FileSortRule[];
  /** นามสกุลที่ไม่อยู่ในตาราง */
  other: { drive: boolean; nas: boolean };
};
/**
 * สูตร "งานสินค้า": โยนโฟลเดอร์รุ่น (เช่น BSD15) → ดูชื่อโฟลเดอร์ย่อย
 *   [01] Description → รูป Description ของรุ่น · <รหัสรุ่น> → แกลเลอรี Parent · <รหัสสี> → แกลเลอรี SKU
 *   ไฟล์ชื่อ = รหัส SKU → ปก · .png ชื่อ = รหัส → รูปตัด PNG · Images/Rawfiles/PSD/RAW → ไม่ลงระบบ (อยู่บน Z:)
 *   ตัวคิด: lib/file-sort-product (ใช้ตัวจับคู่กลาง lib/product-image-routing เดียวกับปุ่ม 📂 ในเว็บ)
 */
/** ชนิดงานย่อยของสูตรสินค้า: สินค้าใหม่ (ทุกช่อง) · เพิ่มสี (เฉพาะแกลเลอรีสีใหม่) · แก้สี (เฉพาะแกลเลอรีสีที่อยู่ในโฟลเดอร์) */
export const PRODUCT_VARIANTS = ["new", "color", "edit"] as const;
export type ProductVariant = (typeof PRODUCT_VARIANTS)[number];
export const PRODUCT_VARIANT_LABEL: Record<ProductVariant, string> = { new: "สินค้าใหม่ (Parent + SKU)", color: "เพิ่มสี", edit: "แก้สี" };

export type ProductSortConfig = {
  label: string;
  /** แม่แบบที่เก็บบน Z: ต่อชนิดงานย่อย — ใช้เมื่อโฟลเดอร์รุ่นยังไม่อยู่บน Z: (อยู่แล้ว = ไม่ทำอะไร) · ว่าง = ไม่ก๊อป */
  nasPatterns: Record<ProductVariant, string>;
  /** ส่วนต้นของแม่แบบสินค้าใหม่ (คำนวณเอง · ไว้โชว์/โปรแกรมรุ่นเก่า) */
  nasRoot: string;
  roleFolders: RoleFolderConfig;
  /** รูปเดิมของสินค้า: แทนที่ทั้งชุด / ต่อท้าย */
  mode: "replace" | "append";
  /** หลังลงรูปเสร็จ: ย้ายโฟลเดอร์ Rawfiles / Images ไปที่อื่นบน Z: (stay = อยู่ที่เดิม) · ตัวคิด lib/file-sort-product planProductMoves */
  moves: Record<MoveRole, FolderMove>;
  /** ชื่อโฟลเดอร์ชั้นบนของแต่ละชนิด (ไม่สนเลขนำหน้า · มีเลขต่อท้ายก็นับ เช่น 00_rawfiles_1) */
  moveFolders: Record<MoveRole, string[]>;
  /** หลังลงรูปเสร็จ: เก็บทั้งโฟลเดอร์งานเข้า Collection (แบบปุ่ม Arrange ของ Create Folder Tool) · ตัวคิด planProductCollection */
  collection: CollectionMove;
};
export const MOVE_ROLES = ["raw", "images"] as const;
export type MoveRole = (typeof MOVE_ROLES)[number];
export const MOVE_ROLE_LABEL: Record<MoveRole, string> = { raw: "Rawfiles", images: "Images" };
export type FolderMove = { mode: "stay" | "move"; pattern: string };
/**
 * เก็บทั้งโฟลเดอร์งานเข้า Collection — ทำหลังลงรูปเข้า ERP ครบ + หลังย้าย Rawfiles แล้ว
 *   ที่เก็บคิดตามแบรนด์ของสินค้า: byBrand[id แบรนด์] → ค่าตั้งต้นตามชื่อแบรนด์ (COLLECTION_BRAND_DEFAULTS) → pattern (ว่าง = ไม่เก็บ)
 *   {กลุ่ม} = โฟลเดอร์กลุ่มใน Collection — โปรแกรมหาเองบน Z: (ชื่อตรงตัวอักษรหน้ารหัส / ขึ้นต้นด้วยตัวนั้น / มีรุ่นพี่น้องอยู่ เช่น JEAN10 → JEANS)
 *   มีรุ่นนี้ใน Collection แล้ว (งานเพิ่มสี/แก้สี) = รวมเข้าไป ไม่ทับ: ชื่อชน → _v.2 · [02] Images ชน → ซ้อนเป็น Images v.2 (เหมือน Arrange)
 *   tidy = จัดชื่อก่อนเก็บ: โฟลเดอร์ที่มีคำว่า description → [01] Description · lifestyle / model → ย้ายเข้า [02] Images\
 *   แบรนด์ที่ยังไม่มีที่ใน Z:\Collection (Good Goods / Cansooba / Findig / อื่นๆ — เช็ก 2026-11-09) = ไม่มีค่าตั้งต้น → ไม่เก็บจนกว่าจะตั้ง (ไม่เดา)
 */
export type CollectionMove = { mode: "stay" | "move"; pattern: string; byBrand: Record<string, string>; tidy: boolean };
export const COLLECTION_PATTERN_DEFAULT = "Z:\\Collection\\{กลุ่ม}\\{รุ่น}";
/** ค่าตั้งต้นตามชื่อแบรนด์ (ตรงกับปุ่ม Arrange + โครงจริงใน Z:\Collection) — ตั้งทับรายแบรนด์ได้ในหน้าตั้งค่า */
export const COLLECTION_BRAND_DEFAULTS: Record<string, string> = {
  "louis montini": COLLECTION_PATTERN_DEFAULT,
  "pixie dustie": COLLECTION_PATTERN_DEFAULT,
  "ig international": "Z:\\Collection\\[01] สินค้าร้าน IG (IG Products)\\{กลุ่ม}\\{รุ่น}",
  nekomeow: "Z:\\Collection\\[05] Nekomeow\\{รุ่น}",
  "risara ja kissa": "Z:\\Collection\\[06] Risara Ja Kissa\\[01] Risara Ja Kissa Products\\{กลุ่ม}\\{รุ่น}",
};
const brandNameKey = (s: string): string => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/** แม่แบบ Collection ที่ไม่ได้ตั้งแยก: ค่าตั้งต้นตามชื่อแบรนด์ หรือแม่แบบตั้งต้น */
export const collectionDefaultFor = (c: CollectionMove, brandName: string): string => COLLECTION_BRAND_DEFAULTS[brandNameKey(brandName)] ?? c.pattern;
/** แม่แบบ Collection ของแบรนด์นี้ (ตั้งแยก → ค่าตั้งต้นตามชื่อ → แม่แบบตั้งต้น) */
export const collectionPatternFor = (c: CollectionMove, brand: { id: string; name: string }): string =>
  (c.byBrand[brand.id] ?? "").trim() || collectionDefaultFor(c, brand.name);
const PRODUCT_NAS_DEFAULT = "Z:\\Work In Process\\[01] New Product\\{รุ่น}";
export const DEFAULT_PRODUCT_CONFIG: ProductSortConfig = {
  label: "งานสินค้า", nasPatterns: { new: PRODUCT_NAS_DEFAULT, color: PRODUCT_NAS_DEFAULT, edit: PRODUCT_NAS_DEFAULT },
  nasRoot: "Z:\\Work In Process\\[01] New Product", roleFolders: DEFAULT_ROLE_FOLDERS, mode: "replace",
  // ที่เดียวกับปุ่ม Arrange ของ Create Folder Tool: Z:\Raw Files\<แบรนด์>\<รุ่น>_rawfiles · Images อยู่กับรุ่น
  moves: { raw: { mode: "move", pattern: "Z:\\Raw Files\\{แบรนด์}\\{รุ่น}_rawfiles" }, images: { mode: "stay", pattern: "" } },
  moveFolders: { raw: ["rawfile", "rawfiles", "raw files", "raw file", "raw"], images: ["images", "image"] },
  collection: { mode: "move", pattern: "", byBrand: {}, tidy: true },
};

const cleanPattern = (v: unknown): string => String(v ?? "").trim().replace(/[\\/]+$/, "").slice(0, 300);

function cleanMoves(raw: unknown): { moves: Record<MoveRole, FolderMove>; moveFolders: Record<MoveRole, string[]> } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mv = (o.moves && typeof o.moves === "object" ? o.moves : {}) as Record<string, unknown>;
  const mf = (o.moveFolders && typeof o.moveFolders === "object" ? o.moveFolders : {}) as Record<string, unknown>;
  const moves = {} as Record<MoveRole, FolderMove>;
  const moveFolders = {} as Record<MoveRole, string[]>;
  for (const r of MOVE_ROLES) {
    const d = DEFAULT_PRODUCT_CONFIG.moves[r];
    const x = (mv[r] && typeof mv[r] === "object" ? mv[r] : {}) as Record<string, unknown>;
    moves[r] = { mode: x.mode === "move" || x.mode === "stay" ? x.mode : d.mode, pattern: typeof x.pattern === "string" ? cleanPattern(x.pattern) : d.pattern };
    const list = Array.isArray(mf[r]) ? mf[r] as unknown[] : typeof mf[r] === "string" ? String(mf[r]).split(/[,\n]/) : null;
    moveFolders[r] = list ? [...new Set(list.map((s) => String(s ?? "").trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20) : [...DEFAULT_PRODUCT_CONFIG.moveFolders[r]];
  }
  return { moves, moveFolders };
}

export function cleanProductConfig(raw: unknown): ProductSortConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // ค่าเดิม (ก่อนมีแม่แบบ): nasRoot = ราก → แม่แบบ = ราก\{รุ่น}
  const legacy = typeof o.nasRoot === "string" && !(o.nasPatterns && typeof o.nasPatterns === "object")
    ? (o.nasRoot.trim() ? `${cleanPattern(o.nasRoot)}\\{รุ่น}` : "") : null;
  const raws = (o.nasPatterns && typeof o.nasPatterns === "object" ? o.nasPatterns : {}) as Record<string, unknown>;
  const nasPatterns = Object.fromEntries(PRODUCT_VARIANTS.map((v) => [v,
    typeof raws[v] === "string" ? cleanPattern(raws[v]) : legacy ?? DEFAULT_PRODUCT_CONFIG.nasPatterns[v]])) as Record<ProductVariant, string>;
  return {
    label: String(o.label ?? DEFAULT_PRODUCT_CONFIG.label).trim().slice(0, 60) || DEFAULT_PRODUCT_CONFIG.label,
    nasPatterns,
    nasRoot: nasPrefixOf(nasPatterns.new),
    roleFolders: cleanRoleFolders(o.roleFolders),
    mode: o.mode === "append" ? "append" : "replace",
    ...cleanMoves(o),
    collection: cleanCollection(o.collection),
  };
}

function cleanCollection(raw: unknown): CollectionMove {
  const d = DEFAULT_PRODUCT_CONFIG.collection;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const by = (o.byBrand && typeof o.byBrand === "object" ? o.byBrand : {}) as Record<string, unknown>;
  const byBrand: Record<string, string> = {};
  for (const [k, v] of Object.entries(by).slice(0, 100)) {
    const id = String(k).trim().slice(0, 64);
    const p = typeof v === "string" ? cleanPattern(v) : "";
    if (id && p) byBrand[id] = p;
  }
  return {
    mode: o.mode === "stay" || o.mode === "move" ? o.mode : d.mode,
    pattern: typeof o.pattern === "string" ? cleanPattern(o.pattern) : d.pattern,
    byBrand,
    tidy: typeof o.tidy === "boolean" ? o.tidy : d.tidy,
  };
}

/**
 * สูตร "Content": โยนโฟลเดอร์ชุดคอนเทนต์ (เช่น 2026_07_13-1_MPU15 จาก Create Folder Tool) → อัลบั้มในหน้า Contents
 *   รูป/วิดีโอ → อัลบั้ม (ตัวจริงขึ้น Drive <แบรนด์>/Content/อัลบั้ม · รูปย่อ R2) · โฟลเดอร์ rawfiles / PSD → อยู่บน Z: อย่างเดียว
 *   โฟลเดอร์ชื่อแพลตฟอร์ม (01_Instagram …) → ติ๊กแพลตฟอร์มที่จะลงให้อัลบั้ม · ตัวคิด: lib/file-sort-content
 */
export type ContentSortConfig = {
  label: string;
  /** แม่แบบที่เก็บบน Z: — ใช้เมื่อโฟลเดอร์ยังไม่อยู่บน Z: (อยู่แล้ว = อยู่ที่เดิม) · ว่าง = ไม่ก๊อป */
  nasPattern: string;
  /** ส่วนต้นของแม่แบบ (คำนวณเอง · ไว้โชว์) */
  nasRoot: string;
  /** ชื่อโฟลเดอร์ไฟล์ดิบ (ไม่สนเลขนำหน้า/ตัวพิมพ์ · ขึ้นต้นด้วยคำนี้ก็นับ เช่น 00_rawfiles_1) → ไม่ลงอัลบั้ม */
  rawFolders: string[];
  /** นามสกุลที่ลงอัลบั้ม (ที่เหลืออยู่บน Z: อย่างเดียว) */
  albumExts: string[];
};
export const DEFAULT_CONTENT_CONFIG: ContentSortConfig = {
  label: "Content",
  nasPattern: "Z:\\Work In Process\\[01] New Product\\[02] Contents\\{โฟลเดอร์}",
  nasRoot: "Z:\\Work In Process\\[01] New Product\\[02] Contents",
  rawFolders: ["rawfiles", "raw files", "raw"],
  albumExts: ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "m4v", "webm"],
};
export function cleanContentConfig(raw: unknown): ContentSortConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nasPattern = typeof o.nasPattern === "string" ? cleanPattern(o.nasPattern) : DEFAULT_CONTENT_CONFIG.nasPattern;
  const words = (v: unknown, dflt: string[], clean: (s: string) => string) => {
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : null;
    if (!list) return dflt;
    const out = [...new Set(list.map((x) => clean(String(x ?? ""))).filter(Boolean))].slice(0, 30);
    return out;
  };
  return {
    label: String(o.label ?? DEFAULT_CONTENT_CONFIG.label).trim().slice(0, 60) || DEFAULT_CONTENT_CONFIG.label,
    nasPattern,
    nasRoot: nasPrefixOf(nasPattern),
    rawFolders: words(o.rawFolders, DEFAULT_CONTENT_CONFIG.rawFolders, (s) => s.trim().toLowerCase().slice(0, 40)),
    albumExts: words(o.albumExts, DEFAULT_CONTENT_CONFIG.albumExts, (s) => normalizeExt(s)),
  };
}

export type FileSortConfig = { profiles: FileSortProfile[]; product: ProductSortConfig; content: ContentSortConfig };

const r = (ext: string, library: boolean, drive: boolean, nas: boolean): FileSortRule => ({ ext, library, drive, nas });

export const DEFAULT_ARTWORK_PROFILE: FileSortProfile = {
  key: "artwork",
  label: "โลโก้ / Artwork",
  nasPattern: "Z:\\Assets\\{แบรนด์}\\{ชนิด}\\{ชื่องาน}",
  nasByType: {},
  nasRoot: "Z:\\Assets",
  rules: [
    r("jpg", true, false, true), r("jpeg", true, false, true), r("png", true, true, true), r("webp", true, false, true),
    r("psd", false, true, true), r("ai", false, true, true), r("pdf", false, true, true), r("eps", false, true, true),
    r("svg", false, true, true), r("tif", false, true, true), r("tiff", false, true, true),
  ],
  other: { drive: false, nas: true },
};

export const DEFAULT_FILE_SORT_CONFIG: FileSortConfig = { profiles: [DEFAULT_ARTWORK_PROFILE], product: DEFAULT_PRODUCT_CONFIG, content: DEFAULT_CONTENT_CONFIG };

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
  // ค่าเดิม (ก่อนมีแม่แบบ): nasRoot = ราก → แม่แบบ = ราก\{แบรนด์}\{ชนิด}\{ชื่องาน} (ผลเหมือนเดิมทุกอย่าง)
  const nasPattern = typeof o.nasPattern === "string" ? cleanPattern(o.nasPattern)
    : typeof o.nasRoot === "string" ? (o.nasRoot.trim() ? `${cleanPattern(o.nasRoot)}\\{แบรนด์}\\{ชนิด}\\{ชื่องาน}` : "") : fallback.nasPattern;
  const byRaw = (o.nasByType && typeof o.nasByType === "object" ? o.nasByType : {}) as Record<string, unknown>;
  const nasByType: Record<string, string> = {};
  for (const [k, v] of Object.entries(byRaw).slice(0, 50)) { const p = cleanPattern(v); if (k.trim() && p) nasByType[k.trim().slice(0, 60)] = p; }
  return {
    key: String(o.key ?? fallback.key).trim() || fallback.key,
    label: String(o.label ?? fallback.label).trim().slice(0, 60) || fallback.label,
    nasPattern,
    nasByType,
    nasRoot: nasPrefixOf(nasPattern),
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
  return { profiles, product: cleanProductConfig(o.product), content: cleanContentConfig(o.content) };
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

// ── แม่แบบที่เก็บบน Z: (ตั้งตามชนิดงานในหน้าตั้งค่า · โปรแกรมเลือกที่เก็บเองรายงานได้อีกชั้น) ──

/** ช่องเติมคำในแม่แบบ */
export const NAS_TOKENS = ["แบรนด์", "ชนิด", "ชื่องาน", "รุ่น", "ปี", "เดือน", "โฟลเดอร์", "กลุ่ม"] as const;
export type NasToken = (typeof NAS_TOKENS)[number];
export type NasValues = Partial<Record<NasToken, string | null | undefined>>;
export const NAS_TOKEN_HINT: Record<NasToken, string> = {
  แบรนด์: "โฟลเดอร์แบรนด์ เช่น [01] Louis Montini", ชนิด: "ซับตามชนิด เช่น 01_Logo", ชื่องาน: "ชื่องานที่กรอก", รุ่น: "ชื่อโฟลเดอร์รุ่น เช่น BSD15",
  ปี: "ปี ค.ศ. เช่น 2026", เดือน: "เดือน 2 หลัก เช่น 11", โฟลเดอร์: "ชื่อโฟลเดอร์ที่ลากเข้ามา",
  กลุ่ม: "เฉพาะที่เก็บ Collection: โฟลเดอร์กลุ่มที่โปรแกรมหาเองบน Z: เช่น BSD15 → BSD · JEAN10 → JEANS",
};

const ROOT_RE = /^([A-Za-z]:|\\\\[^\\/]+[\\/][^\\/]+)/;

/** ส่วนต้นของแม่แบบก่อนชั้นแรกที่มีช่องเติมคำ ("Z:\Assets\{แบรนด์}\…" → "Z:\Assets") */
export function nasPrefixOf(pattern: string): string {
  const p = pattern.trim();
  const m = p.match(ROOT_RE);
  if (!m) return "";
  const segs = p.slice(m[1].length).split(/[\\/]+/).filter(Boolean);
  const lit: string[] = [];
  for (const s of segs) { if (/\{[^}]*\}/.test(s)) break; lit.push(s); }
  return winJoin(m[1], ...lit);
}

/** ปี/เดือนตามเวลาไทย */
export function nasDateValues(now: Date = new Date()): { ปี: string; เดือน: string } {
  const th = new Date(now.getTime() + 7 * 3600_000);
  return { ปี: String(th.getUTCFullYear()), เดือน: String(th.getUTCMonth() + 1).padStart(2, "0") };
}

/** แม่แบบ → path จริง · ชั้นที่มีแต่ช่องเติมคำว่าง = ตัดชั้นนั้นทิ้ง · ช่องบังคับ (required) ว่าง / แม่แบบว่าง / ไม่ขึ้นต้นด้วยไดรฟ์ = null */
export function fillNasPattern(pattern: string, values: NasValues, required: NasToken[] = []): string | null {
  const p = (pattern ?? "").trim();
  const m = p.match(ROOT_RE);
  if (!p || !m) return null;
  for (const r of required) if (p.includes(`{${r}}`) && !String(values[r] ?? "").trim()) return null;
  const segs: string[] = [];
  for (const seg of p.slice(m[1].length).split(/[\\/]+/).filter(Boolean)) {
    const hasTok = /\{[^}]*\}/.test(seg);
    const filled = seg.replace(/\{([^}]*)\}/g, (_, k: string) => {
      const v = String(values[k as NasToken] ?? "").trim();
      return v ? safeFolderName(v) : "";
    }).replace(/[<>:"|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
    if (hasTok && !filled.replace(/[\s._\-()[\]]/g, "")) continue;
    segs.push(filled.replace(/[. ]+$/g, ""));
  }
  return winJoin(m[1], ...segs);
}

/** แม่แบบของชนิดงานนี้ (ตั้งแยกตามชนิด artwork ได้ · ไม่ตั้ง = ค่าตั้งต้น) */
export const nasPatternFor = (profile: FileSortProfile, artworkType?: string | null): string =>
  (artworkType && profile.nasByType[artworkType]) || profile.nasPattern;

/** โฟลเดอร์งานบน Z: — null = ส่งลง Z: ไม่ได้ (ไม่ได้ตั้งแม่แบบ หรือแบรนด์ยังไม่มีชื่อโฟลเดอร์) */
export function nasFolderFor(profile: FileSortProfile, brandFolder: string | null | undefined, typeFolder: string | null | undefined, jobName: string, artworkType?: string | null, now?: Date): string | null {
  return fillNasPattern(nasPatternFor(profile, artworkType), { แบรนด์: brandFolder, ชนิด: typeFolder, ชื่องาน: jobName, โฟลเดอร์: jobName, ...nasDateValues(now) }, ["แบรนด์"]);
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
  if (!profile.nasPattern.trim() && items.some((it) => it.nas)) warnings.push("ยังไม่ได้ตั้งที่เก็บบน Z: ในสูตร — ไฟล์จะไม่ถูกก๊อปลง Z:");

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
