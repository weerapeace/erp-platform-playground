/**
 * 🗂 รูปบนเว็บ — รวมรูป/วิดีโอที่ "ใส่เอง" (ไม่ใช่รูปสินค้า) ทุกที่ของเว็บร้าน: หน้าแรก · หน้าเว็บ · ดีไซน์ · ชุดมาใหม่ (pure · ทดสอบได้)
 * API: app/api/website/site-images · แผง: components/website-site-images-panel.tsx (แท็บ 🗂 รูปบนเว็บ)
 *
 * 🔄 เปลี่ยนรูปทุกที่ = แทนค่าในร่างของแต่ละที่ (เว็บจริงยังเห็นรูปเดิมจนกดเผยแพร่ที่แท็บนั้น) · ชุดมาใหม่ = ดูอย่างเดียว (แก้ที่แท็บ 🆕 มาใหม่)
 * 📝 คำอธิบายรูป (alt) = แผนที่ {r2key: ข้อความ} ใน store_settings "image_alts" → เว็บร้าน LoadImg เติมให้รูปที่ยังไม่มีคำอธิบาย
 * ป้าย "ใช้อยู่ที่ไหน" (blockLabel · themeArea · placeDetail) ใช้ร่วมกับ 🖼 ชุดรูป (api/website/image-sets)
 */
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import { blockDisplayName } from "@/lib/website-blocks";
import { IMGSET_RE } from "@/lib/website-image-sets";

type Path = (string | number)[];

/* ─────────── รูปไหนนับ ─────────── */

const MEDIA_RE = /^[\w-]+\/[\w\-./%()]+\.(jpe?g|png|webp|gif|avif|svg|mp4|webm|mov|m4v)$/i;
/** ค่าในช่องเป็น r2 key ของรูป/วิดีโอ (ไม่ใช่ชุดรูป imgset/ · ไม่ใช่ลิงก์เว็บ) */
export const isMediaKey = (v: unknown): v is string => typeof v === "string" && v.length <= 300 && MEDIA_RE.test(v) && !v.includes("..") && !IMGSET_RE.test(v);
export const isVideoKey = (k: string) => /\.(mp4|webm|mov|m4v)$/i.test(k);
/** โฟลเดอร์รูปสินค้า (เลือกจากสินค้า ไม่ได้ใส่เอง) — ซ่อนไว้ก่อน เปิดดูได้ด้วยปุ่ม "รวมรูปสินค้า" */
export const PRODUCT_MEDIA_PREFIXES = ["parent_skus/", "skus/", "storefront-products/", "product-originals/"];
export const isProductMedia = (k: string) => PRODUCT_MEDIA_PREFIXES.some((p) => k.startsWith(p));
/** ค่าที่เอามาแทนรูปเดิมได้: r2 key ของรูป/วิดีโอ หรือชุดรูปกลาง */
export const isReplacementValue = (v: unknown): v is string => isMediaKey(v) || (typeof v === "string" && IMGSET_RE.test(v));
/** ชื่อไฟล์ท้าย key (โชว์บนการ์ด) */
export const mediaFileName = (k: string) => k.slice(k.lastIndexOf("/") + 1);

/* ─────────── ป้าย "ใช้อยู่ที่ไหน" ─────────── */

