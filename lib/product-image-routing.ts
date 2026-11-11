/**
 * 📂 จัดรูปหลายโฟลเดอร์ลงช่องรูปสินค้า (ของกลาง · pure ไม่แตะ DB)
 * ใช้ที่ components/product-image-router (ปุ่ม 📂 ในหน้า Parent SKU + ตารางลูกโหมดรูปภาพ)
 *
 * 1) จัดกลุ่มไฟล์ตามโฟลเดอร์ → จับคู่ชื่อโฟลเดอร์กับรหัส (กติกาเดียวกับ lib/website-image-match: ไม่สนตัวพิมพ์ · รหัสยาวก่อน)
 *      BCG11-01/ = สี · BCG12-01-L/ = รหัสไซส์ → สีหลัก · BCG11/ = ทั้งรุ่น (ไม่ผูกสี) · BCG11-07/ ไม่มีสีนี้ = ให้เลือกเอง
 *      ไฟล์เดี่ยวไม่มีโฟลเดอร์ = ใช้รหัสในชื่อไฟล์แทน (BCG11-01_2.jpg)
 * 2) ตั้งช่องให้แต่ละรูป: ชื่อไฟล์บอกเอง (ปก · hero · hero_m · desc · png) ก่อน → แม่แบบตามลำดับ (รูป 1 = ปก …)
 *    ตั้งทั้งโฟลเดอร์ (applyRowMode) / ทีละรูปทับได้
 * 3) planRoute: ตรวจทุกรูปก่อนอัป (ยังไม่เลือกสี · ไม่มีร้าน · ปกเกิน 1 · เพดาน 9/8 · Hero/PNG ช่องละ 1) + สรุปต่อช่อง
 * 4) ขนาดรูป: ลดอัตโนมัติตามช่อง / ลดเท่ากันทุกช่อง / ไม่ลด (เกิน 20 MB ลดให้เสมอ)
 */
import {
  MAX_SKU_WEB_IMAGES,
  buildCodeIndex,
  codeLike,
  findCodePrefix,
  parseSuffix,
  splitPath,
  type CodeRef,
  type MassImageItem,
} from "@/lib/website-image-match";
import { BIG_IMAGE_MAX_BYTES } from "@/lib/media-upload-limits";
import { tr } from "@/lib/lang";   // ป้าย/ข้อความ 2 ภาษา — ป้ายคงที่เป็น getter (อ่านภาษาตอนแสดง) · ข้อความในฟังก์ชันแปลตอนเรียก
import { DEFAULT_ROLE_FOLDERS, folderLabelKey, matchesRoleWord, versionOfFolder, type RoleFolderConfig } from "@/lib/role-folders";
export { DEFAULT_ROLE_FOLDERS, cleanRoleFolders, folderLabelKey, versionOfFolder, type RoleFolderConfig } from "@/lib/role-folders";

export type RouteDest = "skuMain" | "sku" | "parent" | "desc" | "webColor" | "heroD" | "heroM" | "png" | "skip";
type RealDest = Exclude<RouteDest, "skip">;

export const DEST_LABEL: Record<RouteDest, string> = {
  get skuMain() { return tr("รูปหลัก SKU ลูก (ปก)", "Child SKU main image (cover)"); },
  get sku() { return tr("รูป SKU ลูก", "Child SKU images"); },
  get parent() { return tr("แกลเลอรี Parent", "Parent gallery"); },
  get desc() { return tr("รูป Description", "Description images"); },
  get webColor() { return tr("รูปบนเว็บ · สีนี้", "Web images · this color"); },
  get heroD() { return tr("Hero คอม", "Hero desktop"); },
  get heroM() { return tr("Hero มือถือ", "Hero mobile"); },
  get png() { return tr("รูปตัด PNG", "PNG cut-out"); },
  get skip() { return tr("ข้าม ไม่อัป", "Skip, don't upload"); },
};
/** ช่องรูปของสินค้าในระบบ (ERP) / ช่องของหน้าเว็บร้าน — ใช้แบ่งกลุ่มในช่องเลือก */
export const ERP_DESTS: RealDest[] = ["skuMain", "sku", "parent", "desc", "png"];
export const WEB_DESTS: RealDest[] = ["webColor", "heroD", "heroM"];
/** ช่องที่ต้องรู้ว่าเป็นสีไหน */
export const NEED_COLOR: RouteDest[] = ["skuMain", "sku", "webColor"];
/** แกลเลอรีรูปสินค้า (SKU ลูก / Parent) มีได้สูงสุด */
export const GALLERY_MAX = 9;

export interface RouteSku {
  id: string;
  code: string;
  /** ชื่อสี */
  label: string;
  /** รหัสไซส์ของสีเดียวกัน (BCG12-01-L) */
  aliases?: string[];
  /** จำนวนรูปในแกลเลอรีตอนนี้ */
  gallery: number;
}
export interface RouteParent {
  parentId: string;
  code: string;
  name: string;
  gallery: number;
  desc: number;
  png: boolean;
  /** ร้านที่ขายรุ่นนี้ */
  shopIds: string[];
  skus: RouteSku[];
  /** รูปบนเว็บรายสีต่อร้าน: shopId → skuId → จำนวน */
  webColor?: Record<string, Record<string, number>>;
  /** Hero เดิมต่อร้าน */
  hero?: Record<string, { desktop: boolean; mobile: boolean }>;
}

