/**
 * ของกลาง — "ผืนผ้าใบอิสระ" (Section ชนิด canvas) ของหน้าเว็บร้าน
 *
 * วางรูป / ข้อความ / ปุ่ม / ของตกแต่ง ตรงไหนก็ได้ บนผืนกว้าง 1200 หน่วย (= px ตอนจอกว้าง 1200)
 *   - คอม/แท็บเล็ต: เว็บร้านย่อทั้งผืนตามความกว้างจอ (container query) หน้าตาเหมือนที่จัดทุกประการ
 *   - มือถือ (< 768px): เรียงชิ้นลงมาอัตโนมัติตามตำแหน่ง บน→ล่าง (เฟส 2 จะจัดหน้ามือถือแยกได้)
 *   - ลาก/ย่อ-ขยาย/หมุน ทำในพรีวิว (เว็บร้าน ?preview=1) แล้วส่งตำแหน่งกลับมาที่ตัวจัดหน้า
 *
 * ไฟล์นี้ = ตัวเลือก/ค่าเริ่มต้น/สรุป/ตรวจ ที่ schema (lib/website-schema.ts) และตัวจัดหน้าใช้ร่วมกัน
 * ⚠️ ค่า (v) ทุกตัวต้องตรงกับเว็บร้าน src/lib/canvas.ts — เปลี่ยนชื่อ = เว็บวาดไม่ถูก
 */
import type { FieldOption } from "@/lib/website-schema";

/** ความกว้างผืนตอนออกแบบ (หน่วยของ x/y/w/h ทั้งหมด) */
export const CANVAS_WIDTH = 1200;

export type CanvasKind = "image" | "text" | "button" | "shape";

export const CANVAS_KINDS: FieldOption[] = [
  { v: "image", l: "🖼️ รูป" },
  { v: "text", l: "🔤 ข้อความ" },
  { v: "button", l: "🔘 ปุ่ม" },
  { v: "shape", l: "🎀 ของตกแต่ง" },
];

export const CANVAS_KIND_ICON: Record<CanvasKind, string> = { image: "🖼️", text: "🔤", button: "🔘", shape: "🎀" };

/** ทรงของรูป */
export const CANVAS_FRAMES: FieldOption[] = [
  { v: "rect", l: "สี่เหลี่ยม" },
  { v: "rounded", l: "มุมมน" },
  { v: "ellipse", l: "วงรี / วงกลม" },
  { v: "arch", l: "โค้งประตู" },
];

/** เส้นกรอบรอบรูป (เว้นระยะจากรูปได้ = กรอบลอย แบบเว็บสายวินเทจ) */
export const CANVAS_BORDERS: FieldOption[] = [
  { v: "none", l: "ไม่มี" },
  { v: "line", l: "เส้นเดี่ยว" },
  { v: "double", l: "เส้นคู่" },
  { v: "dotted", l: "จุดไข่ปลา" },
  { v: "lace", l: "ลูกไม้ขอบหยัก" },
];
export const CANVAS_BORDERS_ON = CANVAS_BORDERS.map((o) => o.v).filter((v) => v !== "none");

/**
 * ฟอนต์ — "display"/"body" = ตามธีมร้าน (เปลี่ยนธีมแล้วตามไปเอง) · ที่เหลือ = Google Fonts ที่เว็บร้านโหลดให้เอง
 * ⚠️ ชื่อต้องอยู่ใน CANVAS_FONT_FAMILIES ของเว็บร้านด้วย (กันใส่ชื่อมั่วแล้วโหลดของแปลก)
 */
