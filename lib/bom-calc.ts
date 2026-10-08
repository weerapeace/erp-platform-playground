/**
 * สูตรคำนวณปริมาณวัตถุดิบ/ผ้าของ BOM (ของกลาง) — กฎเดียวกับตัวแก้บรรทัด BOM
 *
 * กฎมาจากตาราง material_groups: calc_method + divisor + loss_percent(เผื่อเสีย%)
 * ใช้ร่วมกัน: หน้า BOM (line-editor) และเครื่องคิดเลขผ้า (/fabric-calc)
 * แก้ที่นี่ที่เดียว → กฎทั้งสองที่ตรงกันเสมอ
 */

export type FabricCalcMethod = "count" | "length" | "area_100" | "area_face" | "area_sheet" | "manual";

export type FabricCalcInput = {
  calc_method:   FabricCalcMethod | string;
  divisor:       number | null | undefined;   // ตัวหาร (ค่าเริ่มต้น 90)
  waste_percent: number | null | undefined;   // เผื่อเสีย %
  pieces:        number | null | undefined;    // จำนวนชิ้นที่ตัด
  cut_width:     number | null | undefined;    // กว้าง (ซม.)
  cut_length:    number | null | undefined;    // ยาว (ซม.)
  face_width_cm: number | null | undefined;    // หน้ากว้างผ้า (ซม.)
  sheet_width?:  number | null | undefined;    // ขนาดผืนเต็ม กว้าง (ซม.) — area_sheet
  sheet_length?: number | null | undefined;    // ขนาดผืนเต็ม ยาว (ซม.) — area_sheet
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * วิธีคิด "ที่ใช้จริง" ของบรรทัดนี้ — กลุ่มตั้ง area_face (คิดตามหน้ากว้าง) แต่ตัววัตถุดิบไม่มีหน้ากว้าง
 * ทว่ามีขนาดผืนเต็ม (เช่น ผ้าขาวม้าขายเป็นผืน 100×140 / กระดาษแผ่น 79×109) → คิดแบบผืน (area_sheet) ให้แทน
 * ไม่งั้นระบบจะเงียบ ๆ ได้ 0 ทั้งที่ข้อมูลพอคิด (เจ้าของเจอ 2026-10-08: ใบสั่งผลิต "รวมต้องใช้" ขึ้น 0 ทุกแถว)
 */
export function effectiveCalcMethod(i: Pick<FabricCalcInput, "calc_method" | "face_width_cm" | "sheet_width" | "sheet_length">): FabricCalcMethod | string {
  const m = i.calc_method ?? "manual";
  if (m === "area_face" && !(Number(i.face_width_cm) > 0) && Number(i.sheet_width) > 0 && Number(i.sheet_length) > 0) return "area_sheet";
  return m;
}

/** พื้นที่ตัด = กว้าง × ยาว × จำนวนชิ้น */
export function lineArea(i: Pick<FabricCalcInput, "cut_width" | "cut_length" | "pieces">): number {
  return (i.cut_width || 0) * (i.cut_length || 0) * (i.pieces || 1);
}

/**
 * คำนวณปริมาณ — คืน null ถ้าข้อมูลไม่พอ (ให้ผู้เรียกคงค่าเดิมไว้ ไม่ทับด้วย 0)
 * - count:     จำนวนชิ้น
 * - length:    ยาว × (1+เผื่อ%) ÷ ตัวหาร
 * - area_100:  พื้นที่ × (1+เผื่อ%) ÷ ตัวหาร
 * - area_face: พื้นที่ × (1+เผื่อ%) ÷ หน้ากว้างผ้า ÷ ตัวหาร   (ผ้าม้วน → หลา/เมตร)
 * - area_sheet: พื้นที่ตัด × (1+เผื่อ%) ÷ พื้นที่ผืนเต็ม      (ผ้าชิ้น/ตัวเสริม/ลายพิมพ์ → กี่ผืน/แผ่น)
 * - manual:    null (พิมพ์เอง)
 */
export function fabricQty(i: FabricCalcInput): number | null {
  const m = effectiveCalcMethod(i);
  const d = i.divisor || 90;
  const k = 1 + (i.waste_percent || 0) / 100;
  if (m === "count")     return i.pieces || 0;
  if (m === "length")    return i.cut_length ? r4((i.cut_length || 0) * k / d) : null;
  if (m === "area_100")  return (i.cut_width && i.cut_length) ? r4(lineArea(i) * k / d) : null;
  if (m === "area_face") return (i.cut_width && i.cut_length && i.face_width_cm) ? r4(lineArea(i) * k / (i.face_width_cm || 1) / d) : null;
  if (m === "area_sheet") {
    const sheet = (i.sheet_width || 0) * (i.sheet_length || 0);
    return (i.cut_width && i.cut_length && sheet) ? r4(lineArea(i) * k / sheet) : null;
  }
  return null;
}