export const routeCodeIndex = (parents: RouteParent[]): CodeRef[] => buildCodeIndex(parents);

// ───────────── จับคู่ชื่อโฟลเดอร์/ไฟล์ ─────────────

/** โฟลเดอร์นี้เป็นของรุ่นไหน สีไหน (skuId null = ทั้งรุ่น ไม่ผูกสี) */
export interface FolderTarget {
  parentId: string;
  skuId: string | null;
}
export type MatchHow = "color" | "size" | "parent" | "file" | "none" | "user";
export interface FolderMatch {
  target: FolderTarget | null;
  how: MatchHow;
  /** ข้อความบอกคน เช่น "รหัสไซส์ L → สีน้ำตาล" / "ไม่มีสี 07 ในรุ่น BCG11" */
  note?: string;
  /** จับคู่ไม่ได้แต่รู้รุ่น (รหัสสีไม่มีในรุ่น) */
  guessParentId?: string | null;
}

export function matchName(name: string, parents: RouteParent[], index: CodeRef[]): FolderMatch {
  const hit = findCodePrefix(name.trim(), index);
  if (!hit) {
    const c = codeLike(name.trim());
    return { target: null, how: "none", note: c ? tr(`ไม่พบรหัส ${c}`, `Code ${c} not found`) : tr("ชื่อไม่มีรหัสสินค้า", "No product code in the name") };
  }
  const { ref, rest } = hit;
  const p = parents.find((x) => x.parentId === ref.parentId);
  if (ref.skuId) {
    const s = p?.skus.find((x) => x.id === ref.skuId);
    if (s && s.code.toUpperCase() !== ref.code) {
      const size = ref.code.slice(s.code.length).replace(/^[-_\s]+/, "") || ref.code;
      return { target: { parentId: ref.parentId, skuId: ref.skuId }, how: "size", note: tr(`รหัสไซส์ ${size} → สี${s.label}`, `Size code ${size} → color ${s.label}`) };
    }
    return { target: { parentId: ref.parentId, skuId: ref.skuId }, how: "color" };
  }
  // รหัสรุ่น + "-xx" แต่รุ่นนี้ไม่มีสีนั้น → ไม่เดา ให้เลือกเอง
  const dash = rest.match(/^-([A-Za-z0-9#.]+)/);
  if (dash && p && p.skus.length) return { target: null, how: "none", guessParentId: p.parentId, note: tr(`ไม่มีสี ${dash[1].toUpperCase()} ในรุ่น ${p.code}`, `No color ${dash[1].toUpperCase()} in model ${p.code}`) };
  return { target: { parentId: ref.parentId, skuId: null }, how: "parent" };
}

export interface RouteFileIn {
  id: string;
  /** "โฟลเดอร์/…/ชื่อไฟล์" (filePathOf) หรือชื่อไฟล์ */
  path: string;
}
/** กลุ่มจากโฟลเดอร์หน้าที่: desc = รูป Description ของรุ่น · archive = โฟลเดอร์เก็บไฟล์ (Images/Rawfiles · ไม่ลงระบบ) · old = Description เวอร์ชันเก่า */
export type GroupRole = "desc" | "archive" | "old";
export interface RouteGroup {
  key: string;
  /** ชื่อที่โชว์ (ชื่อโฟลเดอร์ลึกสุด / รหัสของไฟล์เดี่ยว) */
  label: string;
  match: FolderMatch;
  /** เรียงตามชื่อไฟล์แบบตัวเลข (1, 2, 10 · IMG_4519 < IMG_4521) */
  fileIds: string[];
  /** มาจากโฟลเดอร์หน้าที่ (ไม่มี = โฟลเดอร์รหัสตามเดิม) → ตั้งทั้งกลุ่มตั้งต้น: desc = รูป Description · archive/old = ข้าม */
  role?: GroupRole;
  /** ชื่อไฟล์บอกช่องเองตามรหัส: ไฟล์ชื่อ = รหัส SKU ในโฟลเดอร์รุ่น → ปก · .png ชื่อ = รหัส → รูปตัด PNG */
  hints?: Record<string, RouteDest>;
}

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const baseNameOf = (path: string) => splitPath(path).base;

// ───────────── โฟลเดอร์หน้าที่ (Description / Images / Rawfiles) + เวอร์ชัน ─────────────
// ชื่อโฟลเดอร์ + การอ่านค่าตั้ง อยู่ที่ lib/role-folders (ของกลาง ไม่ import อะไร)

export interface FileRoleInfo {
  role: GroupRole | null;
  /** โฟลเดอร์ตั้งแต่รากถึงโฟลเดอร์หน้าที่ (เช่น "BSD15/[01] Description") */
  roleChain?: string;
  /** ชื่อโฟลเดอร์หน้าที่ */
  roleFolder?: string;
  /** โฟลเดอร์เหนือโฟลเดอร์หน้าที่ (ลึกสุดก่อน) — ใช้หารุ่น */
  above?: string[];
  /** เวอร์ชันของไฟล์ใน Description (ไฟล์ชั้นบน = 1) */
  version?: number;
}

/** ไฟล์แต่ละไฟล์อยู่ในโฟลเดอร์หน้าที่ไหม · Description มีหลายเวอร์ชัน → ใช้เวอร์ชันสูงสุด ที่เหลือ = old */
export function fileRoles(paths: string[], cfg: RoleFolderConfig = DEFAULT_ROLE_FOLDERS): FileRoleInfo[] {
  const out: FileRoleInfo[] = paths.map((p) => {
    const folders = [...splitPath(p).folders].reverse();   // รากก่อน
    for (let i = 0; i < folders.length; i++) {
      const k = folderLabelKey(folders[i]);
      // ตรงตัว หรือตามด้วยเลข/ขีด ("Images 2") · ชื่อขึ้นต้นด้วยขีดล่าง ("_Description") ตัดออกแล้วใน folderLabelKey
      const isDesc = matchesRoleWord(k, cfg.desc), isArch = matchesRoleWord(k, cfg.archive);
      if (!isDesc && !isArch) continue;
      const base = { roleChain: folders.slice(0, i + 1).join("/"), roleFolder: folders[i], above: folders.slice(0, i).reverse() };
      if (isArch) return { role: "archive" as const, ...base };
      return { role: "desc" as const, ...base, version: (folders[i + 1] != null ? versionOfFolder(folders[i + 1]) : null) ?? 1 };
    }
    return { role: null };
  });
  const maxVer = new Map<string, number>();
  for (const r of out) if (r.role === "desc") maxVer.set(r.roleChain!, Math.max(maxVer.get(r.roleChain!) ?? 1, r.version ?? 1));
  for (const r of out) if (r.role === "desc" && (r.version ?? 1) < (maxVer.get(r.roleChain!) ?? 1)) r.role = "old";
  return out;
}

const extOfPath = (p: string) => (p.match(/\.([^./\\]+)$/)?.[1] ?? "").toLowerCase();

/** จัดไฟล์เป็นกลุ่มตามโฟลเดอร์ + จับคู่แต่ละกลุ่มกับรุ่น/สี (roles = รู้จักโฟลเดอร์หน้าที่ · ไม่ส่ง = ค่าเริ่มต้น) */
export function groupRouteFiles(files: RouteFileIn[], parents: RouteParent[], index: CodeRef[] = routeCodeIndex(parents), roles: RoleFolderConfig = DEFAULT_ROLE_FOLDERS): RouteGroup[] {
  type G = { label: string; folders: string[]; files: { id: string; base: string; path: string }[]; match?: FolderMatch; role?: GroupRole };
  const groups = new Map<string, G>();
  const roleInfo = fileRoles(files.map((f) => f.path), roles);
  files.forEach((f, i) => {
    const { base, folders } = splitPath(f.path);
    const ri = roleInfo[i];
    let key: string;
    let label: string;
    let match: FolderMatch | undefined;
    let role: GroupRole | undefined;
    let gFolders = folders;
    if (ri.role) {
      // โฟลเดอร์หน้าที่: หารุ่นจากโฟลเดอร์ที่อยู่เหนือมัน (ไม่ผูกสี)
      role = ri.role;
      gFolders = ri.above ?? [];
      const ver = ri.role === "old" ? ` · Ver.${ri.version}` : "";
      key = `r:${ri.role}:${ri.roleChain}${ver}`;
      label = `${ri.roleFolder}${ver}`;
    } else if (folders.length) {
      key = `d:${[...folders].reverse().join("/")}`;
      label = folders[0];
    } else {
      // ไฟล์เดี่ยว: รวมกลุ่มตามรหัสในชื่อไฟล์
      match = matchName(base, parents, index);
      const t = match.target;
      key = t ? `f:${t.parentId}|${t.skuId ?? "P"}` : match.guessParentId ? `f:?${match.guessParentId}` : "f:none";
      label = t ? `${codeOfTarget(t, parents) ?? base} · ${tr("ไฟล์เดี่ยว", "single file")}` : tr("ไฟล์ที่ไม่มีโฟลเดอร์", "Files without a folder");
    }
    const g = groups.get(key) ?? { label, folders: gFolders, files: [], match, role };
    g.files.push({ id: f.id, base, path: f.path });
    groups.set(key, g);
  });

  const resolved: (G & { key: string; match: FolderMatch; hints: Record<string, RouteDest> })[] = [];
  for (const [key, g] of groups) {
    let match = g.match;
    if (!match) {
      // ชื่อโฟลเดอร์ (ลึกสุดก่อน) → โฟลเดอร์แรกที่ "เป็นรหัส" ชนะ (รหัสสีที่ไม่มีในรุ่น = ให้เลือกเอง ไม่ตกไปเป็นของทั้งรุ่นจากโฟลเดอร์ชั้นนอก)
      // → ไม่มีรหัสเลย = ดูชื่อไฟล์ข้างใน
      const tries = g.folders.map((n) => matchName(n, parents, index));
      match = tries.find((m) => m.target || m.guessParentId);
      if (!match && g.role !== "archive") {
        const byFile = g.files.map((x) => matchName(x.base, parents, index)).find((m) => m.target);
        match = byFile ? { ...byFile, how: "file", note: tr("จับคู่จากชื่อไฟล์ข้างใน", "Matched from the file names inside") } : tries[0];
      }
    }
    match = match ?? { target: null, how: "none" };
    if (g.role === "desc" || g.role === "old") {
      // Description เป็นของทั้งรุ่น (ไม่ผูกสี)
      const t = match.target ? { parentId: match.target.parentId, skuId: null } : null;
      const code = t ? codeOfTarget(t, parents) : null;
      match = { ...match, target: t, note: g.role === "old" ? tr("Description เวอร์ชันเก่า — ข้าม (ใช้เวอร์ชันล่าสุด)", "Old Description version — skipped (latest is used)") : code ? tr(`โฟลเดอร์ Description → รูป Description ของรุ่น ${code}`, `Description folder → Description images of model ${code}`) : match.note };
    }
    if (g.role === "archive") match = { target: null, how: "none", note: tr("โฟลเดอร์เก็บไฟล์ — ไม่ลงระบบ", "Archive folder — not uploaded") };
    resolved.push({ ...g, key, match, hints: {} });
  }

  // ชื่อไฟล์ = รหัสตรงตัว: ในโฟลเดอร์ระดับรุ่น ไฟล์ชื่อ = รหัส SKU → ย้ายไปกลุ่ม SKU นั้นเป็น "ปก" · .png ชื่อ = รหัส → รูปตัด PNG
  const extra = new Map<string, G & { key: string; match: FolderMatch; hints: Record<string, RouteDest> }>();
  for (const g of resolved) {
    if (g.role) continue;
    const t = g.match.target;
    const keep: G["files"] = [];
    for (const f of g.files) {
      const hit = findCodePrefix(f.base.trim(), index);
      const exact = !!hit && hit.rest === "" && (!t || hit.ref.parentId === t.parentId);
      const isPng = extOfPath(f.path) === "png";
      if (exact && isPng) { g.hints[f.id] = "png"; keep.push(f); continue; }
      if (exact && hit!.ref.skuId && t?.skuId === hit!.ref.skuId) { g.hints[f.id] = "skuMain"; keep.push(f); continue; }
      if (exact && hit!.ref.skuId && t && !t.skuId && !g.key.startsWith("f:")) {
        const key = `f:${hit!.ref.parentId}|${hit!.ref.skuId}`;
        const target = { parentId: hit!.ref.parentId, skuId: hit!.ref.skuId };
        const x = extra.get(key) ?? resolved.find((r) => r.key === key) ?? { key, label: `${codeOfTarget(target, parents) ?? f.base} · ${tr("ไฟล์ชื่อรหัส", "file named by code")}`, folders: [], files: [], match: { target, how: "file" as const, note: tr("ไฟล์ชื่อตรงรหัส SKU → ปก", "File named exactly as the SKU code → cover") }, hints: {} };
        x.files.push(f);
        x.hints[f.id] = "skuMain";
        if (!resolved.includes(x)) extra.set(key, x);
        continue;
      }
      keep.push(f);
    }
    g.files = keep;
  }
  const out: RouteGroup[] = [];
  for (const g of [...resolved, ...extra.values()]) {
    if (!g.files.length) continue;
    const sorted = [...g.files].sort((a, b) => natural.compare(a.base, b.base));
    const r: RouteGroup = { key: g.key, label: g.label, match: g.match, fileIds: sorted.map((x) => x.id) };
    if (g.role) r.role = g.role;
    if (Object.keys(g.hints).length) r.hints = g.hints;
    out.push(r);
  }
  return out.sort((a, b) => natural.compare(a.label, b.label));
}

/** ตั้งต้นของกลุ่มตามหน้าที่: Description → ทุกรูปเป็น Description · เก็บไฟล์/เวอร์ชันเก่า → ข้าม · ปกติ → ตามแม่แบบ */
export const defaultRowModeOf = (g: { role?: GroupRole }): RowMode => (g.role === "desc" ? "desc" : g.role ? "skip" : "tpl");

export function codeOfTarget(t: FolderTarget, parents: RouteParent[]): string | null {
  const p = parents.find((x) => x.parentId === t.parentId);
  if (!p) return null;
  return t.skuId ? (p.skus.find((s) => s.id === t.skuId)?.code ?? p.code) : p.code;
}

/** รหัสที่น่าจะเป็นสินค้าในชื่อโฟลเดอร์/ไฟล์ทั้งหมด → ส่งให้ API หารุ่น (คงตัวพิมพ์เดิม — รหัสใน DB บางตัวเป็นตัวเล็ก · ไม่ซ้ำ) */
export function candidateCodes(paths: string[]): string[] {
  const out = new Map<string, string>();
  for (const p of paths) {
    const { base, folders } = splitPath(p);
    for (const n of [base, ...folders]) {
      const c = codeLike(n.trim());
      if (c && !out.has(c.toUpperCase())) out.set(c.toUpperCase(), c);
    }
  }
  return [...out.values()].slice(0, 300);
}

/** รหัสยาว → รหัสที่สั้นลงตามตัวคั่น (BCG12-01-L → BCG12-01-L, BCG12-01, BCG12) — API ใช้หารุ่น */
export function codePrefixes(code: string): string[] {
  const parts = code.trim().split("-");
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("-")).filter(Boolean);
}

// ───────────── ช่องจากชื่อไฟล์ + แม่แบบ ─────────────

const TH = "\\u0E00-\\u0E7F";
const word = (w: string) => new RegExp(`(^|[^a-z${TH}])(${w})(?![a-z${TH}])`, "i");
const COVER_RE = word("ปก|cover|main");
const DESC_RE = word("desc|description|รายละเอียด");
const PNG_RE = word("png|cutout|รูปตัด");

/** ชื่อไฟล์บอกช่องเอง: hero / hero_m (กติกาเดียวกับลงรูปเว็บ) · png · desc · ปก — ไม่มีคำพวกนี้ = null (ใช้แม่แบบ) */
export function destFromName(base: string, parentLevel: boolean): RouteDest | null {
  const { hero } = parseSuffix(base);
  if (hero) return hero === "mobile" ? "heroM" : "heroD";
  if (PNG_RE.test(base)) return "png";
  if (DESC_RE.test(base)) return "desc";
  if (COVER_RE.test(base)) return parentLevel ? "parent" : "skuMain";
  return null;
}

/** แม่แบบ: รูปลำดับที่ n ของโฟลเดอร์สี → ช่องไหน (ที่เหลือ = rest) · โฟลเดอร์ทั้งรุ่น → parentFolder */
export interface RouteTemplate {
  pos: Record<string, RouteDest>;
  rest: RouteDest;
  parentFolder: RouteDest;
}
export const DEFAULT_TEMPLATE: RouteTemplate = { pos: { "1": "skuMain" }, rest: "sku", parentFolder: "parent" };
const DESTS = Object.keys(DEST_LABEL) as RouteDest[];
const isDest = (v: unknown): v is RouteDest => typeof v === "string" && (DESTS as string[]).includes(v);

/** ตรวจค่าแม่แบบที่อ่านจากที่เก็บค่าตั้ง (ผิดรูป = null) */
export function parseTemplate(raw: unknown): RouteTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isDest(o.rest) || !isDest(o.parentFolder) || !o.pos || typeof o.pos !== "object") return null;
  const pos: Record<string, RouteDest> = {};
  for (const [k, v] of Object.entries(o.pos as Record<string, unknown>)) if (/^\d{1,2}$/.test(k) && isDest(v)) pos[k] = v;
  return { pos, rest: o.rest, parentFolder: o.parentFolder };
}