export const CANVAS_FONTS: FieldOption[] = [
  { v: "display", l: "ฟอนต์หัวข้อของธีม" },
  { v: "body", l: "ฟอนต์เนื้อหาของธีม" },
  { v: "Parisienne", l: "Parisienne — ลายมือหวาน (อังกฤษ)" },
  { v: "Great Vibes", l: "Great Vibes — ลายมือหรู (อังกฤษ)" },
  { v: "Cormorant Garamond", l: "Cormorant Garamond — เซอริฟคลาสสิก" },
  { v: "Playfair Display", l: "Playfair Display — เซอริฟนิตยสาร" },
  { v: "Trirong", l: "Trirong — ไทยมีหัว" },
  { v: "Charm", l: "Charm — ไทยลายมือ" },
  { v: "Mali", l: "Mali — ไทยน่ารัก" },
  { v: "Itim", l: "Itim — ไทยลายมือกลม" },
  { v: "Kanit", l: "Kanit — ไทยไม่มีหัว" },
  { v: "Prompt", l: "Prompt — ไทยไม่มีหัว" },
];

export const CANVAS_WEIGHTS: FieldOption[] = [
  { v: "300", l: "บาง" },
  { v: "400", l: "ปกติ" },
  { v: "500", l: "กลาง" },
  { v: "600", l: "หนา" },
  { v: "700", l: "หนามาก" },
];

/** สี — ตามธีมร้าน (เปลี่ยนธีมแล้วตามไปเอง) หรือ "สีเอง" */
export const CANVAS_COLORS: FieldOption[] = [
  { v: "ink", l: "สีตัวอักษรหลัก" },
  { v: "brand", l: "สีแบรนด์" },
  { v: "brandDeep", l: "สีแบรนด์เข้ม" },
  { v: "brandSoft", l: "สีแบรนด์จาง" },
  { v: "muted", l: "สีตัวอักษรรอง" },
  { v: "page", l: "สีพื้นเว็บ" },
  { v: "surface", l: "สีพื้นการ์ด" },
  { v: "white", l: "ขาว" },
  { v: "custom", l: "สีเอง…" },
];

export const CANVAS_TEXT_BGS: FieldOption[] = [{ v: "none", l: "ไม่มี" }, ...CANVAS_COLORS];

export const CANVAS_BUTTON_VARIANTS: FieldOption[] = [
  { v: "brand", l: "ทึบสีแบรนด์" },
  { v: "outline", l: "ขอบบาง" },
  { v: "soft", l: "สีอ่อน" },
  { v: "link", l: "ข้อความขีดเส้นใต้" },
];

/** ลายของตกแต่ง — เว็บร้านวาดเป็น SVG ตามสีที่เลือก (src/components/home/CanvasShapes.tsx) */
export const CANVAS_SHAPES: FieldOption[] = [
  { v: "bow", l: "🎀 โบว์" },
  { v: "heart", l: "♡ หัวใจ" },
  { v: "sparkle", l: "✦ ประกาย" },
  { v: "star", l: "☆ ดาว" },
  { v: "flower", l: "✿ ดอกไม้" },
  { v: "pearls", l: "สายมุก" },
  { v: "lace", l: "วงลูกไม้ (ขอบหยัก)" },
  { v: "scallop", l: "แถบขอบหยัก" },
  { v: "wave", l: "เส้นคลื่น" },
  { v: "line", l: "เส้นตรง" },
  { v: "arch", l: "เส้นโค้งประตู" },
  { v: "rect", l: "บล็อกสี่เหลี่ยม" },
  { v: "ellipse", l: "วงกลม / วงรี" },
];

/** ชื่อลายแบบไม่มีสัญลักษณ์นำหน้า (สรุปในต้นไม้ใส่ไอคอนของชนิดให้อยู่แล้ว) */
export const CANVAS_SHAPE_LABEL: Record<string, string> = Object.fromEntries(CANVAS_SHAPES.map((o) => [o.v, o.l.replace(/^[^\p{L}]+/u, "")]));

/**
 * ชิ้นใหม่ตอนกด "เพิ่ม" (ตำแหน่งเหลื่อมกันตามลำดับ จะได้ไม่ทับกันสนิท)
 * ค่าที่ไม่ได้ใส่ตรงนี้ = default ของช่องใน schema
 */
