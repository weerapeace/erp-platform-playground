/**
 * 🗂️ ตัวแยกไฟล์ ERP — สูตร "งานสินค้า" (ของกลาง · pure ไม่แตะ DB)
 * โยนโฟลเดอร์รุ่น 1 โฟลเดอร์ (เช่น BSD15) → แต่ละไฟล์ลงช่องรูปไหนของสินค้า / เก็บบน Z:
 *   ใช้ตัวจับคู่และตัวตรวจกลางชุดเดียวกับปุ่ม 📂 จัดรูปหลายโฟลเดอร์ในเว็บ (lib/product-image-routing)
 *   → โปรแกรมบนเครื่องไม่ต้องคิดเอง แค่ทำตามแผน (POST /api/file-sort/plan profile=product)
 *
 * กติกา:
 *   รูป (jpg/jpeg/png/webp) ในโฟลเดอร์รหัสรุ่น → แกลเลอรี Parent · โฟลเดอร์รหัสสี → แกลเลอรี SKU (รูป 1 = ปก)
 *   โฟลเดอร์ Description → รูป Description ของรุ่น (Ver.N ใช้เวอร์ชันล่าสุด)
 *   ไฟล์ชื่อ = รหัส SKU → ปกของ SKU นั้น · .png ชื่อ = รหัส → รูปตัด PNG
 *   Images / Rawfiles / ไฟล์ที่ไม่ใช่รูป (PSD, RAW …) / จับคู่รหัสไม่ได้ / เกินเพดาน → ไม่ลงระบบ (อยู่บน Z:)
 *   ทุกไฟล์ (ยกเว้นไฟล์ระบบ) อยู่บน Z: เสมอ: โฟลเดอร์อยู่บน Z: แล้ว = ไม่ทำอะไร · ไม่อยู่ = โปรแกรมก๊อปไปที่ nasRoot\<รุ่น>
 *   สูตรนี้ไม่ลบต้นฉบับ · ย้ายเฉพาะโฟลเดอร์ Rawfiles / Images ตามค่าตั้ง cfg.moves หลังลงรูปเสร็จ (planProductMoves · โปรแกรมเลือกปิดได้ทีละงาน)
 *   แล้วเก็บทั้งโฟลเดอร์เข้า Collection ตามแบรนด์ (cfg.collection · planProductCollection · แบบปุ่ม Arrange) — ปิดได้ทีละงานเช่นกัน
 */
import {
  DEFAULT_TEMPLATE,
  GALLERY_MAX,
  RESIZE_AUTO,
  applyRowMode,
  codeOfTarget,
  defaultRowModeOf,
  groupRouteFiles,
  planRoute,
  routeCodeIndex,
  type GroupRole,
  type MassMode,
  type PlanGroupIn,
  type RouteDest,
  type SlotKind,
  type SlotModeOverride,
} from "@/lib/product-image-routing";
import type { CatalogParent } from "@/lib/product-image-catalog-server";
import { COLLECTION_OLD_FOLDER, MOVE_ROLES, collectionPatternFor, fillNasPattern, isJunkFile, nasDateValues, relPathOf, safeFolderName, type CollectionExists, type MoveRole, type ProductSortConfig, type ProductVariant } from "@/lib/file-sort";
import { folderLabelKey, matchesRoleWord } from "@/lib/role-folders";

export const ERP_IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"] as const;
export const PRODUCT_MAX_FILES = 3000;

export type ProductFileIn = { path: string; size?: number | null };
export type ProductFileAction = {
  /** path ในโฟลเดอร์รุ่น คั่นด้วย "/" */
  rel: string;
  name: string;
  ext: string;
  size: number | null;
  /** ลงระบบ (ERP) */
  erp: boolean;
  dest?: RouteDest;
  slotKey?: string;
  /** ย่อด้านกว้างไม่เกิน (ตามช่อง — ตรงกับปุ่ม 📂 ในเว็บ) */
  width?: number;
  /** อยู่บน Z: (ทุกไฟล์ยกเว้นไฟล์ระบบ) */
  nas: boolean;
  /** กลุ่ม (ชื่อโฟลเดอร์) */
  group: string;
  /** ทำไมไม่ลงระบบ / หมายเหตุ */
  note?: string;
  why?: "junk" | "not_image" | "archive" | "old_version" | "unmatched" | "over" | "error" | "scope" | "png" | "same" | "excluded";
};
export type ProductPlanSlot = {
  key: string;
  kind: SlotKind;
  parentId: string;
  skuId: string | null;
  /** รหัสรุ่น/สีที่โชว์ */
  code: string;
  /** รูปที่จะลง เรียงแล้ว (ปกหน้าสุด) */
  rels: string[];
  coverRel?: string;
  existing: number;
  total: number;
  limit: number | null;
  /** มีรูปเดิมที่จะเอาออกก่อนลง (remove) — แทนที่ทั้งหมด หรือเลือกแทนบางรูป */
  replaces: boolean;
  remove: { attachments: { id: string; key: string }[]; desc: { assetId: string; sort: number | null }[] };
  /** โหมดของช่องนี้: replace แทนที่ทั้งหมด · pick เลือกแทนบางรูป (remove = ที่เลือก) · append ต่อท้าย — ทับได้รายช่องจากโปรแกรม (slotModes) */
  mode: SlotFileMode;
  /** รูปที่อยู่ในระบบตอนนี้ (ไว้โชว์รูปย่อให้เลือก) · key = R2 key (Description: route เติมจากคลัง) */
  existingItems: { id: string; key: string | null; primary: boolean }[];
  /** รูปใหม่ที่ข้ามเพราะหน้าตาเหมือนรูปในระบบ (โปรแกรมเทียบรูปเองแล้วส่ง skip มา) — ไม่อัป ไม่นับเพดาน */
  skipped: string[];
  /** รูปใหม่ที่คนเลือกเองว่า "ไม่ลงรูปนี้" (กดรูปในโปรแกรม · exclude) — ไม่อัป ไม่นับเพดาน ปกคิดใหม่จากรูปที่เหลือ */
  excluded: string[];
  /** เพิ่มสี/แก้สี (scopeAsk): ช่องที่ชนิดงานไม่แตะ (Parent · Description · PNG · สีที่มีรูปแล้ว) → โปรแกรมตั้งไว้ "ไม่ลงช่องนี้" เลือกลงเองได้ */
  defaultOff: boolean;
  /** ลำดับรูปใหม่ทั้งหมดของช่องนี้ตามแม่แบบ (ปกหน้าสุด · รวมที่ข้าม) — โปรแกรมใช้จัดลำดับแกลเลอรีหลังทำ */
  order: string[];
  /** เจ้าของแกลเลอรี (ช่อง desc/png = Parent) */
  entity: { type: "skus_v2" | "parent_skus_v2"; id: string };
  /** ของเดิมไว้ "ย้อนทั้งชุด": ปกเดิมของแกลเลอรี (โหมดต่อท้าย) · รูปตัด PNG เดิม */
  prev: { primaryId: string | null; pngKey: string | null };
};
export type SlotFileMode = "replace" | "append" | "pick";
/**
 * โหมดรายช่องที่โปรแกรมส่งมา (key = ProductPlanSlot.key) · pick + remove = id รูปเดิมที่จะเอาออก (แกลเลอรี = attachment id · Description = asset id)
 * skip = rel รูปใหม่ที่หน้าตาเหมือนรูปในระบบ (ไม่อัปซ้ำ) · exclude = rel รูปใหม่ที่คนเลือกไม่ลงเอง (รูปยังอยู่บน Z:) · keep = id รูปเดิมที่ตรงกับรูปใหม่ (แทนที่ทั้งหมด/เลือกแทนบางรูปก็ไม่เอาออก)
 */