/** จำแม่แบบจากรูปที่ตั้งไว้ตอนนี้ (โฟลเดอร์สีที่มีรูปมากสุด + โฟลเดอร์ทั้งรุ่น) */
export function templateFrom(colorDests: RouteDest[] | null, parentDests: RouteDest[] | null, prev: RouteTemplate): RouteTemplate {
  const pos: Record<string, RouteDest> = colorDests ? Object.fromEntries(colorDests.map((d, i) => [String(i + 1), d])) : prev.pos;
  const common = (ds: RouteDest[]) => [...ds].sort((a, b) => ds.filter((x) => x === b).length - ds.filter((x) => x === a).length)[0];
  return { pos, rest: colorDests ? "sku" : prev.rest, parentFolder: parentDests?.length ? common(parentDests) : prev.parentFolder };
}

export type RowMode = "tpl" | "skuAll" | "parent" | "desc" | "webColor" | "skip";
export const ROW_MODE_LABEL: Record<RowMode, string> = {
  get tpl() { return tr("ตามแม่แบบ", "Follow template"); },
  get skuAll() { return tr("ทุกรูป → SKU ลูก (รูปแรก = ปก)", "All → child SKU (first = cover)"); },
  get parent() { return tr("ทุกรูป → แกลเลอรี Parent", "All → Parent gallery"); },
  get desc() { return tr("ทุกรูป → รูป Description", "All → Description images"); },
  get webColor() { return tr("ทุกรูป → รูปบนเว็บ · สีนี้", "All → web images · this color"); },
  get skip() { return tr("ข้ามทั้งโฟลเดอร์", "Skip the whole folder"); },
};
export interface RouteImage {
  id: string;
  base: string;
  dest: RouteDest;
  /** ตั้งจาก: ชื่อไฟล์ · แม่แบบ · ตั้งทั้งโฟลเดอร์ · เลือกเอง · เคยอัปแล้ว (ข้ามให้) */
  by: "name" | "tpl" | "row" | "user" | "seen";
}

