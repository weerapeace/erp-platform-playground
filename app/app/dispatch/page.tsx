/**
 * แอป "จ่ายงาน" (dispatch) — เปิดบอร์ดจ่ายงานตรง ๆ (ไม่ผ่านเชลล์ iframe กลาง)
 * บอร์ดเป็นหน้าหนัก/เต็มจอ + มี PWA ของตัวเอง (/api/board-manifest) อยู่แล้ว
 * route เฉพาะนี้ชนะ /app/[appKey] → redirect ไปหน้าบอร์ดจริง (เปิดเต็มจอ โหลดข้อมูลปกติ)
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DispatchAppRedirect() {
  redirect("/master/work-board");
}