/** ส่วนต่าง ๆ ในธีม → ป้ายภาษาคน */
export const THEME_LABEL: Record<string, string> = {
  menu: "เมนู",
  listing: "รูปคั่นสินค้า (หน้ารายการสินค้า)",
  logo: "โลโก้",
  header: "หัวเว็บ",
  footer: "ท้ายเว็บ",
  product: "หน้าสินค้า",
  cart: "ตะกร้า",
  checkout: "หน้าชำระเงิน",
};
export const PAGE_LABEL: Record<string, string> = { thanks: "หน้าขอบคุณหลังสั่งซื้อ", popup: "ป๊อปอัปโปร", notFound: "หน้า 404", login: "หน้าเข้าสู่ระบบ", share: "รูปแชร์" };
/** ตำแหน่งในธีม → ส่วนของเว็บ (เมนู · โลโก้ · หน้าพิเศษ …) */
export function themeArea(path: Path): string {
  const [a, b] = path;
  if (a === "page" && typeof b === "string") return PAGE_LABEL[b] ?? `หน้าพิเศษ (${b})`;
  return THEME_LABEL[String(a)] ?? String(a ?? "");
}
/** ตำแหน่งในธีม → หน้าเว็บที่เห็นที่นั้น (เมนู/ป๊อปอัป = หน้าแรก) */
export function themePath(path: Path): string {
  const [a, b] = path;
  if (a === "listing") return "/shop";
  if (a === "page" && b === "thanks") return "/checkout?pv=thanks";
  return "/";
}
const blockAt = (path: Path, root: unknown) => (Array.isArray(root) && typeof path[0] === "number" ? (root[path[0]] as Record<string, unknown> | undefined) : undefined);
/** Section ในโครงหน้า → ลิงก์เลื่อนไปที่ Section นั้น */
export const blockPath = (prefix: string) => (path: Path, root: unknown): string => {
  const b = blockAt(path, root);
  return typeof b?.id === "string" ? `${prefix}#s-${b.id}` : prefix;
};
/** Section ในโครงหน้า → "🖼 แกลเลอรี “ชื่อ”" */
export function blockLabel(path: Path, root: unknown): string {
  const b = blockAt(path, root);
  if (!b) return "";
  const meta = SECTION_SCHEMAS[String(b.type)]?.meta;
  const title = typeof b.title === "string" && b.title.trim() ? ` “${b.title.trim().slice(0, 30)}”` : "";
  return `${meta ? `${meta.icon} ${blockDisplayName(b)}` : String(b.type)}${title}`;
}

/** รายการในช่อง → ชื่อเรียกเมื่อชิ้นนั้นไม่มีชื่อ (items[2] → "ชิ้นที่ 3") */
const LIST_LABEL: Record<string, string> = {
  items: "ชิ้นที่",
  slides: "สไลด์",
  looks: "ลุค",
  inserts: "รูปแทรก",
  decor: "ของตกแต่ง",
  blocks: "กล่อง",
  links: "ลิงก์",
  cards: "การ์ด",
  images: "รูป",
  layers: "ชั้น",
};
/** ช่องแบบแผนที่ (catImg.bags → "หมวด bags") */
const MAP_LABEL: Record<string, string> = { catImg: "หมวด", categoryImages: "หมวด" };
/** ช่องที่บอกชนิดรูป — ช่องรูปหลัก (imageKey/key) ไม่ต้องบอก */
const KEY_LABEL: Record<string, string> = {
  mobileImageKey: "มือถือ",
  imageMobileKey: "มือถือ",
  mobileBannerKey: "มือถือ",
  imageDarkKey: "โหมดมืด",
  hoverImageKey: "รูปตอนชี้",
  placeholder: "ระหว่างรอรูปโหลด",
  videoFile: "วิดีโอ",
  videoKey: "วิดีโอ",
  posterKey: "ภาพปกวิดีโอ",
  bgImage: "พื้นหลัง",
  bgImageKey: "พื้นหลัง",
};
const nameOf = (o: unknown): string => {
  if (!o || typeof o !== "object" || Array.isArray(o)) return "";
  const r = o as Record<string, unknown>;
  for (const k of ["label", "title", "name", "heading"]) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 24);
  }
  return "";
};
/** ตำแหน่งย่อยภายในส่วนนั้น (ตั้งแต่ path[from]) → "“SHOP ALL” › กล่อง 1 › รูปตอนชี้" */
export function placeDetail(path: Path, root: unknown, from = 1): string {
  const parts: string[] = [];
  let node: unknown = root;
  for (let i = 0; i < path.length; i++) {
    const k = path[i];
    node = node && typeof node === "object" ? (node as Record<string | number, unknown>)[k] : undefined;
    if (i < from) continue;
    const prev = String(path[i - 1] ?? "");
    if (typeof k === "number") {
      const nm = nameOf(node);
      parts.push(nm ? `“${nm}”` : `${LIST_LABEL[prev] ?? "ชิ้นที่"} ${k + 1}`);
    } else if (i - 1 >= from && MAP_LABEL[prev]) parts.push(`${MAP_LABEL[prev]} ${k}`);
    else if (KEY_LABEL[k]) parts.push(KEY_LABEL[k]);
  }
  return parts.join(" › ");
}

