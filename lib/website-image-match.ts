/**
 * 📸 ลงรูปเว็บทีละมาก — จับคู่ "ชื่อไฟล์/โฟลเดอร์" → สินค้า + ช่องรูปบนเว็บ (ของกลาง · pure ไม่แตะ DB)
 *
 * ใช้ที่ components/website-image-mass-upload (หน้า "สินค้าบนเว็บ" ของแต่ละร้าน) · กติกาเดียวกับ lib/filename-code-match
 * (ไม่สนตัวพิมพ์ · รหัสยาวได้ก่อน · หลังรหัสต้องจบชื่อหรือเป็นตัวคั่น) แล้วอ่าน "ส่วนท้ายชื่อ" ต่อ:
 *
 *   JEAN08.jpg · JEAN08_2.jpg          → รูปบนเว็บ (รูปรวมรุ่น) ลำดับ 0, 2
 *   JEAN08-01.jpg · JEAN08-01 (3).jpg  → รูปสี JEAN08-01 (SKU ไซส์ เช่น JEAN08-01-L = สีเดียวกัน)
 *   JEAN08_hero.jpg / JEAN08_hero_m.jpg → Hero คอม / Hero มือถือ ของรุ่น
 *   JEAN08-01_hero.jpg                  → Hero ของสีนั้น
 *   🎬 วิดีโอ (mp4/webm/mov) = Hero เสมอ: JEAN08.mp4 → Hero คอม · JEAN08_m.mp4 / JEAN08_hero_m.mp4 → Hero มือถือ (สีก็ได้)
 *   โฟลเดอร์ JEAN08/ หรือ JEAN08-01/    → ไฟล์ข้างในเข้าที่นั้น (ชื่อไฟล์ไม่มีรหัสก็ได้ เช่น JEAN08-01/2.jpg)
 *
 * กันพลาด: JEAN08-03.jpg แต่รุ่นนี้ไม่มีสี -03 → ไม่เดาว่าเป็นรูปบนเว็บ ให้คนเลือกเอง (status "pick" + เดารุ่นไว้ให้)
 * วางแผนลงรูป (planImageUpload): เรียงตามเลขท้าย · Hero มีได้ช่องละ 1 รูป · เกินเพดาน (รูปบนเว็บ 12 · รูปสี 8) = ข้าม
 */

export const MAX_WEB_IMAGES = 12;
export const MAX_SKU_WEB_IMAGES = 8;
/** ลากทีละไม่เกินนี้ (กันเบราว์เซอร์ค้าง/อัปนานเกิน) */
export const MAX_MASS_FILES = 300;

export type HeroSlot = "desktop" | "mobile";
export type ImageTarget =
  | { kind: "gallery" }
  | { kind: "sku"; skuId: string }
  | { kind: "hero"; slot: HeroSlot }
  | { kind: "skuHero"; skuId: string; slot: HeroSlot };

export interface CatalogSku {
  id: string;
  code: string;
  label: string;
  /** รหัสอื่นที่หมายถึงสีเดียวกัน (SKU ไซส์ เช่น JEAN08-01-L) */
  aliases?: string[];
  webImages: string[];
  hero: { desktop: string | null; mobile: string | null };
}
export interface CatalogParent {
  parentId: string;
  code: string;
  name: string;
  webImages: string[];
  hero: { desktop: string | null; mobile: string | null };
  skus: CatalogSku[];
}

export type MatchStatus = "ok" | "pick";
export interface ImageMatch {
  parentId: string | null;
  target: ImageTarget | null;
  /** เลขท้ายชื่อ (_2 / (2) / -2) ไว้เรียงลำดับ · ไม่มีเลข = 0 (มาก่อน) */
  order: number;
  status: MatchStatus;
  /** เหตุผลที่ต้องเลือกเอง (ภาษาคน) */
  reason?: string;
  /** จับคู่จากชื่อไฟล์ หรือจากชื่อโฟลเดอร์ */
  via?: "name" | "folder";
}

const SEP = "[\\s_\\-.]";
const isAlnum = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const stripExt = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, "").trim();

/** แยก path → ชื่อไฟล์ (ไม่มีนามสกุล) + โฟลเดอร์ (ลึกสุดก่อน) */
export function splitPath(path: string): { base: string; folders: string[] } {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  const file = parts.pop() ?? "";
  return { base: stripExt(file), folders: parts.reverse() };
}

