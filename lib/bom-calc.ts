/**
 * สูตรคำนวณปริมาณวัตถุดิบ/ผ้าของ BOM (ของกลาง) — กฎเดียวกับตัวแก้บรรทัด BOM
 *
 * กฎมาจากตาราง material_groups: calc_method + divisor + loss_percent(เผื่อเสีย%)
 * ใช้ร่วมกัน: หน้า BOM (line-editor) และเครื่องคิดเลขผ้า (/fabric-calc)
 * แก้ที่นี่ที่เดียว → กฎทั้งสองที่ตรงกันเสมอ
 */

export type FabricCalcMethod = "count" | "length" | "area_100" | "area_face" | "manual";

export type FabricCalcInput = {
  calc_method:   FabricCalcMethod | string;
  divisor:       number | null | undefined;   // ตัวหาร (ค่าเริ่มต้น 90)
  waste_percent: number | null | undefined;   // เผื่อเสีย %
  pieces:        number | null | undefined;    // จำนวนชิ้นที่ตัด
  cut_width:     number | null | undefined;    // กว้าง (ซม.)
  cut_length:    number | null | undefined;    // ยาว (ซม.)
  face_width_cm: number | null | undefined;    // หน้ากว้างผ้า (ซม.)
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** พื้นที่ตัด = กว้าง × ยาว × จำนวนชิ้น */
export function lineArea(i: Pick<FabricCalcInput, "cut_width" | "cut_length" | "pieces">): number {
  return (i.cut_width || 0) * (i.cut_length || 0) * (i.pieces || 1);
}

/**
 * คำนวณปริมาณ — คืน null ถ้าข้อมูลไม่พอ (ให้ผู้เรียกคงค่าเดิมไว้ ไม่ทับด้วย 0)
 * - count:     จำนวนชิ้น
 * - length:    ยาว × (1+เผื่อ%) ÷ ตัวหาร
 * - area_100:  พื้นที่ × (1+เผื่อ%) ÷ ตัวหาร
 * - area_face: พื้นที่ × (1+เผื่อ%) ÷ หน้ากว้างผ้า ÷ ตัวหาร   (ผ้า → หลา/เมตร)
 * - manual:    null (พิมพ์เอง)
 */
export function fabricQty(i: FabricCalcInput): number | null {
  const m = i.calc_method ?? "manual";
  const d = i.divisor || 90;
  const k = 1 + (i.waste_percent || 0) / 100;
  if (m === "count")     return i.pieces || 0;
  if (m === "length")    return i.cut_length ? r4((i.cut_length || 0) * k / d) : null;
  if (m === "area_100")  return (i.cut_width && i.cut_length) ? r4(lineArea(i) * k / d) : null;
  if (m === "area_face") return (i.cut_width && i.cut_length && i.face_width_cm) ? r4(lineArea(i) * k / (i.face_width_cm || 1) / d) : null;
  return null;
}
