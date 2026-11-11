/**
 * /master/partner-data-check → ย้ายไปเป็นแท็บ "⚠️ ข้อมูลไม่ครบ" ในหน้า Partners แล้ว (เจ้าของขอ 2026-11-11)
 *   ลิงก์เก่า / เมนูเก่า / bookmark ยังใช้ได้ — พาไปแท็บนั้นให้เลย · กติกาอยู่ที่ lib/partner-data-check
 */
import { redirect } from "next/navigation";

export default function PartnerDataCheckRedirect() {
  redirect("/master/partners?tab=incomplete");
}
