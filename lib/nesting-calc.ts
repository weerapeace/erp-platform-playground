/**
 * คำนวณผ้าแบบ "วางตัดจริง" (nesting) — ของกลาง
 *
 * ทำไมต้องมี: สูตรเดิม (lib/bom-calc → area_face) คิดแบบ "เอาพื้นที่หาร"
 *   พื้นที่ที่ตัด ÷ หน้ากว้าง ÷ ตัวหาร = กี่หลา
 * ซึ่งคิดเหมือนผ้าเป็นของเหลว เทให้เต็มพอดีได้ ไม่มีเศษ — แต่ผ้าจริงตัดเป็นชิ้นสี่เหลี่ยม
 * เศษที่เหลือริมม้วนใช้ไม่ได้ ยิ่งชิ้นใหญ่เทียบหน้ากว้าง ยิ่งเพี้ยนมาก
 *
 * ตัวอย่างจริงของเจ้าของ: ผ้าหน้ากว้าง 90 ตัดชิ้น 50×100
 *   - สูตรเดิม: 50×100 ÷ 90 ÷ 90        = 0.62 หลา   ← ต่ำกว่าจริงเกือบครึ่ง
 *   - วางจริง : กว้าง 90 วางชิ้นกว้าง 50 ได้ 1 ชิ้น/แถว (เหลือเศษ 40 ทิ้ง)
 *               ต้องใช้ผ้ายาว 100 ซม. = 100 ÷ 90     = 1.11 หลา  ← ตรงกับ "ได้ 1 ใบ/หลา"
 *
 * ⚠️ ขอบเขต (เจ้าของเคาะ 2026-07-27): ใช้ "เฉพาะในเครื่องคิดต้นทุน" ก่อน
 *    BOM จริงทั้งระบบยังใช้ area_face เหมือนเดิม — ไม่ขยับต้นทุนของสูตรเก่า 1,500+ ตัว
 */

export type NestInput = {
  face_width_cm: number | null | undefined;   // หน้ากว้างผ้า (ซม.)
  cut_width: number | null | undefined;       // ชิ้นที่ตัด กว้าง (ซม.)
  cut_length: number | null | undefined;      // ชิ้นที่ตัด ยาว (ซม.)
  /**
   * จำนวนชิ้นที่ต้องตัด "ทั้งหมด" (ไม่ใช่ต่อสินค้า 1 ตัว)
   * ⚠️ ผู้เรียกควรส่ง = ชิ้นต่อสินค้า × จำนวนที่ผลิตต่อล็อต แล้วค่อยหารกลับเป็นต่อชิ้น
   *    เพราะถ้าคิดทีละตัว เศษที่เหลือในแถวจะถูกนับเป็นขยะทุกตัว (ทั้งที่จริงตัวถัดไปใช้ต่อได้)
   *    เช่น หน้า 150 ตัด 28×25 ต้องการ 2 ชิ้น → วางได้ 5/แถว
   *         คิดทีละตัว = เสียที่ว่าง 3 ช่องทุกตัว · คิดทั้งล็อต 100 ตัว = ใช้เต็มแถว
   */
  pieces: number | null | undefined;
  waste_percent?: number | null;              // เผื่อเสีย %
  divisor?: number | null;                    // ซม. ต่อ 1 หน่วยซื้อ (หลา = 90 ตามที่ระบบใช้)
  allow_rotate?: boolean;                     // หมุนชิ้น 90° ได้ไหม (ผ้าสีพื้น=ได้ · มีลาย/มีขน=ไม่ได้)
};

export type NestResult = {
  perRow: number;         // วางได้กี่ชิ้นต่อแถว (ตามหน้ากว้าง)
  rows: number;           // ต้องใช้กี่แถว
  rowLenCm: number;       // แถวหนึ่งกินความยาวผ้ากี่ ซม.
  totalLenCm: number;     // ความยาวผ้าที่ต้องใช้จริง (รวมเผื่อเสีย)
  qty: number;            // = totalLenCm ÷ divisor (หน่วยซื้อ เช่น หลา)
  leftoverCm: number;     // เศษริมม้วนที่ใช้ไม่ได้ (ซม.)
  rotated: boolean;       // เลือกวางแบบหมุนชิ้นหรือไม่
  areaQty: number;        // ปริมาณถ้าคิดด้วยสูตรเดิม (เอาไว้โชว์เทียบ)
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * คืน null ถ้าข้อมูลไม่พอ หรือ "ชิ้นใหญ่กว่าหน้ากว้าง" (วางไม่ได้เลย — ต้องบอกผู้ใช้ ไม่ใช่คิดมั่ว)
 */
export function nestCalc(i: NestInput): NestResult | null {
  const faceW = Number(i.face_width_cm) || 0;
  const w = Number(i.cut_width) || 0;
  const l = Number(i.cut_length) || 0;
  const pcs = Number(i.pieces) || 0;
  if (faceW <= 0 || w <= 0 || l <= 0 || pcs <= 0) return null;

  const k = 1 + (Number(i.waste_percent) || 0) / 100;
  const d = Number(i.divisor) || 90;

  // 2 ท่าวาง: เอาด้าน "กว้าง" ขวางหน้าผ้า (A) หรือเอาด้าน "ยาว" ขวางหน้าผ้า (B = หมุน 90°)
  //   ท่าไหนได้ชิ้นต่อความยาวผ้ามากกว่า = ประหยัดกว่า
  type Lay = { perRow: number; rowLen: number; rotated: boolean };
  const lays: Lay[] = [{ perRow: Math.floor(faceW / w), rowLen: l, rotated: false }];
  if (i.allow_rotate) lays.push({ perRow: Math.floor(faceW / l), rowLen: w, rotated: true });

  const usable = lays.filter((x) => x.perRow >= 1);
  if (usable.length === 0) return null;                 // ชิ้นกว้างเกินหน้าผ้า — วางไม่ได้

  // เทียบด้วย "ชิ้นต่อความยาวผ้า 1 ซม." (มากกว่า = ดีกว่า)
  const best = usable.reduce((a, b) => (b.perRow / b.rowLen > a.perRow / a.rowLen ? b : a));

  const rows = Math.ceil(pcs / best.perRow);
  const totalLenCm = r4(rows * best.rowLen * k);
  const across = best.rotated ? l : w;                  // ด้านที่ขวางหน้าผ้า

  return {
    perRow: best.perRow,
    rows,
    rowLenCm: r4(best.rowLen),
    totalLenCm,
    qty: r4(totalLenCm / d),
    leftoverCm: r4(faceW - best.perRow * across),
    rotated: best.rotated,
    areaQty: r4((w * l * pcs * k) / faceW / d),          // สูตรเดิม (ไว้โชว์ว่าต่างกันเท่าไร)
  };
}

/** ข้อความอธิบายผลการวาง (ภาษาคน) — ใช้เป็น tooltip/บรรทัดใต้ช่อง */
export function nestExplain(r: NestResult, uom = "หลา"): string {
  const rot = r.rotated ? " (หมุนชิ้น 90°)" : "";
  return `วางได้ ${r.perRow} ชิ้น/แถว${rot} · ใช้ ${r.rows} แถว × ${r.rowLenCm} ซม. = ผ้ายาว ${r.totalLenCm} ซม. = ${r.qty} ${uom}`
    + (r.leftoverCm > 0 ? ` · เหลือเศษริมม้วน ${r.leftoverCm} ซม.` : "");
}