export type CodeRef = { parentId: string; skuId: string | null; code: string };
/** ข้อมูลขั้นต่ำที่ใช้สร้างดัชนีรหัส (รุ่น + สี + รหัสไซส์) — ใช้ร่วมกับ lib/product-image-routing */
export type CodeIndexParent = { parentId: string; code: string; skus: { id: string; code: string; aliases?: string[] }[] };

/** ดัชนีรหัส (ตัวใหญ่) → รุ่น/สี · รหัสยาวก่อน */
export function buildCodeIndex(parents: CodeIndexParent[]): CodeRef[] {
  const out: CodeRef[] = [];
  const seen = new Set<string>();
  const add = (code: string, parentId: string, skuId: string | null) => {
    const up = code.trim().toUpperCase();
    if (!up || seen.has(up)) return;
    seen.add(up);
    out.push({ code: up, parentId, skuId });
  };
  for (const p of parents) {
    for (const s of p.skus) {
      add(s.code, p.parentId, s.id);
      for (const a of s.aliases ?? []) add(a, p.parentId, s.id);
    }
    add(p.code, p.parentId, null);
  }
  return out.sort((a, b) => b.code.length - a.code.length);
}

/** หา "รหัสที่ขึ้นต้นชื่อ" (ตามด้วยจบชื่อหรือตัวคั่น) → รหัส + ส่วนท้ายที่เหลือ */
export function findCodePrefix(name: string, index: CodeRef[]): { ref: CodeRef; rest: string } | null {
  const up = name.toUpperCase();
  for (const ref of index) {
    if (up === ref.code) return { ref, rest: "" };
    if (up.startsWith(ref.code) && !isAlnum(up.charAt(ref.code.length))) return { ref, rest: name.slice(ref.code.length) };
  }
  return null;
}

const HERO_RE = new RegExp(`(^|[^a-z])hero(?![a-z])`, "i");
const HERO_M_RE = new RegExp(`hero${SEP}*(m|mb|mobile)(?![a-z])|มือถือ`, "i");

const MOBILE_RE = /(^|[^a-z])(m|mb|mobile)(?![a-z])|มือถือ/i;

/** 🎬 ไฟล์วิดีโอ (ดูจากนามสกุล — ชนิดที่เบราว์เซอร์บอกบางเครื่องว่าง) */
export const isVideoName = (name: string) => /\.(mp4|m4v|webm|mov)$/i.test(name);

/** อ่านส่วนท้ายชื่อ: Hero? มือถือ? เลขลำดับ · video = วิดีโอเป็น Hero เสมอ (_m / _hero_m = มือถือ) */
export function parseSuffix(rest: string, video = false): { hero: HeroSlot | null; order: number } {
  const r = rest.trim();
  const hero = HERO_RE.test(r) ? (HERO_M_RE.test(r) ? "mobile" : "desktop") : video ? (MOBILE_RE.test(r) ? "mobile" : "desktop") : null;
  const m = r.match(/(\d+)\D*$/);
  return { hero, order: m ? Number(m[1]) : 0 };
}