export type SlotModeInput = Record<string, { mode: SlotFileMode; remove?: string[]; skip?: string[]; exclude?: string[]; keep?: string[] }>;
export type ProductPlanGroup = {
  label: string; role: GroupRole | null; code: string | null; count: number; note?: string;
  /** key กลุ่ม (ส่งกลับมาใน folderMap เพื่อจับคู่เอง) · how = จับคู่ยังไง (slash = ตัด / ให้ · user = เลือกเอง) · guessParentId = รู้รุ่นแต่ไม่รู้สี */
  key: string; how: string; guessParentId: string | null;
  /** ปลายทางตอนนี้ (null = ไม่ลง) · guess = "outer" เดาจากโฟลเดอร์ชั้นนอก */
  target: { parentId: string; skuId: string | null } | null; guess: string | null;
  /** โปรแกรมเลือกจับคู่เอง (folderMap) · skip = เลือก "ไม่ลง" */
  user: boolean; skip: boolean;
};
/** จับคู่โฟลเดอร์เอง (โปรแกรม v1.14+): key กลุ่ม → รุ่น/สี (skuId null = แกลเลอรี Parent) หรือ skip = ไม่ลง (อยู่บน Z:) */
export type FolderMapInput = Record<string, { parentId: string; skuId: string | null } | { skip: true }>;
export type ProductPlan = {
  files: ProductFileAction[];
  slots: ProductPlanSlot[];
  groups: ProductPlanGroup[];
  counts: { total: number; erp: number; nas: number; skipped: number };
  warnings: string[];
  parents: { id: string; code: string; name: string; skus: { id: string; code: string; label: string }[] }[];
  mode: MassMode;
  variant: ProductVariant;
  /** รูป PNG ที่โปรแกรมก๊อปไปโฟลเดอร์ PNG ในโฟลเดอร์รุ่น (cfg.png) — name = ชื่อใหม่ตามรหัสสี/รุ่น เช่น PIX39-01.png (ชนกันโปรแกรมต่อ _2) */
  pngs: { rel: string; name: string }[];
  /** รูป JPEG ในโฟลเดอร์ Images ที่เลือกส่งไปหน้า Contents ได้ (ติ๊กเองในโปรแกรม · ค่าเริ่มไม่ติ๊ก) */
  contentCandidates: string[];
};

