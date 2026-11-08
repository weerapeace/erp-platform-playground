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
 *   สูตรนี้ไม่ลบ/ไม่ย้ายต้นฉบับเด็ดขาด (เป็นโฟลเดอร์ทำงานของทีม)
 */
import {
  DEFAULT_TEMPLATE,
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
} from "@/lib/product-image-routing";
import type { CatalogParent } from "@/lib/product-image-catalog-server";
import { fillNasPattern, isJunkFile, nasDateValues, relPathOf, type ProductSortConfig, type ProductVariant } from "@/lib/file-sort";

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
  why?: "junk" | "not_image" | "archive" | "old_version" | "unmatched" | "over" | "error" | "scope";
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
  /** โหมดแทนที่ + มีรูปเดิม → เอารูปเดิมออกก่อน (remove) */
  replaces: boolean;
  remove: { attachments: { id: string; key: string }[]; desc: { assetId: string; sort: number | null }[] };
  /** เจ้าของแกลเลอรี (ช่อง desc/png = Parent) */
  entity: { type: "skus_v2" | "parent_skus_v2"; id: string };
  /** ของเดิมไว้ "ย้อนทั้งชุด": ปกเดิมของแกลเลอรี (โหมดต่อท้าย) · รูปตัด PNG เดิม */
  prev: { primaryId: string | null; pngKey: string | null };
};
export type ProductPlanGroup = { label: string; role: GroupRole | null; code: string | null; count: number; note?: string };
export type ProductPlan = {
  files: ProductFileAction[];
  slots: ProductPlanSlot[];
  groups: ProductPlanGroup[];
  counts: { total: number; erp: number; nas: number; skipped: number };
  warnings: string[];
  parents: { id: string; code: string; name: string }[];
  mode: MassMode;
  variant: ProductVariant;
};