/**
 * ตั้งช่องให้ทั้งโฟลเดอร์ตามตำแหน่งปัจจุบัน (ลากสลับลำดับแล้วเรียกซ้ำ = ช่องตามตำแหน่งใหม่)
 * loose = ไฟล์เดี่ยวไม่มีโฟลเดอร์ (BCG11-01_3.jpg) → แม่แบบ "รูป 1 = ปก" ไม่ใช้ (กันเพิ่มรูปเดียวแล้วปกเปลี่ยนโดยไม่ตั้งใจ · ชื่อไฟล์มีคำว่า ปก ยังได้)
 * seen = รูปที่เคยอัปให้รุ่นนี้แล้ว (ประวัติชุดอัป) → ข้ามให้เสมอ (เลือกช่องเองทีหลังได้ = อัปซ้ำจริง)
 */
export function applyRowMode(imgs: { id: string; base: string }[], mode: RowMode, ctx: { parentLevel: boolean; template: RouteTemplate; loose?: boolean; seen?: Set<string>; hints?: Record<string, RouteDest> }): RouteImage[] {
  return imgs.map((im, ix) => {
    if (ctx.seen?.has(im.id) && mode !== "skip") return { id: im.id, base: im.base, dest: "skip", by: "seen" };
    if (mode === "tpl") {
      // ชื่อไฟล์ = รหัสตรงตัว (groupRouteFiles hints) ก่อนคำในชื่อไฟล์/แม่แบบ
      const hd = ctx.hints?.[im.id];
      if (hd) return { id: im.id, base: im.base, dest: hd, by: "name" };
      const nd = destFromName(im.base, ctx.parentLevel);
      if (nd) return { id: im.id, base: im.base, dest: nd, by: "name" };
      let dest = ctx.parentLevel ? ctx.template.parentFolder : (ctx.template.pos[String(ix + 1)] ?? ctx.template.rest);
      if (ctx.loose && dest === "skuMain") dest = "sku";
      return { id: im.id, base: im.base, dest, by: "tpl" };
    }
    if (mode === "skuAll") return { id: im.id, base: im.base, dest: ix === 0 ? "skuMain" : "sku", by: "row" };
    return { id: im.id, base: im.base, dest: mode, by: "row" };
  });
}

