/**
 * 🗂 แปลง "แกลเลอรีแบบแฟ้ม" → "แฟ้มวางอิสระ" (ผืนผ้าใบโหมดแฟ้มซ้อน) — 2026-10-24
 *   เจ้าของ: "อยากเพิ่ม ข้อความ รูป วิดีโอ ได้แต่ละแฟ้ม ไม่ใช่ขึ้นลอย ๆ ทุกอัน" → ปุ่มแปลงในตัวจัดหน้า (components/website-builder)
 *
 * ย้ายไปครบ: รูป/คลิปของแต่ละช่อง (+ ส่วนที่เห็น/ซูม) · หัวข้อ · คำอธิบาย · ลิงก์ (เป็นปุ่ม) · ป้ายบนหู · สีแฟ้ม · หน้าตาแฟ้มทุกช่อง (folder* / cover*)
 *   + รูปลักษณ์ของ Section (style รวมของตกแต่ง) · หัวข้อ Section → Section ข้อความแยกไว้ด้านบน (ผืนผ้าใบไม่มีหัวข้อ)
 * ช่องที่ไม่มีรูป/คลิป = ข้าม (หน้าเว็บก็ไม่โชว์อยู่แล้ว) · เกิน 6 ช่อง = ย้ายแค่ 6 แฟ้มแรก (เพดานแฟ้มวางอิสระ)
 * ฟังก์ชันล้วน — ตัวจัดหน้าเป็นคนสร้าง Section ใหม่ + ทำความสะอาด (normalizeBlocks) + วางแทนที่เดิม (ย้อนกลับได้ด้วย ↶)
 */
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import { CANVAS_WIDTH } from "@/lib/website-canvas";

type R = Record<string, unknown>;
/** สินค้าที่ช่องแกลเลอรีเลือกไว้ (ช่อง code) — ตัวจัดหน้าโหลดมาให้ */
export interface FolderProduct {
  code: string;
  name?: string;
  slug?: string;
  imageKey?: string | null;
}
export interface GalleryToCanvasResult {
  /** ค่าของ Section ผืนผ้าใบ (ยังไม่มี id/type — ตัวจัดหน้าประกอบกับ Section ใหม่) */
  canvas: R;
  /** Section ข้อความหัวข้อ (มีหัวข้อเดิม) หรือ null */
  heading: R | null;
  folders: number;
  /** สิ่งที่ย้ายไม่ได้/เปลี่ยนไป (ภาษาคน) */
  warnings: string[];
}

export const FOLDER_CONVERT_MAX = 6;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fb);

/** Section นี้เป็นแกลเลอรีแบบแฟ้มไหม (ปุ่มแปลงโชว์เฉพาะแบบนี้) */
export const isGalleryFolders = (b: R): boolean => b.type === "gallery" && b.layout === "tabs" && b.tabsLook === "folder";

/** ช่องหน้าตาแฟ้มที่มีทั้งสองแบบ (ของกลาง folderLookFields) — ทรงหู ตำแหน่งหู ลาย เงา มุมมน ชุดสี ป้าย ระยะโผล่ ยกตัว แฟ้มปก… */
export function folderLookKeys(): string[] {
  const gal = new Set(SECTION_SCHEMAS.gallery.fields.map((f) => f.key));
  return SECTION_SCHEMAS.canvas.fields.map((f) => f.key).filter((k) => gal.has(k) && /^(folder|cover)/.test(k));
}

