/**
 * ฝัง "เช็กลิสต์เตรียม/ตัด" ตัวจริงของบอร์ดจ่ายงาน ไว้ในป๊อปอัปของหน้าอื่น (ของกลาง)
 *
 * เช็กลิสต์ตัวเต็ม (เตรียม/ตัด/งานเหมา/ของซื้อ/ปัญหา/ประวัติ/ต้นทุน) อยู่ในหน้า /master/work-board
 * หน้าอื่นที่อยากเปิดเช็กลิสต์ "โดยไม่ต้องย้ายหน้า" ให้เปิด iframe ไปที่ moChecklistEmbedUrl(moId)
 * → บอร์ดจะแสดงเฉพาะเช็กลิสต์เต็มกรอบ (ERPModal embedded) แล้วส่งข้อความกลับมาบอกหน้าแม่เมื่อ
 *    - "close"   ผู้ใช้กด "เสร็จ" / บันทึกส่งงานแล้ว → หน้าแม่ควรถอยกลับไปจอก่อนหน้า
 *    - "deleted" ใบสั่งผลิตถูกลบ → หน้าแม่ควรปิดป๊อปอัปทั้งใบ
 *
 * ใช้คู่กัน: ฝั่งบอร์ด postMoChecklistEvent() · ฝั่งหน้าแม่ readMoChecklistEvent() ใน listener ของ "message"
 */
export type MoChecklistEvent = "close" | "deleted";

const SOURCE = "erp-mo-checklist";

export const moChecklistEmbedUrl = (moId: string): string =>
  `/master/work-board?embed=1&mo=${encodeURIComponent(moId)}`;

/** ฝั่งบอร์ด (อยู่ใน iframe): บอกหน้าแม่ว่าเกิดอะไรขึ้น — ไม่ได้อยู่ใน iframe = ไม่ทำอะไร */
export function postMoChecklistEvent(type: MoChecklistEvent): void {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ source: SOURCE, type }, window.location.origin);
}

/** ฝั่งหน้าแม่: อ่านข้อความจาก iframe เช็กลิสต์ (รับเฉพาะที่มาจากเว็บเดียวกัน) — ไม่ใช่ข้อความของเรา = null */
export function readMoChecklistEvent(e: MessageEvent): MoChecklistEvent | null {
  if (typeof window === "undefined" || e.origin !== window.location.origin) return null;
  const d = e.data as { source?: unknown; type?: unknown } | null;
  if (!d || d.source !== SOURCE) return null;
  return d.type === "close" || d.type === "deleted" ? d.type : null;
}
