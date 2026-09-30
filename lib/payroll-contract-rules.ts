/**
 * Payroll — กฎตรวจสัญญาก่อนบันทึก (ของกลาง, pure ไม่แตะ DB)
 *
 * ใช้ได้ทั้งฝั่งฟอร์ม (เตือนก่อนส่ง) และฝั่งเซิร์ฟเวอร์ (กันหน้าอื่นที่ยิง API ตรง)
 * ห้าม import อะไรที่เป็น server-only (supabase-admin) ในไฟล์นี้ — ฟอร์มฝั่ง client เรียกใช้ด้วย
 */

/** ค่าเป็นวันที่ YYYY-MM-DD จริงไหม ('' / null / ขยะ = ไม่ใช่) */
export const isValidDateString = (v: unknown): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").slice(0, 10));

/**
 * ตรวจว่าสัญญาที่กำลังจะบันทึกครบพอไหม
 * คืนข้อความเตือน (ภาษาคน) ถ้าไม่ผ่าน · null = ผ่าน
 *
 * กฎ: สถานะ "สิ้นสุด" ต้องมีวันสิ้นสุด — เพราะระบบเอาวันนี้ไปเป็นวันลาออกของพนักงาน
 */
export function contractValidationError(row: { status?: unknown; end_date?: unknown }): string | null {
  if (String(row.status ?? "") === "ended" && !isValidDateString(row.end_date)) {
    return "สถานะ “สิ้นสุด” ต้องใส่วันที่ในช่อง “สิ้นสุด” ด้วย (ระบบจะใช้เป็นวันลาออกของพนักงาน)";
  }
  return null;
}