export function canvasItemPreset(kind: CanvasKind, n = 0): Record<string, unknown> {
  const off = (n % 6) * 24;
  switch (kind) {
    case "image":
      return { kind, x: 720 + off, y: 60 + off, w: 320, h: 420, frame: "ellipse", fit: "cover", border: "lace", borderColor: "brand", borderWidth: 2, borderGap: 14 };
    case "button":
      return { kind, label: "เลือกดูสินค้า", href: "/shop", x: 100 + off, y: 420 + off, w: 220, h: 54, font: "body", size: 16, weight: "600", variant: "brand" };
    case "shape":
      return { kind, shape: "bow", color: "brand", x: 860 + off, y: 40 + off, w: 96, h: 72, hideMobile: true };
    default:
      return { kind: "text", text: "หัวข้อของคุณ", font: "display", size: 56, weight: "500", lineHeight: 115, x: 100 + off, y: 120 + off, w: 560, h: 80, color: "ink" };
  }
}

const s = (v: unknown) => String(v ?? "").trim();

/** สรุปชิ้น 1 ชิ้น (ต้นไม้ด้านซ้ายของตัวจัดหน้า) */
export function canvasItemSummary(it: Record<string, unknown>): string {
  const kind = (s(it.kind) || "text") as CanvasKind;
  const icon = CANVAS_KIND_ICON[kind] ?? "🧩";
  const lock = it.locked ? " 🔒" : "";
  if (kind === "text") return `${icon} ${s(it.text).split("\n")[0].slice(0, 40) || "(ข้อความว่าง)"}${lock}`;
  if (kind === "button") return `${icon} ${s(it.label) || "(ปุ่มไม่มีข้อความ)"}${s(it.href) ? ` → ${s(it.href)}` : ""}${lock}`;
  if (kind === "image") return `${icon} ${s(it.alt) || (it.imageKey ? "รูป" : "(ยังไม่ใส่รูป)")}${lock}`;
  return `${icon} ${CANVAS_SHAPE_LABEL[s(it.shape)] ?? "ของตกแต่ง"}${lock}`;
}

/** ตรวจก่อนเผยแพร่ — ข้อความภาษาคน */
export function validateCanvas(b: Record<string, unknown>, label: string): { level: "error" | "warning"; message: string }[] {
  const out: { level: "error" | "warning"; message: string }[] = [];
  const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]).filter((it) => it.enabled !== false) : [];
  const height = Number(b.height) || 0;
  if (!items.length) out.push({ level: "warning", message: `${label}: ยังไม่มีชิ้นส่วนบนผืน` });
  items.forEach((it, i) => {
    const name = `${label} ชิ้นที่ ${i + 1} (${canvasItemSummary(it)})`;
    const kind = s(it.kind);
    if (kind === "image" && !it.imageKey) out.push({ level: "warning", message: `${name}: ยังไม่ได้ใส่รูป` });
    if (kind === "image" && it.imageKey && !s(it.alt)) out.push({ level: "warning", message: `${name}: รูปยังไม่มีคำบรรยาย (Alt) — มีผลกับ SEO` });
    if (kind === "button" && !s(it.label)) out.push({ level: "error", message: `${name}: ปุ่มยังไม่มีข้อความ` });
    if (kind === "button" && !s(it.href)) out.push({ level: "warning", message: `${name}: ปุ่มยังไม่ได้ตั้ง "กดแล้วไปที่"` });
    if (kind === "text" && !s(it.text)) out.push({ level: "warning", message: `${name}: ข้อความว่าง` });
    const x = Number(it.x) || 0;
    const y = Number(it.y) || 0;
    const w = Number(it.w) || 0;
    if (x >= CANVAS_WIDTH || x + w <= 0 || (height && y >= height))
      out.push({ level: "warning", message: `${name}: อยู่นอกผืนทั้งชิ้น — ลูกค้าจะมองไม่เห็น` });
  });
  return out;
}
