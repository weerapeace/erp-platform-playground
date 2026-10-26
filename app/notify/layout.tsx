/**
 * Layout ของแอปเดี่ยว "แจ้งเตือน ERP" (/notify) — ติดตั้งลงหน้าจอโฮมได้ + รับแจ้งเตือนเด้ง (Web Push)
 * - manifest แยก (/notify.webmanifest · scope "/" เพื่อให้หน้า login/หน้าเรื่องที่เปิด อยู่ในแอปเดียวกัน ไม่เด้งออกเบราว์เซอร์)
 *   ⚠️ ตั้งใน page.tsx (ตั้งที่นี่จะโดน manifest กลางทับ — ดูหมายเหตุใน page.tsx)
 * - ไอคอน: app/notify/icon.png + apple-icon.png (ทับไอคอนกลางเฉพาะหน้านี้)
 * - เป็นข้อมูลส่วนตัวของผู้ใช้แต่ละคน (กระดิ่งของตัวเอง) → ไม่ผูกล็อกแอป/ไม่ต้องสิทธิ์พิเศษ แค่ล็อกอิน
 */
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "แจ้งเตือน ERP",
  appleWebApp: { capable: true, title: "แจ้งเตือน", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function NotifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