// ───────────── ตรวจก่อนอัป ─────────────

export type MassMode = "append" | "replace";
export interface PlanGroupIn {
  key: string;
  label: string;
  target: FolderTarget | null;
  images: RouteImage[];
}
export type PlanState = "upload" | "skip" | "error" | "over";
export interface PlanImage {
  id: string;
  state: PlanState;
  note?: string;
  slotKey?: string;
}
export type SlotKind = "skuGallery" | "parentGallery" | "desc" | "webColor" | "heroD" | "heroM" | "png";
export interface PlanSlot {
  key: string;
  kind: SlotKind;
  parentId: string;
  skuId: string | null;
  /** รูปที่จะลง เรียงแล้ว (ปกอยู่หน้าสุด) */
  ids: string[];
  /** รูปที่จะตั้งเป็นปก (แกลเลอรี SKU ลูก) */
  coverId?: string;
  /** ร้านที่จะลง (ช่องหน้าเว็บ) */
  shopIds: string[];
  existing: number;
  total: number;
  limit: number | null;
  /** ของเดิมจะถูกแทน (Hero/PNG มีอยู่แล้ว · โหมดแทนที่) */
  replaces: boolean;
}

const slotKind = (d: RealDest): SlotKind =>
  d === "skuMain" || d === "sku" ? "skuGallery" : d === "parent" ? "parentGallery" : d === "desc" ? "desc" : d === "webColor" ? "webColor" : d;

