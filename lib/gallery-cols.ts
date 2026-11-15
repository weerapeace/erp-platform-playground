// ============================================================
// gallery-cols — ตรรกะล้วนของของกลาง "เลือกจำนวนการ์ดต่อแถว" (components/gallery-columns)
// เทสต์: lib/__tests__/gallery-cols.test.ts
// ============================================================

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
