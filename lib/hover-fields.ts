/**
 * ตั้งค่า "สิ่งที่โชว์ในกล่อง Hover" ต่อคน — หัวข้อที่เพิ่มเข้าระบบทีหลัง
 * ผู้ใช้ที่เคยบันทึกค่าไว้ก่อนมีหัวข้อนั้น จะไม่เห็นหัวข้อใหม่เลย (ไม่เคยได้ติ๊ก)
 * → เก็บ seen = หัวข้อที่มีตอนบันทึก · ตอนโหลด: หัวข้อใน "ค่าเริ่มต้น" ที่ยังไม่อยู่ใน seen = เติมให้เอง
 * (ผู้ใช้เอาออกเองทีหลังได้ — บันทึกครั้งถัดไป seen = ทุกหัวข้อ เลยไม่เติมกลับมาอีก)
 */
export function withNewDefaults<K extends string>(saved: readonly K[], seen: readonly string[], defaults: readonly K[]): K[] {
  const add = defaults.filter((k) => !seen.includes(k) && !saved.includes(k));
  return add.length ? [...saved, ...add] : [...saved];
}
