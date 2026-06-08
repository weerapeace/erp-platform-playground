/**
 * Payroll — coerce ค่าว่างก่อนเขียน DB (ของกลางชั้นข้อมูล payroll)
 *
 * ปัญหา: ฟอร์มส่ง '' (string ว่าง) สำหรับ field ที่ไม่ได้กรอก → ลง column ที่เป็น
 *        uuid (FK/relation) / date / timestamp ไม่ได้ → error เช่น
 *        'invalid input syntax for type uuid: ""' หรือ '... for type date: ""'
 *
 * วิธีแก้: แปลง '' → null สำหรับคอลัมน์ที่ลงท้ายด้วย _id / _date / _at
 *   - _id  = FK uuid (position_id, cost_center_id, employee_id, ฯลฯ) — text _id (national_id) null ก็ปลอดภัย (nullable)
 *   - _date / _at = วันที่/เวลา
 * เรียกใน toColumns ของทุกชั้นข้อมูล (employees / contracts / settings / master)
 */
export function nullifyEmpty(out: Record<string, unknown>): void {
  for (const k of Object.keys(out)) {
    if (out[k] === "" && (k.endsWith("_id") || k.endsWith("_date") || k.endsWith("_at"))) {
      out[k] = null;
    }
  }
}