/** ตัวคล้ายรหัสสินค้า (เช่น BBP99-01) ที่ขึ้นต้นชื่อ — ไว้บอกว่า "ไม่พบรหัสนี้ในร้าน" */
export const codeLike = (name: string) => name.match(/^[A-Za-z]{2,}[A-Za-z0-9]*\d[A-Za-z0-9]*(?:-[A-Za-z0-9#.]+)*/)?.[0] ?? null;

/** จับคู่ไฟล์ 1 ไฟล์ (path = ชื่อไฟล์ หรือ โฟลเดอร์/…/ชื่อไฟล์) */
export function matchImagePath(path: string, parents: CatalogParent[], index = buildCodeIndex(parents)): ImageMatch {
  const { base, folders } = splitPath(path);
  let hit = findCodePrefix(base, index);
  let via: "name" | "folder" = "name";
  let rest = hit?.rest ?? "";
  if (!hit) {
    for (const f of folders) {
      const h = findCodePrefix(stripExt(f), index);
      if (h) {
        // โฟลเดอร์ JEAN08-01/2.jpg → ส่วนท้ายของโฟลเดอร์ (ถ้ามี) + ชื่อไฟล์ทั้งชื่อ
        hit = h;
        via = "folder";
        rest = `${h.rest} ${base}`;
        break;
      }
    }
  }
  const { hero, order } = parseSuffix(rest, isVideoName(path));
  if (!hit) {
    const c = codeLike(base) ?? folders.map(codeLike).find(Boolean) ?? null;
    return { parentId: null, target: null, order, status: "pick", reason: c ? `ไม่พบรหัส ${c} ในร้านนี้` : "ชื่อไฟล์ไม่มีรหัสสินค้า" };
  }
  const { ref } = hit;
  if (ref.skuId) {
    return { parentId: ref.parentId, target: hero ? { kind: "skuHero", skuId: ref.skuId, slot: hero } : { kind: "sku", skuId: ref.skuId }, order, status: "ok", via };
  }
  // รหัสรุ่น + "-xx" (ไม่ใช่ hero) และรุ่นนี้มีสี = น่าจะเป็นรหัสสีที่ไม่มีในร้าน → ไม่เดาว่าเป็นรูปบนเว็บ
  const parent = parents.find((p) => p.parentId === ref.parentId);
  const dash = !hero && via === "name" ? rest.match(/^-([A-Za-z0-9#.]+)/) : null;
  if (dash && parent && parent.skus.length) {
    return { parentId: ref.parentId, target: null, order, status: "pick", reason: `ไม่พบสี ${ref.code}-${dash[1].toUpperCase()} ในรุ่นนี้`, via };
  }
  return { parentId: ref.parentId, target: hero ? { kind: "hero", slot: hero } : { kind: "gallery" }, order, status: "ok", via };
}

// ───────────── วางแผนลงรูป ─────────────

export type MassMode = "append" | "replace";
export const targetKey = (parentId: string, t: ImageTarget) =>
  t.kind === "gallery" ? `${parentId}|g` : t.kind === "sku" ? `${parentId}|s:${t.skuId}` : t.kind === "hero" ? `${parentId}|h:${t.slot}` : `${parentId}|sh:${t.skuId}:${t.slot}`;

export interface PlanFileIn {
  id: string;
  name: string;
  parentId: string | null;
  target: ImageTarget | null;
  order: number;
  /** เลือก "ข้ามไฟล์นี้" เอง */
  skip?: boolean;
  /** 🎬 วิดีโอ — ลงได้เฉพาะช่อง Hero */
  video?: boolean;
  /** ลงไม่ได้ (เช่น ไฟล์ใหญ่เกิน) — ข้อความบอกเหตุผล */
  invalid?: string;
}
export type PlanFileStatus = "upload" | "skip" | "over" | "dupHero" | "unmatched" | "invalid";
export interface PlanFile extends PlanFileIn {
  plan: PlanFileStatus;
  note?: string;
}
export interface PlanDest {
  key: string;
  parentId: string;
  target: ImageTarget;
  /** ไฟล์ที่จะลง (เรียงแล้ว) */
  fileIds: string[];
  /** รูปเดิมที่มีอยู่ */
  existing: number;
  /** รวมหลังลง */
  total: number;
  /** Hero / โหมดแทนที่ = รูปเดิมจะถูกแทน */
  replaces: boolean;
  limit: number;
}

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** จัดไฟล์เข้าช่อง + เช็กเพดาน/Hero ซ้ำ → สิ่งที่จะเกิดจริงต่อไฟล์ และสรุปต่อช่อง */
export function planImageUpload(files: PlanFileIn[], parents: CatalogParent[], mode: MassMode): { files: PlanFile[]; dests: PlanDest[] } {
  const byParent = new Map(parents.map((p) => [p.parentId, p]));
  const groups = new Map<string, { parentId: string; target: ImageTarget; items: PlanFileIn[] }>();
  const out = new Map<string, PlanFile>();
  for (const f of files) {
    if (f.skip) out.set(f.id, { ...f, plan: "skip" });
    else if (f.invalid) out.set(f.id, { ...f, plan: "invalid", note: f.invalid });
    else if (!f.parentId || !f.target || !byParent.has(f.parentId)) out.set(f.id, { ...f, plan: "unmatched" });
    else if (f.video && f.target.kind !== "hero" && f.target.kind !== "skuHero") out.set(f.id, { ...f, plan: "invalid", note: "วิดีโอลงได้เฉพาะช่อง Hero — เลือก Hero คอม/มือถือ" });
    else {
      const k = targetKey(f.parentId, f.target);
      const g = groups.get(k) ?? { parentId: f.parentId, target: f.target, items: [] };
      g.items.push(f);
      groups.set(k, g);
    }
  }
  const dests: PlanDest[] = [];
  for (const [key, g] of groups) {
    const p = byParent.get(g.parentId)!;
    const sorted = [...g.items].sort((a, b) => a.order - b.order || natural.compare(a.name, b.name));
    const t = g.target;
    let existing = 0;
    let limit = 1;
    let replaces = false;
    if (t.kind === "gallery") {
      existing = p.webImages.length;
      limit = MAX_WEB_IMAGES;
    } else if (t.kind === "sku") {
      existing = p.skus.find((s) => s.id === t.skuId)?.webImages.length ?? 0;
      limit = MAX_SKU_WEB_IMAGES;
    } else {
      const h = t.kind === "hero" ? p.hero : p.skus.find((s) => s.id === t.skuId)?.hero;
      existing = h?.[t.slot] ? 1 : 0;
      replaces = existing > 0;
    }
    const isHero = t.kind === "hero" || t.kind === "skuHero";
    if (!isHero && mode === "replace") replaces = existing > 0;
    const room = isHero ? 1 : mode === "replace" ? limit : Math.max(0, limit - existing);
    const take = sorted.slice(0, room);
    for (const f of take) out.set(f.id, { ...f, plan: "upload" });
    for (const f of sorted.slice(room)) {
      out.set(f.id, isHero ? { ...f, plan: "dupHero", note: "Hero มีได้ช่องละ 1 ไฟล์ — ใช้ไฟล์แรก" } : { ...f, plan: "over", note: `เกิน ${limit} รูป — ไม่ลง` });
    }
    if (take.length) {
      dests.push({ key, parentId: g.parentId, target: t, fileIds: take.map((f) => f.id), existing, total: isHero ? 1 : (mode === "replace" ? 0 : existing) + take.length, replaces, limit });
    }
  }
  return { files: files.map((f) => out.get(f.id)!), dests };
}

/** ไฟล์ของช่อง Hero: key (รูป) หรือ { key, kind } (บอกว่าเป็นวิดีโอ) */
export type HeroPick = string | { key: string; kind: "image" | "video" };

/** รวมผลแผน → คำขอบันทึกต่อรุ่น (key ของไฟล์ที่อัปเสร็จแล้ว) */
export interface MassImageItem {
  parentId: string;
  gallery?: string[];
  skus?: Record<string, string[]>;
  hero?: Partial<Record<HeroSlot, HeroPick>>;
  skuHero?: Record<string, Partial<Record<HeroSlot, HeroPick>>>;
}
export function buildMassItems(dests: PlanDest[], keyOf: (fileId: string) => string | null, isVideo: (fileId: string) => boolean = () => false): MassImageItem[] {
  const items = new Map<string, MassImageItem>();
  for (const d of dests) {
    const ids = d.fileIds.filter((id) => !!keyOf(id));
    const keys = ids.map((id) => keyOf(id) as string);
    if (!keys.length) continue;
    const it = items.get(d.parentId) ?? { parentId: d.parentId };
    const t = d.target;
    const heroPick: HeroPick = isVideo(ids[0]) ? { key: keys[0], kind: "video" } : keys[0];
    if (t.kind === "gallery") it.gallery = keys;
    else if (t.kind === "sku") it.skus = { ...(it.skus ?? {}), [t.skuId]: keys };
    else if (t.kind === "hero") it.hero = { ...(it.hero ?? {}), [t.slot]: heroPick };
    else it.skuHero = { ...(it.skuHero ?? {}), [t.skuId]: { ...(it.skuHero?.[t.skuId] ?? {}), [t.slot]: heroPick } };
    items.set(d.parentId, it);
  }
  return [...items.values()];
}

/** ชื่อช่องแบบภาษาคน */
export function targetLabel(t: ImageTarget, p: CatalogParent | undefined): string {
  // "JEAN08-01" ในรุ่น JEAN08 → "01 น้ำเงิน"
  const sku = (id: string) => {
    const s = p?.skus.find((x) => x.id === id);
    if (!s) return "";
    const pc = (p?.code ?? "").toUpperCase();
    const short = pc && s.code.toUpperCase().startsWith(pc) ? s.code.slice(pc.length).replace(/^[-_\s]+/, "") : "";
    return `${short || s.code} ${s.label}`.trim();
  };
  if (t.kind === "gallery") return "รูปบนเว็บ";
  if (t.kind === "sku") return `สี ${sku(t.skuId)}`;
  if (t.kind === "hero") return t.slot === "desktop" ? "Hero คอม" : "Hero มือถือ";
  return `Hero ${t.slot === "desktop" ? "คอม" : "มือถือ"} · สี ${sku(t.skuId)}`;
}
