/**
 * ชื่อไฟล์ตอน "บันทึกเป็น PDF" ของหน้าพิมพ์ — ของกลาง
 *
 * เบราว์เซอร์ใช้ <title> ของเอกสารที่พิมพ์เป็นชื่อไฟล์ตั้งต้นในหน้าต่าง Save as PDF
 * (เว็บสั่งเซฟไฟล์เองเงียบ ๆ ไม่ได้ — ทำได้แค่ตั้งชื่อให้ล่วงหน้า)
 *
 * ใช้กับทุกใบ: ใบเสนอราคา / ใบสั่งซื้อ / ใบส่งของ ฯลฯ
 *   docFileName("ใบเสนอราคา", "QT-202607-0005") → "ใบเสนอราคา - QT-202607-0005"
 */

/** อักขระที่ตั้งชื่อไฟล์ไม่ได้บน Windows/macOS */
const BAD_CHARS = /[\\/:*?"<>|]/g;
/** อักขระควบคุม (ขึ้นบรรทัด/แท็บ ฯลฯ) — ติดมาจากข้อมูลบางที ทำให้ชื่อไฟล์เพี้ยน */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

export function sanitizeFileName(name: string): string {
  return String(name ?? "")
    .replace(BAD_CHARS, "-")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);                     // กันชื่อยาวเกินจนระบบไฟล์ไม่รับ
}

/** "ใบเสนอราคา - QT-202607-0005" · ไม่มีเลขที่เอกสาร → เหลือแค่ชื่อเอกสาร */
export function docFileName(docLabel: string, docNumber?: string | null): string {
  const no = String(docNumber ?? "").trim();
  return sanitizeFileName(no ? `${docLabel} - ${no}` : docLabel);
}