export function galleryFoldersToCanvas(g: R, products: FolderProduct[] = []): GalleryToCanvasResult {
  const warnings: string[] = [];
  const byCode = new Map(products.map((p) => [p.code.toUpperCase(), p] as const));
  const H = Math.max(300, Math.min(900, Math.round(num(g.tabsH, 560))));
  const pol = g.folderMedia !== "full";
  const W = CANVAS_WIDTH;

  // ช่องที่มีรูป/คลิปจริง (รูปจากสินค้า = รูปแรกของสินค้า · ชื่อ/ลิงก์สินค้าเป็นค่าสำรอง)
  type Slot = { it: R; imageKey: string | null; videoKey: string | null; title: string; href: string };
  const slots: Slot[] = [];
  let skipped = 0;
  for (const it of Array.isArray(g.items) ? (g.items as R[]) : []) {
    if (it.enabled === false) continue;
    const code = Array.isArray(it.code) && typeof it.code[0] === "string" ? it.code[0].trim().toUpperCase() : "";
    const p = code ? byCode.get(code) : undefined;
    const imageKey = s(it.imageKey) || p?.imageKey || null;
    const videoKey = it.media === "video" && s(it.videoKey) ? s(it.videoKey) : null;
    if (!imageKey && !videoKey) {
      skipped++;
      if (code) warnings.push(`ช่องสินค้า ${code} หารูปของสินค้าไม่เจอ — ไม่ได้ย้าย (เพิ่มรูปในแฟ้มเองได้)`);
      continue;
    }
    slots.push({ it, imageKey, videoKey, title: s(it.title) || p?.name || "", href: s(it.href) || (p ? `/product/${(p.slug || code).toLowerCase()}` : "") });
  }
  if (skipped && !warnings.length) warnings.push(`ข้าม ${skipped} ช่องที่ยังไม่มีรูป/คลิป (หน้าเว็บก็ไม่ได้โชว์อยู่แล้ว)`);
  if (slots.length > FOLDER_CONVERT_MAX) warnings.push(`มี ${slots.length} ช่อง — แฟ้มวางอิสระได้สูงสุด ${FOLDER_CONVERT_MAX} แฟ้ม ย้ายแค่ ${FOLDER_CONVERT_MAX} ช่องแรก`);
  const used = slots.slice(0, FOLDER_CONVERT_MAX);
  const count = Math.max(2, used.length);
  if (used.length < 2) warnings.push(`มีรูปช่องเดียว — เพิ่ม "แฟ้ม 2" ว่างไว้ให้ (แฟ้มวางอิสระต้องมีอย่างน้อย 2 แฟ้ม)`);
  if (g.folderDir === "v") warnings.push("แฟ้มแนวตั้งจะเปลี่ยนเป็นแนวนอน (แฟ้มวางอิสระมีแบบแฟ้มซ้อนลงมาแบบเดียว)");

  const canvas: R = {
    folderMode: true,
    folderCount: String(count),
    folderOpen: "hover",
    folderStart: "1",
    height: H,
    width: g.fullBleed === true ? "full" : "normal",
  };
  for (const k of folderLookKeys()) if (g[k] !== undefined) canvas[k] = g[k];

  const items: R[] = [];
  used.forEach((sl, i) => {
    const folder = String(i + 1);
    const it = sl.it;
    // ป้ายบนหู = ป้ายที่ตั้ง · ไม่ได้ตั้ง = หัวข้อ (แบบเดียวกับแกลเลอรี)
    canvas[`folder${folder}Label`] = (s(it.tabLabel) || sl.title).slice(0, 30);
    if (s(it.folderColor)) canvas[`folder${folder}Color`] = s(it.folderColor);
    const crop = it.crop && typeof it.crop === "object" ? (it.crop as { x?: unknown; y?: unknown; zoom?: unknown }) : null;
    const media: R = {
      folder,
      ...(sl.videoKey ? { kind: "video", videoKey: sl.videoKey, posterKey: sl.imageKey } : { kind: "image", imageKey: sl.imageKey }),
      alt: s(it.alt) || sl.title,
      fit: "cover",
      ...(crop && !sl.videoKey ? { cropX: num(crop.x, 50), cropY: num(crop.y, 50), cropZoom: num(crop.zoom, 100) } : {}),
      ...(sl.href && !s(it.linkText) ? { href: sl.href } : {}),
    };
    const caption = s(it.caption);
    const cta = s(it.linkText);
    if (pol) {
      // โพลารอยด์ซ้าย + ข้อความขวา (หน้าตาเดียวกับแกลเลอรีแบบแฟ้ม)
      const mh = H - 110;
      const mw = Math.min(520, Math.round(mh * 0.8));
      const tx = 60 + mw + 70;
      const tw = W - tx - 60;
      items.push({ ...media, frame: "polaroid", x: 60, y: 40, w: mw, h: mh, rotate: -3 });
      if (sl.title) items.push({ kind: "text", folder, text: sl.title, font: "display", size: 40, weight: "500", lineHeight: 115, color: "ink", x: tx, y: 60, w: tw, h: 100 });
      if (caption) items.push({ kind: "text", folder, text: caption, font: "body", size: 18, weight: "400", lineHeight: 160, color: "muted", x: tx, y: 175, w: tw, h: 150 });
      if (sl.href && cta) items.push({ kind: "button", folder, label: cta, href: sl.href, variant: "brand", font: "body", size: 16, weight: "600", x: tx, y: 345, w: 240, h: 52 });
    } else {
      // เต็มแฟ้ม + ข้อความขาวมุมล่างซ้าย
      items.push({ ...media, frame: "rect", x: 0, y: 0, w: W, h: H });
      if (sl.title) items.push({ kind: "text", folder, text: sl.title, font: "display", size: 40, weight: "500", lineHeight: 115, color: "white", x: 60, y: H - 175, w: 820, h: 60 });
      if (caption) items.push({ kind: "text", folder, text: caption, font: "body", size: 18, weight: "400", lineHeight: 150, color: "white", x: 60, y: H - 110, w: 820, h: 70 });
      if (sl.href && cta) items.push({ kind: "button", folder, label: cta, href: sl.href, variant: "brand", font: "body", size: 16, weight: "600", x: W - 300, y: H - 100, w: 240, h: 52 });
    }
  });
  canvas.items = items;

  const heading = s(g.title) || s(g.eyebrow) || s(g.subtitle) ? { eyebrow: s(g.eyebrow), title: s(g.title), body: s(g.subtitle) } : null;
  return { canvas, heading, folders: count, warnings };
}