const extOf = (name: string) => (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
const isErpImage = (ext: string) => (ERP_IMAGE_EXTS as readonly string[]).includes(ext);

/**
 * variant (ชนิดงานย่อย · ตรงกับแท็บ Create Folder Tool):
 *   new   = สินค้าใหม่ — ทุกช่อง (Description · Parent · SKU · PNG)
 *   color = เพิ่มสี — เฉพาะแกลเลอรีของสีที่ยังไม่มีรูปในระบบ (Parent/Description/สีเดิมที่ก๊อปมาจาก Collection ไม่แตะ)
 *   edit  = แก้สี — เฉพาะแกลเลอรีของสีที่อยู่ในโฟลเดอร์ (Parent/Description/PNG ไม่แตะ)
 */
export function planProductSort(files: ProductFileIn[], parents: CatalogParent[], cfg: ProductSortConfig, opts: { jobFolder: string; mode?: MassMode; variant?: ProductVariant }): ProductPlan {
  const mode: MassMode = opts.mode ?? cfg.mode;
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
    const t = g.match.target;
    const code = t ? codeOfTarget(t, parents) : null;
    groupInfo.push({ label: g.label, role: g.role ?? null, code, count: g.fileIds.length, note: g.match.note });
    for (const id of g.fileIds) byId.get(id)!.group = g.label;
    if (g.role === "archive" || g.role === "old") {
      for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: g.role === "old" ? "old_version" : "archive", note: g.match.note });
      continue;
    }
    if (!t) {
      for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: "unmatched", note: g.match.note ?? "จับคู่รหัสไม่ได้" });
      warnings.push(variant === "color" && g.match.guessParentId
        ? `สีใหม่ "${g.label}" ยังไม่มีในระบบ — สร้าง SKU สีนี้ในระบบก่อน แล้วกดตรวจใหม่`
        : `"${g.label}" จับคู่กับสินค้าในระบบไม่ได้${g.match.note ? ` (${g.match.note})` : ""} — รูปในโฟลเดอร์นี้ไม่ลงระบบ`);
      continue;
    }
    // เพิ่มสี / แก้สี: แตะเฉพาะแกลเลอรีสี (เพิ่มสี = เฉพาะสีที่ยังไม่มีรูป) · ที่เหลือเป็นของที่ก๊อปมาจาก Collection
    if (variant !== "new") {
      const sku = t.skuId ? parents.find((p) => p.parentId === t.parentId)?.skus.find((s) => s.id === t.skuId) : undefined;
      const note = !t.skuId || g.role === "desc"
        ? (variant === "color" ? "ไม่แตะ — ก๊อปมาจาก Collection (เพิ่มสีลงเฉพาะสีใหม่)" : "ไม่แตะ — แก้สีลงเฉพาะแกลเลอรีสี")
        : variant === "color" && (sku?.gallery ?? 0) > 0 ? "ไม่แตะ — สีนี้มีรูปในระบบแล้ว (จะเปลี่ยนใช้ \"แก้สี\")" : "";
      if (note) {
        for (const id of g.fileIds) Object.assign(byId.get(id)!, { why: "scope", note });
        continue;
      }
    }
    const rows = g.fileIds.map((id) => ({ id, base: (byId.get(id)!.name).replace(/\.[^.]+$/, "") }));
    let images = applyRowMode(rows, defaultRowModeOf(g), { parentLevel: !t.skuId, template: DEFAULT_TEMPLATE, loose: g.key.startsWith("f:"), hints: g.hints });
    if (variant !== "new") {
      // รูปตัด PNG เป็นของทั้งรุ่น → เพิ่มสี/แก้สีไม่แตะ
      for (const im of images) if (im.dest === "png") Object.assign(byId.get(im.id)!, { why: "scope", note: "ไม่แตะ — รูปตัด PNG เป็นของทั้งรุ่น" });
      images = images.filter((im) => im.dest !== "png");
    }
    if (!images.length) continue;
    planGroups.push({ key: g.key, label: g.label, target: t, images });
    for (const im of images) byId.get(im.id)!.dest = im.dest;
  }

  const plan = planRoute(planGroups, parents, { shopIds: [], mode });
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
  const relOf = (id: string) => byId.get(id)!.rel;
  const slots: ProductPlanSlot[] = plan.slots.map((s) => {
    const p = pById.get(s.parentId)!;
    const sku = s.skuId ? p.skus.find((x) => x.id === s.skuId) : undefined;
    const remove = { attachments: [] as { id: string; key: string }[], desc: [] as { assetId: string; sort: number | null }[] };
    if (s.replaces && mode === "replace") {
      if (s.kind === "parentGallery") remove.attachments = p.galleryItems.map((x) => ({ id: x.id, key: x.key }));
      if (s.kind === "skuGallery") remove.attachments = (sku?.items ?? []).map((x) => ({ id: x.id, key: x.key }));
      if (s.kind === "desc") remove.desc = p.descItems.map((x) => ({ assetId: x.assetId, sort: x.sort }));
    }
    return {
      key: s.key, kind: s.kind, parentId: s.parentId, skuId: s.skuId, code: sku?.code ?? p.code,
      rels: s.ids.map(relOf), coverRel: s.coverId ? relOf(s.coverId) : undefined,
      existing: s.existing, total: s.total, limit: s.limit, replaces: s.replaces && mode === "replace", remove,
      entity: s.kind === "skuGallery" && s.skuId ? { type: "skus_v2", id: s.skuId } : { type: "parent_skus_v2", id: s.parentId },
      prev: {
        primaryId: (s.kind === "skuGallery" ? sku?.items : s.kind === "parentGallery" ? p.galleryItems : undefined)?.find((x) => x.primary)?.id ?? null,
        pngKey: s.kind === "png" ? p.pngKey : null,
      },
    };
  });
  // ปกจากแม่แบบที่ยอมให้ไฟล์ชื่อรหัส (planRoute) → ป้ายรายไฟล์ต้องตรงกับผลจริง
  const byRel = new Map(out.map((a) => [a.rel, a]));
  for (const s of slots) for (const r of s.rels) { const a = byRel.get(r); if (a?.dest === "skuMain" && r !== s.coverRel) a.dest = "sku"; }
  if (!parents.length && imgs.length) warnings.unshift(`ไม่พบสินค้าที่ตรงกับชื่อโฟลเดอร์ "${job}" ในระบบ — ตรวจรหัสรุ่น/สีให้ตรงกับ ERP`);
  else if (variant === "color" && parents.length && !slots.length) warnings.push("ไม่พบสีใหม่ที่ต้องลงรูป — ทุกสีในโฟลเดอร์มีรูปในระบบแล้ว (จะเปลี่ยนรูปใช้ \"แก้สี\")");
  else if (variant === "edit" && parents.length && !slots.length) warnings.push("ไม่พบโฟลเดอร์สีที่ตรงกับ SKU ในระบบ — ไม่มีอะไรให้แก้");

  return {
    files: out,
    slots,
    groups: groupInfo,
    counts: { total: out.length, erp: out.filter((a) => a.erp).length, nas: out.filter((a) => a.nas).length, skipped: out.filter((a) => !a.erp && !a.nas).length },
    warnings,
    parents: parents.map((p) => ({ id: p.parentId, code: p.code, name: p.name })),
    mode,
    variant,
  };
}

/** โฟลเดอร์รุ่นบน Z: ตามแม่แบบของชนิดงานย่อย (ใช้เมื่อโฟลเดอร์ต้นทางยังไม่อยู่บน Z:) · ไม่ได้ตั้งแม่แบบ = null */
export function productNasFolder(cfg: ProductSortConfig, jobFolder: string, variant: ProductVariant = "new", now?: Date): string | null {
  const job = (jobFolder ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  if (!job.trim()) return null;
  return fillNasPattern(cfg.nasPatterns[variant] ?? cfg.nasPatterns.new, { รุ่น: job, โฟลเดอร์: job, ชื่องาน: job, ...nasDateValues(now) });
}
