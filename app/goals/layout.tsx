/**
 * Layout ของแอปเดี่ยว "เป้าหมาย" (standalone /goals/*)
 * - server component → export metadata/manifest ได้ (ติดตั้งเป็น PWA แยกของ Goals เอง)
 * - เปลือก client (topbar โฟกัส) อยู่ใน GoalsShell
 */
import type { Metadata } from "next";
import { GoalsShell } from "./goals-shell";

export const metadata: Metadata = {
  title: "เป้าหมาย & เส้นทางสู่ความสำเร็จ",
  manifest: "/goals.webmanifest",              // override manifest กลาง → ติดตั้งแอป "เป้าหมาย" ได้
  appleWebApp: { capable: true, title: "เป้าหมาย", statusBarStyle: "default" },
};

export default function GoalsLayout({ children }: { children: React.ReactNode }) {
  return <GoalsShell>{children}</GoalsShell>;
}
