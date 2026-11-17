// ============================================================
// gallery-cols — ตรรกะล้วนของของกลาง "เลือกจำนวนการ์ดต่อแถว" (components/gallery-columns)
// เทสต์: lib/__tests__/gallery-cols.test.ts
// ============================================================

/** การ์ดเล็กสุดที่ยอมให้เหลือ (px) — จอ/กล่องแคบกว่าที่ตั้งไว้ = ลดจำนวนต่อแถวเองอัตโนมัติ (เจ้าของสั่ง 2026-11-17) */
export const GALLERY_MIN_CARD_PX = 70;
/** ตั้งแต่กี่ใบต่อแถวขึ้นไป = การ์ดเล็กมาก → ซ่อนชื่อใต้การ์ด (ชี้ค้างยังเห็นชื่อจาก title) */
export const GALLERY_COMPACT_FROM = 12;

/** ขั้นถัดไปเมื่อหมุนลูกกลิ้ง (Ctrl + ลูกกลิ้ง): dir +1 = ต่อแถวมากขึ้น (การ์ดเล็กลง) · −1 = น้อยลง (ใหญ่ขึ้น)
 *  สุดปลายแล้ว = อยู่ที่เดิม · ค่าที่ไม่อยู่ในรายการ = เริ่มจากตัวที่ใกล้สุด */
export function stepGalleryCols(cols: number, dir: 1 | -1, options: readonly number[]): number {
  if (!options.length) return cols;
  let i = options.indexOf(cols);
  if (i < 0) {
    i = 0;
    options.forEach((n, k) => { if (Math.abs(n - cols) < Math.abs(options[i] - cols)) i = k; });
  }
  return options[Math.max(0, Math.min(options.length - 1, i + dir))];
}

/** ค่า grid-template-columns: "สูงสุด cols ใบต่อแถว" — กล่องกว้างพอ = cols ใบพอดี ·
 *  แคบลงจนการ์ดเล็กกว่า minPx = ลดจำนวนต่อแถวเอง (auto-fill) · -0.1px กันปัดเศษแล้วหล่นเหลือ cols-1 */
export function galleryTemplate(cols: number, gap = "0.75rem", minPx = GALLERY_MIN_CARD_PX): string {
  const n = Math.max(1, Math.round(cols));
  if (n === 1) return "minmax(0, 1fr)";
  return `repeat(auto-fill, minmax(max(${minPx}px, calc((100% - ${n - 1} * ${gap}) / ${n} - 0.1px)), 1fr))`;
}

/** การ์ดเล็กมากไหม (ซ่อนชื่อ/ป้าย) */
export const isCompactGallery = (cols: number) => cols >= GALLERY_COMPACT_FROM;

/** ความกว้างรูปย่อที่ควรโหลดตามจำนวนการ์ดต่อแถว — การ์ดเล็กลง = ขอรูปเล็กลง (เปิดเร็ว ไม่เปลืองเน็ต)
 *  base = ขนาดที่หน้านั้นใช้ตอนการ์ดปกติ · คืนค่าที่ไม่ใหญ่กว่า base */
export function galleryThumbWidth(cols: number, base = 480): number {
  const w = cols >= 12 ? 200 : cols >= 10 ? 240 : cols >= 8 ? 320 : base;
  return Math.min(base, w);
}
