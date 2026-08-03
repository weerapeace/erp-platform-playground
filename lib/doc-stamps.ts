/**
 * ของกลาง — ลายเซ็น / ตราประทับ บนเอกสารพิมพ์
 *
 * ใช้กับเอกสารอะไรก็ได้ (ใบสั่งซื้อ / ใบเสนอราคา / ใบวางบิล / ใบส่งของ) โดยแยกด้วย entity_type
 * ตำแหน่งเก็บเป็น "มิลลิเมตรจากมุมบนซ้ายของหน้ากระดาษ" — หน่วยเดียวกับที่เบราว์เซอร์ใช้ตอนพิมพ์
 * → ลากวางบนจอตรงไหน พิมพ์ออกมาตรงนั้นเป๊ะ ไม่เพี้ยนตามขนาดจอ
 */

export type DocStamp = {
  id: string;
  entity_type: string;
  kind: "signature" | "stamp";
  label: string | null;
  image_key: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  opacity: number;
  is_active: boolean;
  sort_order: number;
};

/** ขนาดกระดาษ (มม.) — ใช้แปลงพิกัดจอ ↔ มม. */
export const PAPER = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 216, h: 279 },
} as const;

export const paperSize = (size: string | null | undefined) =>
  PAPER[(size ?? "A4") as keyof typeof PAPER] ?? PAPER.A4;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * สร้าง HTML ชั้นลายเซ็น/ตรา สำหรับแปะลงเอกสาร
 * วางเป็น absolute เทียบกับกล่อง .doc (เทมเพลตต้องมี .doc { position: relative })
 * `print-color-adjust: exact` = บังคับให้เบราว์เซอร์พิมพ์รูปออกมาจริง ไม่ตัดทิ้งตอนประหยัดหมึก
 */
export function buildStampsHtml(stamps: readonly DocStamp[]): string {
  const items = stamps.filter((s) => s.is_active && s.image_key);
  if (items.length === 0) return "";
  const imgs = items.map((s) => {
    const src = `/api/r2-image?key=${encodeURIComponent(s.image_key)}&w=800`;
    return `<img class="doc-stamp" src="${esc(src)}" alt="${esc(s.label ?? "")}" style="left:${s.x_mm}mm;top:${s.y_mm}mm;width:${s.w_mm}mm;height:${s.h_mm}mm;opacity:${s.opacity}" />`;
  }).join("");
  return `<div class="doc-stamp-layer">${imgs}</div>`;
}

/** CSS ที่เทมเพลตต้องมี (ผนวกท้าย custom_css ครั้งเดียวต่อเทมเพลต) */
export const STAMP_CSS = `
.doc { position: relative; }
.doc-stamp-layer { position: absolute; inset: 0; pointer-events: none; }
.doc-stamp { position: absolute; object-fit: contain; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

export const DEFAULT_STAMP = (kind: "signature" | "stamp") =>
  kind === "signature"
    ? { x_mm: 30, y_mm: 245, w_mm: 40, h_mm: 20 }
    : { x_mm: 150, y_mm: 235, w_mm: 35, h_mm: 35 };