/**
 * slotModes (ไม่บังคับ · ตัวแยกไฟล์ ERP): โหมดรายช่อง ทับ opts.mode — key = PlanSlot.key ("<parentId>|<kind>|<skuId|->")
 *   drop = จำนวนรูปเดิมที่จะเอาออก (โหมด "เลือกแทนบางรูป" = append + drop) → ที่ว่างเพิ่มตาม · ช่องรูปเดียว (PNG/hero) แทนที่เสมอ
 */
export type SlotModeOverride = { mode: MassMode; drop?: number };

export function planRoute(groups: PlanGroupIn[], parents: RouteParent[], opts: { shopIds: string[]; mode: MassMode; slotModes?: Record<string, SlotModeOverride> }): { images: Map<string, PlanImage>; slots: PlanSlot[] } {
  const byId = new Map(parents.map((p) => [p.parentId, p]));
  const images = new Map<string, PlanImage>();
  const slots = new Map<string, PlanSlot & { queue: { id: string; cover: boolean; by: RouteImage["by"] }[] }>();
  for (const g of groups) {
    for (const im of g.images) {
      const d = im.dest;
      if (d === "skip") {
        images.set(im.id, { id: im.id, state: "skip" });
        continue;
      }
      const t = g.target;
      const p = t ? byId.get(t.parentId) : undefined;
      if (!t || !p) {
        images.set(im.id, { id: im.id, state: "error", note: NEED_COLOR.includes(d) ? tr("เลือกสีก่อน", "Pick a color first") : tr("เลือกรุ่นก่อน", "Pick a model first") });
        continue;
      }
      if (NEED_COLOR.includes(d) && !t.skuId) {
        images.set(im.id, { id: im.id, state: "error", note: tr("โฟลเดอร์ทั้งรุ่น — เลือกสีก่อน", "Whole-model folder — pick a color first") });
        continue;
      }
      const shops = WEB_DESTS.includes(d) ? opts.shopIds.filter((s) => p.shopIds.includes(s)) : [];
      if (WEB_DESTS.includes(d) && !shops.length) {
        images.set(im.id, { id: im.id, state: "error", note: p.shopIds.length ? tr("ยังไม่ได้เลือกร้านที่ขายรุ่นนี้", "No shop selling this model is selected") : tr("รุ่นนี้ยังไม่ได้ขายบนเว็บ", "This model isn't sold on the website yet") });
        continue;
      }
      const kind = slotKind(d);
      const skuId = kind === "skuGallery" || kind === "webColor" ? t.skuId : null;
      const key = `${p.parentId}|${kind}|${skuId ?? "-"}`;
      const slot = slots.get(key) ?? { key, kind, parentId: p.parentId, skuId, ids: [], shopIds: shops, existing: 0, total: 0, limit: null, replaces: false, queue: [] };
      let cover = d === "skuMain";
      const prevCover = cover ? slot.queue.find((q) => q.cover) : undefined;
      if (prevCover) {
        // ปกชนกัน: ปกจากแม่แบบ (รูป 1) ยอมให้ปกที่ตั้งชัด ๆ (ชื่อไฟล์/เลือกเอง) แล้วเป็นรูปธรรมดาแทน · ตั้งชัดทั้งคู่ = ให้เลือกใหม่
        if (prevCover.by === "tpl" && im.by !== "tpl") prevCover.cover = false;
        else if (im.by === "tpl") cover = false;
        else {
          images.set(im.id, { id: im.id, state: "error", note: tr("ปกได้รูปเดียว — เลือกช่องอื่น", "Only one cover allowed — pick another slot") });
          continue;
        }
      }
      slot.queue.push({ id: im.id, cover, by: im.by });
      slots.set(key, slot);
    }
  }
  const out: PlanSlot[] = [];
  for (const s of slots.values()) {
    const p = byId.get(s.parentId)!;
    let current = 0;
    let limit: number | null = null;
    if (s.kind === "skuGallery") {
      current = p.skus.find((x) => x.id === s.skuId)?.gallery ?? 0;
      limit = GALLERY_MAX;
    } else if (s.kind === "parentGallery") {
      current = p.gallery;
      limit = GALLERY_MAX;
    } else if (s.kind === "desc") {
      current = p.desc;
    } else if (s.kind === "webColor") {
      current = Math.max(0, ...s.shopIds.map((sh) => p.webColor?.[sh]?.[s.skuId ?? ""] ?? 0));
      limit = MAX_SKU_WEB_IMAGES;
    } else {
      current = s.kind === "png" ? (p.png ? 1 : 0) : s.shopIds.some((sh) => p.hero?.[sh]?.[s.kind === "heroD" ? "desktop" : "mobile"]) ? 1 : 0;
      limit = 1;
    }
    const single = s.kind === "heroD" || s.kind === "heroM" || s.kind === "png";
    // โหมดแทนที่: แกลเลอรี + รูป Description + รูปบนเว็บ (Description เดิมเอาออกแล้วคืนได้ตอนย้อนชุด — lib/image-batches descReplaced)
    const ov = opts.slotModes?.[s.key];
    const replaceAll = single || (ov?.mode ?? opts.mode) === "replace";
    const existing = replaceAll ? 0 : Math.max(0, current - Math.max(0, Math.round(ov?.drop ?? 0)));
    const ordered = [...s.queue.filter((q) => q.cover), ...s.queue.filter((q) => !q.cover)];
    const room = limit == null ? ordered.length : Math.max(0, limit - existing);
    const take = ordered.slice(0, room);
    for (const q of take) images.set(q.id, { id: q.id, state: "upload", slotKey: s.key });
    for (const q of ordered.slice(room)) {
      images.set(q.id, { id: q.id, state: "over", note: single ? tr("ช่องนี้มีได้ 1 รูป — ใช้รูปแรก", "This slot takes 1 image — using the first") : tr(`เกิน ${limit} รูป — ไม่ลง`, `Over ${limit} images — not uploaded`) });
    }
    if (!take.length) continue;
    const coverId = take.find((q) => q.cover)?.id;
    out.push({ key: s.key, kind: s.kind, parentId: s.parentId, skuId: s.skuId, ids: take.map((q) => q.id), coverId, shopIds: s.shopIds, existing, total: existing + take.length, limit, replaces: replaceAll && current > 0 });
  }
  return { images, slots: out };
}