const extOf = (name: string) => (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
const isErpImage = (ext: string) => (ERP_IMAGE_EXTS as readonly string[]).includes(ext);

/**
 * variant (ชนิดงานย่อย · ตรงกับแท็บ Create Folder Tool):
 *   new   = สินค้าใหม่ — ทุกช่อง (Description · Parent · SKU · PNG)
 *   color = เพิ่มสี — เฉพาะแกลเลอรีของสีที่ยังไม่มีรูปในระบบ (Parent/Description/สีเดิมที่ก๊อปมาจาก Collection ไม่แตะ)
 *   edit  = แก้สี — เฉพาะแกลเลอรีของสีที่อยู่ในโฟลเดอร์ (Parent/Description/PNG ไม่แตะ)
 */
export function planProductSort(files: ProductFileIn[], parents: CatalogParent[], cfg: ProductSortConfig, opts: { jobFolder: string; mode?: MassMode; variant?: ProductVariant; pngGallery?: boolean; slotModes?: SlotModeInput; scopeAsk?: boolean; folderMap?: FolderMapInput; folderPick?: boolean }): ProductPlan {
  const mode: MassMode = opts.mode ?? cfg.mode;
  // เพิ่มสี/แก้สี: ช่องที่ "ไม่แตะ" ตามชนิดงาน (Parent · Description · PNG · สีที่มีรูปแล้ว) — scopeAsk (โปรแกรม v1.12+) = ส่งเป็นช่องตั้งไว้ไม่ลง ให้เลือกลงเองได้ · ไม่ส่ง = ข้ามเงียบเหมือนเดิม (โปรแกรมรุ่นเก่า)
  const offRels = new Set<string>();
  // PNG ในโฟลเดอร์สี/รุ่น: ไม่ลงแกลเลอรี (ซ้ำกับ JPEG เบอร์เดียวกัน) → ก๊อปไปโฟลเดอร์ PNG ในโฟลเดอร์รุ่นแทน · โปรแกรมติ๊กให้ลงแกลเลอรีด้วยได้
  const pngGallery = opts.pngGallery ?? cfg.png.gallery;
  const pngs: { rel: string; name: string }[] = [];
  const pngFolderKey = folderLabelKey(cfg.png.folder);   // โฟลเดอร์ PNG ที่โปรแกรมก๊อปไว้รอบก่อน → ไม่ลงระบบซ้ำ
  const oldFolderKey = folderLabelKey(COLLECTION_OLD_FOLDER);   // [99] ของเก่า (แทนที่ใน Collection) → ไม่ลงระบบ
  const variant: ProductVariant = opts.variant === "color" || opts.variant === "edit" ? opts.variant : "new";
  const job = (opts.jobFolder ?? "").replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
  const out: ProductFileAction[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    // path ส่งมาเป็น "ในโฟลเดอร์รุ่น" อยู่แล้ว — ห้ามตัดชื่อโฟลเดอร์รุ่นออกซ้ำ (โฟลเดอร์ย่อยชื่อรหัสรุ่น เช่น BSD15/BSD15/1.jpeg มีจริง)
    const rel = relPathOf(f.path);
    if (!rel || seen.has(rel.toLowerCase())) continue;
    seen.add(rel.toLowerCase());
    const name = rel.split("/").pop() ?? rel;
    const ext = extOf(name);
    const size = typeof f.size === "number" && Number.isFinite(f.size) ? f.size : null;
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    const base: ProductFileAction = { rel, name, ext, size, erp: false, nas: true, group: dir.split("/")[0] || job || "(ชั้นบน)" };
    if (isJunkFile(name)) out.push({ ...base, nas: false, why: "junk", note: "ไฟล์ระบบ — ข้าม" });
    else if (dir && folderLabelKey(dir.split("/")[0]) === pngFolderKey) out.push({ ...base, why: "archive", note: "โฟลเดอร์ PNG ที่ก๊อปไว้ — อยู่บน Z:" });
    else if (dir && folderLabelKey(dir.split("/")[0]) === oldFolderKey) out.push({ ...base, why: "archive", note: "ของเก่าที่เก็บไว้ตอนแทนที่ — อยู่บน Z:" });
    else if (!isErpImage(ext)) out.push({ ...base, why: "not_image", note: "ไม่ใช่รูปที่ลงระบบได้ — อยู่บน Z:" });
    else out.push(base);
  }

  // รูปที่ลงระบบได้ → จัดกลุ่ม/จับคู่ด้วยตัวกลาง (path นำหน้าด้วยชื่อโฟลเดอร์รุ่น ให้หารุ่นจากชื่อโฟลเดอร์ได้)
  const imgs = out.map((a, i) => ({ a, id: String(i) })).filter((x) => !x.a.why);
  const pathOf = (rel: string) => (job ? `${job}/${rel}` : rel);
  const index = routeCodeIndex(parents);
  const groups = groupRouteFiles(imgs.map((x) => ({ id: x.id, path: pathOf(x.a.rel) })), parents, index, cfg.roleFolders);
  const byId = new Map(imgs.map((x) => [x.id, x.a]));
  const planGroups: PlanGroupIn[] = [];
  const groupInfo: ProductPlanGroup[] = [];
  const warnings: string[] = [];
  for (const g of groups) {
    // จับคู่เอง (โปรแกรมเลือก "จับคู่กับ" ให้กลุ่มนี้) — เฉพาะโฟลเดอร์รหัส (ไม่ใช่โฟลเดอร์หน้าที่) · รุ่น/สีต้องอยู่ในแผนนี้จริง
    const fm = !g.role ? opts.folderMap?.[g.key] : undefined;
    let skipByUser = false;
    if (fm && "skip" in fm) skipByUser = true;
    else if (fm) {
      const p = parents.find((x) => x.parentId === fm.parentId);
      if (p && (fm.skuId === null || p.skus.some((s) => s.id === fm.skuId))) g.match = { target: { parentId: p.parentId, skuId: fm.skuId }, how: "user", note: "จับคู่เอง (เลือกในโปรแกรม)" };
    }
    const t = skipByUser ? null : g.match.target;
    const code = t ? codeOfTarget(t, parents) : null;
    groupInfo.push({ label: g.label, role: g.role ?? null, code, count: g.fileIds.length, note: skipByUser ? "ไม่ลง — เลือกเอง (อยู่บน Z:)" : g.match.note,
      key: g.key, how: g.match.how, guessParentId: g.match.guessParentId ?? g.match.target?.parentId ?? null, user: !!fm && (skipByUser || g.match.how === "user"), skip: skipByUser,
      target: t ? { parentId: t.parentId, skuId: t.skuId } : null, guess: g.match.how === "user" ? null : g.match.guess ?? null });
    for (const id of g.fileIds) byId.get(id)!.group = g.label;
    if (skipByUser) {
      for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: "archive", note: "ไม่ลง — เลือกเอง (อยู่บน Z:)" });
      continue;
    }
    if (g.role === "archive" || g.role === "old") {
      for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: g.role === "old" ? "old_version" : "archive", note: g.match.note });
      continue;
    }
    if (!t) {
      for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: "unmatched", note: g.match.note ?? "จับคู่รหัสไม่ได้" });
      warnings.push(variant === "color" && g.match.guessParentId
        ? `สีใหม่ "${g.label}" ยังไม่มีในระบบ — สร้าง SKU สีนี้ในระบบก่อน แล้วกดตรวจใหม่`
        : `"${g.label}" จับคู่กับสินค้าในระบบไม่ได้${g.match.note ? ` (${g.match.note})` : ""} — ${opts.folderPick ? "เลือก \"จับคู่กับ\" ในกลุ่มของโฟลเดอร์นี้ได้ (ไม่เลือก = ไม่ลงระบบ)" : "รูปในโฟลเดอร์นี้ไม่ลงระบบ"}`);
      continue;
    }
    // เพิ่มสี / แก้สี: แตะเฉพาะแกลเลอรีสี (เพิ่มสี = เฉพาะสีที่ยังไม่มีรูป) · ที่เหลือเป็นของที่ก๊อปมาจาก Collection
    if (variant !== "new") {
      const sku = t.skuId ? parents.find((p) => p.parentId === t.parentId)?.skus.find((s) => s.id === t.skuId) : undefined;
      const note = !t.skuId || g.role === "desc"
        ? (variant === "color" ? "ไม่แตะ — ก๊อปมาจาก Collection (เพิ่มสีลงเฉพาะสีใหม่)" : "ไม่แตะ — แก้สีลงเฉพาะแกลเลอรีสี")
        : variant === "color" && (sku?.gallery ?? 0) > 0 ? "ไม่แตะ — สีนี้มีรูปในระบบแล้ว (จะเปลี่ยนใช้ \"แก้สี\")" : "";
      if (note) {
        if (opts.scopeAsk) for (const id of g.fileIds) offRels.add(byId.get(id)!.rel);
        else {
          for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: "scope", note });
          continue;
        }
      }
    }
    const rows = g.fileIds.map((id) => ({ id, base: (byId.get(id)!.name).replace(/\.[^.]+$/, "") }));
    let images = applyRowMode(rows, defaultRowModeOf(g), { parentLevel: !t.skuId, template: DEFAULT_TEMPLATE, loose: g.key.startsWith("f:"), hints: g.hints });
    if (variant !== "new") {
      // รูปตัด PNG เป็นของทั้งรุ่น → เพิ่มสี/แก้สีไม่แตะ (scopeAsk = ตั้งไว้ไม่ลง เลือกลงได้)
      if (opts.scopeAsk) { for (const im of images) if (im.dest === "png") offRels.add(byId.get(im.id)!.rel); }
      else {
        for (const im of images) if (im.dest === "png") Object.assign(byId.get(im.id)!, { why: "scope", note: "ไม่แตะ — รูปตัด PNG เป็นของทั้งรุ่น" });
        images = images.filter((im) => im.dest !== "png");
      }
    }
    // ไฟล์ .png → ก๊อปไปโฟลเดอร์ PNG (ชื่อตามรหัสสี/รุ่นที่จับคู่ได้) · ไม่ลงแกลเลอรี เว้นแต่ติ๊ก pngGallery
    if (cfg.png.mode === "copy" || !pngGallery) {
      for (const im of images) {
        const a = byId.get(im.id)!;
        if (a.ext !== "png" || !(im.dest === "parent" || im.dest === "sku" || im.dest === "skuMain" || im.dest === "png")) continue;
        if (cfg.png.mode === "copy") pngs.push({ rel: a.rel, name: `${safeFolderName(code ?? job)}.png` });
        if (!pngGallery && im.dest !== "png") Object.assign(a, { why: "png", note: cfg.png.mode === "copy" ? `PNG — ก๊อปไป ${cfg.png.folder}` : "PNG — ไม่ลงแกลเลอรี" });
      }
      if (!pngGallery) images = images.filter((im) => !(byId.get(im.id)!.ext === "png" && im.dest !== "png"));
    }
    if (!images.length) continue;
    planGroups.push({ key: g.key, label: g.label, target: t, images });
    for (const im of images) byId.get(im.id)!.dest = im.dest;
  }

  // รูปเดิมของแต่ละช่อง (key แบบเดียวกับ planRoute) + โหมดรายช่องจากโปรแกรม (เลือกแทนบางรูป = ต่อท้าย + เอาออกเฉพาะที่เลือก)
  const existingOf = (key: string): { id: string; key: string | null; primary: boolean; sort: number | null }[] => {
    const [pid, kind, sid] = key.split("|");
    const p = parents.find((x) => x.parentId === pid);
    if (!p) return [];
    if (kind === "parentGallery") return p.galleryItems.map((x) => ({ id: x.id, key: x.key, primary: x.primary, sort: null }));
    if (kind === "skuGallery") return (p.skus.find((x) => x.id === sid)?.items ?? []).map((x) => ({ id: x.id, key: x.key, primary: x.primary, sort: null }));
    if (kind === "desc") return p.descItems.map((x) => ({ id: x.assetId, key: null, primary: false, sort: x.sort }));
    return [];
  };
  const isMode = (m: unknown): m is SlotFileMode => m === "replace" || m === "append" || m === "pick";
  const slotModeOf = (key: string): SlotFileMode => { const m = opts.slotModes?.[key]?.mode; return isMode(m) ? m : mode; };
  // รูปใหม่ที่หน้าตาเหมือนรูปในระบบ (โปรแกรมเทียบเอง → skip) · รูปเดิมที่ตรงกับรูปใหม่ (keep = ไม่เอาออก)
  const skipSlot = new Map<string, string>();   // rel (ตัวเล็ก) → key ช่อง
  const excludeSlot = new Map<string, string>();   // rel (ตัวเล็ก) → key ช่อง · คนเลือกไม่ลงเอง (ชนะ skip)
  const keepOf = new Map<string, Set<string>>();
  for (const [key, v] of Object.entries(opts.slotModes ?? {})) {
    if (!v) continue;
    for (const r of Array.isArray(v.skip) ? v.skip : []) if (r) skipSlot.set(String(r).toLowerCase(), key);
    for (const r of Array.isArray(v.exclude) ? v.exclude : []) if (r) excludeSlot.set(String(r).toLowerCase(), key);
    const ids = new Set(existingOf(key).map((x) => x.id));
    const kp = new Set((Array.isArray(v.keep) ? v.keep : []).map(String).filter((id) => ids.has(id)));
    if (kp.size) keepOf.set(key, kp);
  }
  const relOfId = (id: string) => byId.get(id)!.rel;
  // ลำดับรูปใหม่ตามแม่แบบของแต่ละช่อง (รวมรูปที่จะข้าม · ปกหน้าสุด) — คิดด้วยตัวจัดช่องตัวเดิมก่อนตัดรูปที่ข้ามออก
  const naturalOrder = new Map<string, string[]>();
  if (skipSlot.size || excludeSlot.size) {
    for (const s of planRoute(planGroups, parents, { shopIds: [], mode: "replace" }).slots) naturalOrder.set(s.key, s.ids.map(relOfId));
    // รูปที่เลือกไม่ลงต้องอยู่ในช่องนั้นจริง (กันชื่อไฟล์ส่งมาผิดช่อง) — ช่องตามแม่แบบก่อนตัด
    const slotOfRel = new Map<string, string>();
    for (const [key, rels] of naturalOrder) for (const r of rels) slotOfRel.set(r.toLowerCase(), key);
    for (const g of planGroups) {
      g.images = g.images.filter((im) => {
        const a = byId.get(im.id)!;
        const lc = a.rel.toLowerCase();
        const ex = excludeSlot.get(lc);
        if (ex && slotOfRel.get(lc) === ex) { Object.assign(a, { why: "excluded", slotKey: ex, note: "ไม่ลง — เลือกเอง (รูปยังอยู่บน Z:)" }); return false; }
        const key = skipSlot.get(lc);
        if (!key) return true;
        Object.assign(a, { why: "same", slotKey: key, note: "หน้าตาเหมือนรูปในระบบ — ข้าม ไม่อัปซ้ำ" });
        return false;
      });
    }
  }
  const pickRemove = new Map<string, Set<string>>();
  const routeModes: Record<string, SlotModeOverride> = {};
  for (const [key, v] of Object.entries(opts.slotModes ?? {})) {
    if (!v || !isMode(v.mode)) continue;
    const kp = keepOf.get(key) ?? new Set<string>();
    const ids = existingOf(key).map((x) => x.id);
    if (v.mode === "pick") {
      const idSet = new Set(ids);
      const rm = new Set((Array.isArray(v.remove) ? v.remove : []).map(String).filter((id) => idSet.has(id) && !kp.has(id)));
      pickRemove.set(key, rm);
      routeModes[key] = { mode: "append", drop: rm.size };
    } else if (v.mode === "replace" && kp.size) routeModes[key] = { mode: "append", drop: ids.length - kp.size };   // แทนที่ทั้งหมด ยกเว้นรูปที่ตรงกับรูปใหม่
    else routeModes[key] = { mode: v.mode };
  }
  const plan = planRoute(planGroups.filter((g) => g.images.length), parents, { shopIds: [], mode, slotModes: routeModes });
  for (const [id, pi] of plan.images) {
    const a = byId.get(id);
    if (!a) continue;
    if (pi.state === "upload") {
      a.erp = true;
      a.slotKey = pi.slotKey;
      a.width = a.dest && a.dest !== "skip" ? RESIZE_AUTO[a.dest] : undefined;
    } else if (pi.state === "over") Object.assign(a, { why: "over", note: pi.note });
    else if (pi.state === "error") Object.assign(a, { why: "error", note: pi.note });
    else if (pi.state === "skip" && !a.why) Object.assign(a, { why: "archive", note: "ไม่ลงระบบ" });
  }
  const overs = out.filter((a) => a.why === "over");
  if (overs.length) warnings.push(`${overs.length} รูปเกินเพดานของช่อง (แกลเลอรีสูงสุด 9 · PNG 1) — ไม่ลงระบบ: ${overs.slice(0, 5).map((a) => a.rel).join(", ")}${overs.length > 5 ? " …" : ""}`);
  const errs = out.filter((a) => a.why === "error");
  if (errs.length) warnings.push(`${errs.length} รูปลงไม่ได้: ${[...new Set(errs.map((a) => a.note))].join(" · ")}`);

  const pById = new Map(parents.map((p) => [p.parentId, p]));
  const relOf = relOfId;
  const skippedOf = (key: string) => out.filter((a) => a.why === "same" && a.slotKey === key).map((a) => a.rel);
  const excludedOf = (key: string) => out.filter((a) => a.why === "excluded" && a.slotKey === key).map((a) => a.rel);
  const buildSlot = (s: { key: string; kind: SlotKind; parentId: string; skuId: string | null; ids: string[]; coverId?: string; existing: number; total: number; limit: number | null; replaces: boolean }): ProductPlanSlot => {
    const p = pById.get(s.parentId)!;
    const sku = s.skuId ? p.skus.find((x) => x.id === s.skuId) : undefined;
    const remove = { attachments: [] as { id: string; key: string }[], desc: [] as { assetId: string; sort: number | null }[] };
    const sm: SlotFileMode = s.kind === "png" ? "replace" : slotModeOf(s.key);
    const exist = existingOf(s.key);
    const kp = keepOf.get(s.key) ?? new Set<string>();
    // แทนที่ทั้งหมด = เอารูปเดิมออกทั้งช่อง (ยกเว้นที่ตรงกับรูปใหม่) · เลือกแทนบางรูป = เอาออกเฉพาะที่เลือก · ต่อท้าย = ไม่เอาออก
    const drop = sm === "replace" && kp.size ? new Set(exist.filter((x) => !kp.has(x.id)).map((x) => x.id))
      : sm === "replace" && s.replaces ? new Set(exist.map((x) => x.id))
      : sm === "pick" ? (pickRemove.get(s.key) ?? new Set<string>()) : new Set<string>();
    if (s.kind === "parentGallery" || s.kind === "skuGallery") remove.attachments = exist.filter((x) => drop.has(x.id)).map((x) => ({ id: x.id, key: x.key ?? "" }));
    if (s.kind === "desc") remove.desc = exist.filter((x) => drop.has(x.id)).map((x) => ({ assetId: x.id, sort: x.sort }));
    const primaryId = exist.find((x) => x.primary)?.id ?? null;
    const rels = s.ids.map(relOf);
    // เอารูปปกเดิมออก (เลือกเอง / แทนที่แต่เก็บบางรูป) + ไม่มีรูปปกใหม่ → รูปแรกที่ลงเป็นปก (กันแกลเลอรีไม่มีปก)
    const coverRel = s.coverId ? relOf(s.coverId) : (sm === "pick" || kp.size > 0) && primaryId && drop.has(primaryId) && rels.length ? rels[0] : undefined;
    const skipped = skippedOf(s.key);
    const excluded = excludedOf(s.key);
    const defaultOff = [...rels, ...skipped, ...excluded].some((r) => offRels.has(r));
    return {
      defaultOff,
      key: s.key, kind: s.kind, parentId: s.parentId, skuId: s.skuId, code: sku?.code ?? p.code,
      rels, coverRel,
      existing: s.existing, total: s.total, limit: s.limit,
      replaces: s.kind === "png" ? s.replaces : remove.attachments.length + remove.desc.length > 0, remove,
      mode: sm, existingItems: exist.map((x) => ({ id: x.id, key: x.key, primary: x.primary })),
      skipped, excluded, order: naturalOrder.get(s.key) ?? [...rels],
      entity: s.kind === "skuGallery" && s.skuId ? { type: "skus_v2", id: s.skuId } : { type: "parent_skus_v2", id: s.parentId },
      prev: {
        primaryId: s.kind === "skuGallery" || s.kind === "parentGallery" ? primaryId : null,
        pngKey: s.kind === "png" ? p.pngKey : null,
      },
    };
  };
  const slots: ProductPlanSlot[] = plan.slots.map(buildSlot);
  // ช่องที่รูปใหม่ "มีแล้วทุกรูป" / "เลือกไม่ลงทุกรูป" ยังต้องมีช่องไว้: โชว์ในโปรแกรม (กดเอากลับมาลงได้) + แทนที่ทั้งหมดยังเอารูปเดิมที่ไม่ตรงออก
  for (const key of new Set([...skipSlot.values(), ...excludeSlot.values()])) {
    if (slots.some((x) => x.key === key)) continue;
    const [pid, kind, sid] = key.split("|");
    if (!pById.has(pid) || !(kind === "parentGallery" || kind === "skuGallery" || kind === "desc")) continue;
    if (!skippedOf(key).length && !excludedOf(key).length) continue;
    const skuId = kind === "skuGallery" ? sid : null;
    if (kind === "skuGallery" && !pById.get(pid)!.skus.some((x) => x.id === skuId)) continue;
    const cur = existingOf(key).length;
    const sm = slotModeOf(key);
    const kept = sm === "replace" ? (keepOf.get(key)?.size ?? 0) : sm === "pick" ? cur - (pickRemove.get(key)?.size ?? 0) : cur;
    slots.push(buildSlot({ key, kind: kind as SlotKind, parentId: pid, skuId, ids: [], existing: kept, total: kept, limit: kind === "desc" ? null : GALLERY_MAX, replaces: sm === "replace" && cur > 0 }));
  }
  // เรียงช่องตามลำดับเดิม (ช่องที่ข้ามหมดไม่ไปกองท้าย)
  if (naturalOrder.size) {
    const pos = [...naturalOrder.keys()];
    const at = (k: string) => { const i = pos.indexOf(k); return i < 0 ? pos.length : i; };
    slots.sort((a, b) => at(a.key) - at(b.key));
  }
  // ปกจากแม่แบบที่ยอมให้ไฟล์ชื่อรหัส (planRoute) → ป้ายรายไฟล์ต้องตรงกับผลจริง
  const byRel = new Map(out.map((a) => [a.rel, a]));
  for (const s of slots) for (const r of s.rels) { const a = byRel.get(r); if (a?.dest === "skuMain" && r !== s.coverRel) a.dest = "sku"; }
  if (!parents.length && imgs.length) warnings.unshift(`ไม่พบสินค้าที่ตรงกับชื่อโฟลเดอร์ "${job}" ในระบบ — ตรวจรหัสรุ่น/สีให้ตรงกับ ERP`);
  else if (variant === "color" && parents.length && !slots.some((s) => !s.defaultOff)) warnings.push(slots.length
    ? "ทุกสีในโฟลเดอร์มีรูปในระบบแล้ว — ตั้งไว้ไม่ลง · เลือกลงทีละช่องได้ (สี · Parent · Description)"
    : "ไม่พบสีใหม่ที่ต้องลงรูป — ทุกสีในโฟลเดอร์มีรูปในระบบแล้ว (จะเปลี่ยนรูปใช้ \"แก้สี\")");
  else if (variant === "edit" && parents.length && !slots.some((s) => !s.defaultOff)) warnings.push(slots.length
    ? "ไม่พบโฟลเดอร์สีที่ตรงกับ SKU ในระบบ — ช่องอื่นตั้งไว้ไม่ลง เลือกลงทีละช่องได้"
    : "ไม่พบโฟลเดอร์สีที่ตรงกับ SKU ในระบบ — ไม่มีอะไรให้แก้");

  return {
    files: out,
    slots,
    groups: groupInfo,
    counts: { total: out.length, erp: out.filter((a) => a.erp).length, nas: out.filter((a) => a.nas).length, skipped: out.filter((a) => !a.erp && !a.nas).length },
    warnings,
    // skus = ไว้ให้โปรแกรมทำตัวเลือก "จับคู่กับ" (สีหลักของแต่ละสี · รหัสไซส์อยู่ใน aliases)
    parents: parents.map((p) => ({ id: p.parentId, code: p.code, name: p.name, skus: p.skus.map((s) => ({ id: s.id, code: s.code, label: s.label })) })),
    mode,
    variant,
    pngs,
    // JPEG ในโฟลเดอร์ Images (ชื่อตาม cfg.moveFolders.images) → ให้ติ๊กส่งไปหน้า Contents
    contentCandidates: out.filter((a) => (a.ext === "jpg" || a.ext === "jpeg") && a.rel.includes("/") && matchesFolderWord(a.rel.slice(0, a.rel.indexOf("/")), cfg.moveFolders.images)).map((a) => a.rel),
  };
}

