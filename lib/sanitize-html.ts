// ============================================================
// ทำความสะอาด HTML จากช่องพิมพ์ข้อความแบบจัดรูปแบบ (Rich text) ก่อนแสดงผล — ของกลาง
// กันสคริปต์แฝงที่อาจถูกบันทึกไว้ในข้อมูล เช่น <img onerror=…> / <script> / ลิงก์ javascript:
// (ถ้าไม่กัน: คนที่แก้ข้อมูลได้ฝังสคริปต์ → ใครเปิดดู/สั่งพิมพ์ สคริปต์จะรันด้วยสิทธิ์ของคนนั้น)
//
// ใช้ทุกครั้งที่จะเอา HTML จากฐานข้อมูลไปใส่ dangerouslySetInnerHTML / ใบพิมพ์ ({{{ }}})
// ฝั่งเบราว์เซอร์ใช้ DOMPurify · ฝั่ง server ไม่มีหน้าเว็บให้ตรวจ → ตัด tag ทิ้งเหลือข้อความล้วน (ปลอดภัยไว้ก่อน)
// ============================================================
import DOMPurify from "dompurify";

export function sanitizeRichHtml(html: string | null | undefined): string {
  const raw = String(html ?? "");
  if (!raw) return "";
  if (typeof window === "undefined" || !DOMPurify.isSupported) return raw.replace(/<[^>]*>/g, "").replace(/</g, "&lt;");
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