// ───────────── เตือน (ยังอัปได้) ─────────────

export interface ImageFacts {
  width: number | null;
  height: number | null;
  bytes: number;
  isPng: boolean;
  /** ไฟล์เดียวกันซ้ำในชุดนี้ (ชื่อที่โชว์ของไฟล์แรก) */
  dupOf?: string | null;
}
export function imageWarning(dest: RouteDest, f: ImageFacts, resize: { forced: boolean }): string | null {
  if (dest === "skip") return null;
  if (f.dupOf) return tr(`ซ้ำกับ ${f.dupOf}`, `Duplicate of ${f.dupOf}`);
  const w = f.width ?? 0;
  const h = f.height ?? 0;
  if (dest === "heroD" && w && (w < 1920 || w / Math.max(h, 1) < 1.5)) return tr("เล็ก/ไม่ใช่แนวนอน 16:9 (ควรกว้าง ≥ 1,920)", "Too small / not 16:9 landscape (should be ≥ 1,920 wide)");
  if (dest === "heroM" && w && w < 1080) return tr("เล็กเกิน (ควรกว้าง ≥ 1,080)", "Too small (should be ≥ 1,080 wide)");
  if (dest === "png" && !f.isPng) return tr("ไม่ใช่ไฟล์ PNG พื้นใส", "Not a transparent PNG");
  if (resize.forced) return tr(`ไฟล์ ${mb(f.bytes)} MB เกิน 20 MB — จะลดให้`, `File is ${mb(f.bytes)} MB, over 20 MB — will be reduced`);
  if (w && w < 1000) return tr(`รูปเล็ก ${w}px ซูมแล้วแตก`, `Small image (${w}px) — looks blurry when zoomed`);
  return null;
}