/** โฟลเดอร์รุ่นบน Z: ตามแม่แบบของชนิดงานย่อย (ใช้เมื่อโฟลเดอร์ต้นทางยังไม่อยู่บน Z:) · ไม่ได้ตั้งแม่แบบ = null */
/**
 * ย้ายโฟลเดอร์ Rawfiles / Images หลังลงรูปเสร็จ (ค่าตั้ง cfg.moves) — แค่คิดปลายทาง ตัวย้ายจริงคือโปรแกรมบนเครื่อง
 *   โฟลเดอร์ชั้นบนของงานที่ชื่อ (ไม่สนเลขนำหน้า) ตรงกับ cfg.moveFolders → 1 รายการ
 *   target = แม่แบบ {แบรนด์} (โฟลเดอร์แบรนด์ของสินค้า) {รุ่น} {โฟลเดอร์} {ปี} {เดือน} · null = ยังย้ายไม่ได้ (ดู reason)
 *   โปรแกรมหาโฟลเดอร์แบรนด์ที่สะกดต่างกันบน Z: เอง + ตั้งชื่อ _v.2 เมื่อปลายทางมีแล้ว (ไม่ทับ)
 */
export type ProductMove = { role: MoveRole; folder: string; files: number; bytes: number; mode: "stay" | "move"; target: string | null; reason: string | null };

