/**
 * กติกากลาง "ต้องตัดไหม" — ใช้ร่วมกันทั้งฝั่งหน้าจอ (mo-materials, work-board) และ API
 * เพื่อให้ตัวเลข "ตัด X/Y" + สถานะ "พร้อมจ่าย" ตรงกันทุกที่
 *
 * กติกา: วัตถุดิบประเภท "อะไหล่" ไม่ต้องตัด (เช่น หัวซิป, ตัวดี) — ในตารางจะขึ้น "—"
 * และต้องไม่ถูกนับรวมในยอดที่ต้องตัด (ก่อนหน้านี้ถูกนับ ทำให้เห็น 0/18 แทน 0/16
 * และสถานะไม่มีวันขึ้น "พร้อมจ่าย" เพราะอะไหล่ติ๊กตัดไม่ได้)
 */

export type CutFields = {
  material_type?: string | null;
  cut_block_code?: string | number | null;
  cut_length?: number | string | null;
  pieces?: number | string | null;
};

/** วัตถุดิบประเภทอะไหล่ = ไม่ต้องตัด */
export const isAccessory = (materialType: string | null | undefined): boolean =>
  /อะไหล่/.test(materialType ?? "");

/** บรรทัด/บล็อกนี้ "ต้องตัด" ไหม — อะไหล่ไม่ต้องตัด, ที่เหลือถ้ามีข้อมูลบล็อก/ขนาด/ชิ้น = ต้องตัด */
export const needsCut = (m: CutFields): boolean =>
  !isAccessory(m.material_type) &&
  (m.cut_block_code != null || m.cut_length != null || m.pieces != null);