/* ─────────── รวมรูปจากทุกที่ ─────────── */

export type SiteDocKind = "home" | "page" | "theme" | "drop";
/** ก้อนข้อมูล 1 ที่ (หน้าแรก / หน้าเว็บ 1 หน้า / ธีม / ชุดมาใหม่ 1 ชุด) */
export interface SiteDoc {
  kind: SiteDocKind;
  /** "home" · "theme" · id หน้าเว็บ · id ชุดมาใหม่ */
  id: string;
  /** "หน้าแรก" · "หน้า “เกี่ยวกับเรา”" · "ดีไซน์" · "มาใหม่ “ROARs”" */
  label: string;
  live: unknown;
  /** ร่าง (null = ไม่มีร่าง → ที่แก้อยู่ = ตัวที่เผยแพร่) */
  draft: unknown;
  /** false = ดูอย่างเดียวในแท็บนี้ (ชุดมาใหม่ → แก้ที่แท็บ 🆕 มาใหม่) */
  editable: boolean;
  /** ตำแหน่งในก้อน → ป้ายย่อย · ไม่ใส่ = ตามชนิด (Section / ส่วนของธีม) */
  labelOf?: (path: Path, root: unknown) => string;
  /** ตำแหน่งในก้อน → หน้าเว็บที่เห็นรูปนั้น (พรีวิว) */
  pathOf?: (path: Path, root: unknown) => string;
}
export interface SiteImageUse {
  kind: SiteDocKind;
  docId: string;
  /** ป้ายภาษาคน เช่น "หน้าแรก › 🖼 แกลเลอรี › ชิ้นที่ 3" */
  where: string;
  /** อยู่ในตัวที่เผยแพร่ (ลูกค้าเห็นอยู่) */
  live: boolean;
  /** อยู่ในตัวที่กำลังแก้ (ร่าง หรือ ตัวที่เผยแพร่ถ้าไม่มีร่าง) — false = เอาออกในร่างแล้ว */
  draft: boolean;
  /** หน้าเว็บที่เห็นรูปนี้ (+ #s-<Section>) */
  path: string;
  /** Section ที่รูปอยู่ (เปิดแก้ใน 🧱 หน้าแรก ได้ตรงตัว) */
  blockId: string | null;
  editable: boolean;
}
export interface SiteImage {
  key: string;
  kind: "image" | "video";
  /** รูปจากโฟลเดอร์สินค้า */
  product: boolean;
  uses: SiteImageUse[];
}

const docLabelOf = (d: SiteDoc) => d.labelOf ?? (d.kind === "theme" ? (p: Path, root: unknown) => [themeArea(p), placeDetail(p, root, p[0] === "page" ? 2 : 1)].filter(Boolean).join(" › ") : (p: Path, root: unknown) => [blockLabel(p, root), placeDetail(p, root, 1)].filter(Boolean).join(" › "));
const docPathOf = (d: SiteDoc) => d.pathOf ?? (d.kind === "theme" ? themePath : blockPath("/"));