export function matchesFolderWord(name: string, words: string[]): boolean {
  return matchesRoleWord(folderLabelKey(name), words);
}

/** โฟลเดอร์ชั้นบนของงาน → จำนวนไฟล์/ขนาด (ไม่นับไฟล์ระบบ) */
function topFolders(files: ProductFileIn[]): Map<string, { files: number; bytes: number }> {
  const tops = new Map<string, { files: number; bytes: number }>();
  for (const f of files) {
    const rel = relPathOf(f.path);
    const i = rel.indexOf("/");
    if (i <= 0) continue;
    const top = rel.slice(0, i);
    if (isJunkFile(rel.slice(rel.lastIndexOf("/") + 1))) continue;
    const t = tops.get(top) ?? { files: 0, bytes: 0 };
    t.files++; t.bytes += Math.max(0, Number(f.size) || 0);
    tops.set(top, t);
  }
  return tops;
}
const jobNameOf = (jobFolder: string): string => safeFolderName((jobFolder ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "");

export function planProductMoves(files: ProductFileIn[], cfg: ProductSortConfig, opts: { jobFolder: string; brandFolder: string | null; now?: Date }): { moves: ProductMove[]; warnings: string[] } {
  const job = jobNameOf(opts.jobFolder);
  const tops = topFolders(files);
  const moves: ProductMove[] = [];
  const warnings: string[] = [];
  for (const [folder, t] of tops) {
    const role = MOVE_ROLES.find((r) => matchesFolderWord(folder, cfg.moveFolders[r]));
    if (!role) continue;
    const m = cfg.moves[role];
    const needsBrand = m.pattern.includes("{แบรนด์}");
    const target = m.pattern ? fillNasPattern(m.pattern, { แบรนด์: opts.brandFolder ?? "", รุ่น: job, โฟลเดอร์: job, ...nasDateValues(opts.now) }, needsBrand ? ["แบรนด์"] : []) : null;
    const reason = target ? null : !m.pattern ? "ยังไม่ได้ตั้งที่ย้าย" : needsBrand && !opts.brandFolder ? "สินค้านี้ยังไม่ได้ตั้งแบรนด์ในระบบ" : "แม่แบบที่ย้ายใช้ไม่ได้";
    moves.push({ role, folder, files: t.files, bytes: t.bytes, mode: m.mode, target, reason });
    if (m.mode === "move" && !target) warnings.push(`ย้าย ${folder} ไม่ได้: ${reason} — ${reason === "สินค้านี้ยังไม่ได้ตั้งแบรนด์ในระบบ" ? "ตั้งแบรนด์ที่หน้า Parent SKU หรือ" : ""}กด "เปลี่ยนที่…" ในโปรแกรมเพื่อเลือกที่เอง`);
  }
  moves.sort((a, b) => MOVE_ROLES.indexOf(a.role) - MOVE_ROLES.indexOf(b.role) || a.folder.localeCompare(b.folder));
  return { moves, warnings };
}

/**
 * เก็บทั้งโฟลเดอร์งานเข้า Collection (cfg.collection) — แค่คิดปลายทาง + ชื่อที่จะจัด ตัวย้ายจริงคือโปรแกรมบนเครื่อง
 *   target = แม่แบบของแบรนด์สินค้า (collectionPatternFor) · คง {กลุ่ม} ไว้ให้โปรแกรมหาโฟลเดอร์กลุ่มจริงบน Z: · null = ยังเก็บไม่ได้ (ดู reason)
 *   ไม่มีแบรนด์ = ไม่เดา (ที่เก็บต่างกันตามแบรนด์)
 *   renames = จัดชื่อโฟลเดอร์ชั้นบนก่อนเก็บ (คิดไว้เสมอ · tidy = ค่าตั้งต้นว่าติ๊กไหม)
 */
export const TIDY_DESC_FOLDER = "[01] Description";
export const TIDY_IMAGES_FOLDER = "[02] Images";
export const TIDY_RAW_FOLDER = "[03] Rawfiles";
export type TidyRename = { from: string; to: string };
export type ProductCollection = { mode: "stay" | "move"; target: string | null; reason: string | null; tidy: boolean; renames: TidyRename[]; whenExists: CollectionExists; oldFolder: string };

/**
 * จัดชื่อแบบปุ่ม Arrange (ชื่อมาตรฐาน · มีชื่อมาตรฐานอยู่แล้ว = ไม่แตะ):
 *   ชื่อมีคำว่า description / desc ("_Description") → [01] Description
 *   โฟลเดอร์ Images ชื่ออื่น ("image" · "Images 2") → [02] Images · โฟลเดอร์ Rawfiles ชื่ออื่น ("rawfile" · "Raw") → [03] Rawfiles (เจ้าของขอ 2026-11-11)
 *   lifestyle / model → [02] Images/<ชื่อเดิม> (เปลี่ยนชื่อ Images ก่อน แล้วค่อยย้ายเข้า)
 */
export function planTidyRenames(tops: string[], cfg: ProductSortConfig): TidyRename[] {
  const first: TidyRename[] = [], later: TidyRename[] = [];
  const has = (std: string) => tops.some((n) => n.toLowerCase() === std.toLowerCase());
  const taken = { [TIDY_DESC_FOLDER]: has(TIDY_DESC_FOLDER), [TIDY_IMAGES_FOLDER]: has(TIDY_IMAGES_FOLDER), [TIDY_RAW_FOLDER]: has(TIDY_RAW_FOLDER) } as Record<string, boolean>;
  const toStd = (n: string, std: string) => { if (!taken[std]) { first.push({ from: n, to: std }); taken[std] = true; } };
  for (const n of [...tops].sort((a, b) => a.localeCompare(b))) {
    const low = n.toLowerCase();
    if (low === TIDY_DESC_FOLDER.toLowerCase() || low === TIDY_IMAGES_FOLDER.toLowerCase() || low === TIDY_RAW_FOLDER.toLowerCase()) continue;
    if (/raw\s*file/i.test(n) || matchesFolderWord(n, cfg.moveFolders.raw)) { toStd(n, TIDY_RAW_FOLDER); continue; }
    if (matchesFolderWord(n, cfg.moveFolders.images)) { toStd(n, TIDY_IMAGES_FOLDER); continue; }
    if (/description/i.test(n) || matchesFolderWord(n, cfg.roleFolders.desc)) { toStd(n, TIDY_DESC_FOLDER); continue; }
    if (/lifestyle|model/i.test(n)) later.push({ from: n, to: `${TIDY_IMAGES_FOLDER}/${n}` });
  }
  return [...first, ...later];
}

export function planProductCollection(files: ProductFileIn[], cfg: ProductSortConfig, opts: { jobFolder: string; brand: { id: string; name: string; folder: string | null } | null; now?: Date }): { collection: ProductCollection; warnings: string[] } {
  const c = cfg.collection;
  const job = jobNameOf(opts.jobFolder);
  const renames = planTidyRenames([...topFolders(files).keys()], cfg);
  const pattern = opts.brand ? collectionPatternFor(c, opts.brand) : "";
  const target = pattern && job
    ? fillNasPattern(pattern, { แบรนด์: opts.brand?.folder ?? "", รุ่น: job, โฟลเดอร์: job, กลุ่ม: "{กลุ่ม}", ...nasDateValues(opts.now) }, pattern.includes("{แบรนด์}") ? ["แบรนด์"] : [])
    : null;
  const reason = target ? null : !opts.brand ? "สินค้านี้ยังไม่ได้ตั้งแบรนด์ในระบบ" : !pattern ? "ยังไม่ได้ตั้งที่เก็บ Collection ของแบรนด์นี้" : "แม่แบบที่เก็บ Collection ใช้ไม่ได้";
  const warnings = c.mode === "move" && !target
    ? [`เก็บเข้า Collection ไม่ได้: ${reason} — ${reason === "สินค้านี้ยังไม่ได้ตั้งแบรนด์ในระบบ" ? "ตั้งแบรนด์ที่หน้า Parent SKU หรือ" : ""}กด "เปลี่ยนที่…" ในโปรแกรมเพื่อเลือกที่เอง`]
    : [];
  return { collection: { mode: c.mode, target, reason, tidy: c.tidy, renames, whenExists: c.whenExists, oldFolder: COLLECTION_OLD_FOLDER }, warnings };
}

export function productNasFolder(cfg: ProductSortConfig, jobFolder: string, variant: ProductVariant = "new", now?: Date): string | null {
  const job = (jobFolder ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  if (!job.trim()) return null;
  return fillNasPattern(cfg.nasPatterns[variant] ?? cfg.nasPatterns.new, { รุ่น: job, โฟลเดอร์: job, ชื่องาน: job, ...nasDateValues(now) });
}