// ───────────── ขนาดรูป ─────────────

export type ResizeMode = "auto" | "fixed" | "none";
/** ลดอัตโนมัติ: กว้างสูงสุดต่อช่อง (ตรงกับที่แต่ละช่องใช้จริง) */
export const RESIZE_AUTO: Record<RealDest, number> = { skuMain: 1500, sku: 1500, parent: 1500, desc: 1200, webColor: 2000, heroD: 2560, heroM: 1440, png: 2000 };
export const RESIZE_FIXED_OPTIONS = [1200, 1600, 2000, 2500, 3000] as const;
export const RESIZE_HINT: Record<ResizeMode, string> = {
  get auto() { return tr("รูปสินค้า 1,500 px · รูปบนเว็บ 2,000 px · Hero คอม 2,560 px · Hero มือถือ 1,440 px · Description 1,200 px · รูปที่เล็กกว่านี้ไม่ขยาย", "Product images 1,500 px · web 2,000 px · Hero desktop 2,560 px · Hero mobile 1,440 px · Description 1,200 px · smaller images aren't enlarged"); },
  get fixed() { return tr("ทุกช่องย่อให้กว้างไม่เกินที่เลือก · รูปที่เล็กกว่านี้ไม่ขยาย", "Every slot is resized to at most the chosen width · smaller images aren't enlarged"); },
  get none() { return tr("เก็บไฟล์ตัวเต็มตามที่ถ่ายมา · อัปช้ากว่าและใช้พื้นที่มากกว่า · ไฟล์เกิน 20 MB จะถูกลดให้ · หน้าจอยังเปิดเร็ว เพราะระบบย่อตอนแสดงผลให้อยู่แล้ว", "Keeps the full original file · slower upload and more storage · files over 20 MB are reduced · pages stay fast because images are resized when shown"); },
};

/** กว้างสูงสุดที่จะย่อ · null = เก็บตัวเต็ม · forced = เลือกไม่ลด แต่ไฟล์ใหญ่เกิน 20 MB */
export function resizeWidth(dest: RouteDest, mode: ResizeMode, px: number, bytes: number): { width: number | null; forced: boolean } {
  if (dest === "skip") return { width: null, forced: false };
  if (mode === "none") return bytes > BIG_IMAGE_MAX_BYTES ? { width: RESIZE_AUTO[dest], forced: true } : { width: null, forced: false };
  return { width: mode === "fixed" ? px : RESIZE_AUTO[dest], forced: false };
}

/** ขนาดไฟล์หลังย่อ (ประมาณตามพื้นที่ภาพ) */
export function estimateBytes(bytes: number, srcWidth: number | null, width: number | null): number {
  if (!width || !srcWidth || srcWidth <= width) return bytes;
  return Math.min(bytes, Math.max(80_000, Math.round(bytes * (width / srcWidth) ** 2)));
}

export const mb = (bytes: number) => {
  const v = bytes / 1024 / 1024;
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
};

// ───────────── ช่องหน้าเว็บ → คำขอบันทึก ─────────────

/** รูปที่อัปเสร็จแล้วของช่องหน้าเว็บ → items ของ /api/website/listings/images (ตัวรวมกลางของลงรูปเว็บทีละมาก) */
export function buildWebItems(done: { parentId: string; skuId: string | null; dest: RouteDest; key: string }[]): MassImageItem[] {
  const items = new Map<string, MassImageItem>();
  for (const d of done) {
    if (!WEB_DESTS.includes(d.dest as RealDest)) continue;
    const it = items.get(d.parentId) ?? { parentId: d.parentId };
    if (d.dest === "webColor" && d.skuId) it.skus = { ...(it.skus ?? {}), [d.skuId]: [...(it.skus?.[d.skuId] ?? []), d.key] };
    else if (d.dest === "heroD" && !it.hero?.desktop) it.hero = { ...(it.hero ?? {}), desktop: d.key };
    else if (d.dest === "heroM" && !it.hero?.mobile) it.hero = { ...(it.hero ?? {}), mobile: d.key };
    items.set(d.parentId, it);
  }
  return [...items.values()];
}