/** ไล่ทุกช่องในก้อนข้อมูล → เรียก fn กับทุกค่าที่เป็นรูป/วิดีโอ */
export function eachMedia(data: unknown, fn: (key: string, path: Path) => void, path: Path = []): void {
  if (isMediaKey(data)) fn(data, path);
  else if (Array.isArray(data)) data.forEach((x, i) => eachMedia(x, fn, [...path, i]));
  else if (data && typeof data === "object") for (const [k, v] of Object.entries(data)) eachMedia(v, fn, [...path, k]);
}

/** รวมรูปทุกที่ → 1 การ์ดต่อ 1 รูป (เรียงตามจำนวนที่ใช้) · ที่เดียวกันทั้งเผยแพร่+ร่าง = แถวเดียว */
export function collectSiteImages(docs: SiteDoc[]): SiteImage[] {
  const byKey = new Map<string, SiteImage>();
  const useAt = new Map<string, SiteImageUse>();
  for (const d of docs) {
    const labelOf = docLabelOf(d);
    const pathOf = docPathOf(d);
    const editing = d.draft != null ? d.draft : d.live;
    const scan = (root: unknown, state: "live" | "draft") =>
      eachMedia(root, (key, p) => {
        const sub = labelOf(p, root);
        const where = sub ? `${d.label} › ${sub}` : d.label;
        const id = `${key}|${d.kind}|${d.id}|${where}`;
        let u = useAt.get(id);
        if (!u) {
          const b = d.kind === "home" || d.kind === "page" ? blockAt(p, root) : undefined;
          u = { kind: d.kind, docId: d.id, where, live: false, draft: false, path: pathOf(p, root), blockId: typeof b?.id === "string" ? b.id : null, editable: d.editable };
          useAt.set(id, u);
          let img = byKey.get(key);
          if (!img) byKey.set(key, (img = { key, kind: isVideoKey(key) ? "video" : "image", product: isProductMedia(key), uses: [] }));
          img.uses.push(u);
        }
        u[state] = true;
      });
    scan(d.live, "live");
    scan(editing, "draft");
  }
  return [...byKey.values()].sort((a, b) => b.uses.length - a.uses.length || a.key.localeCompare(b.key));
}

/** แทนรูป from ด้วย to ทุกช่องในก้อน (ค่าตรงกันทั้งช่องเท่านั้น) — คืนก้อนใหม่ + จำนวนที่แทน (ของเดิมไม่ถูกแก้) */
export function replaceMedia<T>(data: T, from: string, to: string): { data: T; count: number } {
  let count = 0;
  const walk = (node: unknown): unknown => {
    if (node === from) {
      count++;
      return to;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    return node;
  };
  const out = walk(data) as T;
  return { data: count ? out : data, count };
}

/* ─────────── คำอธิบายรูป (alt) ─────────── */

export const IMAGE_ALTS_SETTING = "image_alts";
export const IMAGE_ALT_MAX = 160;
export const IMAGE_ALTS_MAX = 500;
export type ImageAltMap = Record<string, string>;

/** ค่าใน store_settings (ข้อความ JSON) / ก้อนที่ส่งมา → แผนที่ที่สะอาด (r2 key ถูกแบบ · ข้อความไม่ว่าง · ตัดยาว) */
export function cleanImageAlts(raw: unknown): ImageAltMap {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const out: ImageAltMap = {};
  let n = 0;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (n >= IMAGE_ALTS_MAX) break;
    if (!isMediaKey(k) || typeof v !== "string") continue;
    const t = v.replace(/\s+/g, " ").trim().slice(0, IMAGE_ALT_MAX);
    if (!t) continue;
    out[k] = t;
    n++;
  }
  return out;
}
/** ตั้ง/ลบคำอธิบายของรูป 1 รูป (ข้อความว่าง = ลบ) */
export function withImageAlt(map: ImageAltMap, key: string, alt: string): ImageAltMap {
  const next = { ...map };
  delete next[key];
  const t = alt.replace(/\s+/g, " ").trim().slice(0, IMAGE_ALT_MAX);
  if (t && isMediaKey(key)) next[key] = t;
  return cleanImageAlts(next);
}
