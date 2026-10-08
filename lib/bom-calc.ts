/**
 * สูตรคำนวณปริมาณวัตถุดิบ/ผ้าของ BOM (ของกลาง) — กฎเดียวกับตัวแก้บรรทัด BOM
 *
 * กฎมาจากตาราง material_groups: calc_method + divisor + loss_percent(เผื่อเสีย%)
 * ใช้ร่วมกัน: หน้า BOM (line-editor) และเครื่องคิดเลขผ้า (/fabric-calc)
 * แก้ที่นี่ที่เดียว → กฎทั้งสองที่ตรงกันเสมอ
 */

export type FabricCalcMethod = "count" | "length" | "area_100" | "area_face" | "area_sheet" | "manual";
/** "มาเป็น" ของวัตถุดิบที่คิดจากพื้นที่: roll = ม้วน (คิดตามหน้ากว้าง → หลา) · sheet = ผืน/แผ่น (คิดจากพื้นที่ผืนเต็ม → กี่ผืน) */
export type SupplyForm = "roll" | "sheet";

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
  supply_form?:  SupplyForm | string | null;   // มาเป็น ม้วน/ผืน (null = ให้ระบบเลือกเอง)
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;

type FormInput = Pick<FabricCalcInput, "calc_method" | "face_width_cm" | "sheet_width" | "sheet_length" | "supply_form">;

/**
 * "มาเป็น" ที่ใช้จริงของบรรทัดนี้ (เฉพาะกลุ่มที่คิดจากพื้นที่ผ้า: area_face / area_sheet — กลุ่มอื่นคืน null)
 * เจ้าของสั่ง 2026-10-08: ผ้า/PU/ตัวเสริม บางทีมาเป็นม้วน บางทีมาเป็นผืน (เช่น 110×80) ต้องใส่ได้ทั้ง 2 แบบ
 * - ระบุไว้ (roll/sheet) → ตามนั้น
 * - ไม่ระบุ → มีหน้ากว้าง = ม้วน (มีทั้งคู่ก็ม้วน — เจ้าของเลือก) · มีแค่ขนาดผืน = ผืน · ไม่มีเลย = ตามวิธีของกลุ่ม
 */
export function resolveSupplyForm(i: FormInput): SupplyForm | null {
  const m = i.calc_method ?? "manual";
  if (m !== "area_face" && m !== "area_sheet") return null;
  if (i.supply_form === "roll" || i.supply_form === "sheet") return i.supply_form;
  if (Number(i.face_width_cm) > 0) return "roll";
  if (Number(i.sheet_width) > 0 && Number(i.sheet_length) > 0) return "sheet";
  return m === "area_sheet" ? "sheet" : "roll";
}

/** วิธีคิด "ที่ใช้จริง" — ม้วน → area_face · ผืน → area_sheet · กลุ่มอื่นคงเดิม */
export function effectiveCalcMethod(i: FormInput): FabricCalcMethod | string {
  const f = resolveSupplyForm(i);
  if (f === "roll") return "area_face";
  if (f === "sheet") return "area_sheet";
  return i.calc_method ?? "manual";
}

/** หน่วยของแบบผืน แยกตามกลุ่ม (เจ้าของเลือก 2026-10-08): ผ้า/ลายพิมพ์ = "ผืน" · ตัวเสริม/PU/อื่น ๆ = "แผ่น" */
export function sheetUnitFor(groupName: string | null | undefined): string {
  const g = (groupName ?? "").trim();
  return g.startsWith("ผ้า") || g === "ลายพิมพ์" ? "ผืน" : "แผ่น";
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
