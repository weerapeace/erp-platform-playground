/**
 * Layout ของแอปเดี่ยว "เป้าหมาย" (standalone /goals/*)
 * - server component → export metadata ได้ (ชื่อแท็บ + ชื่อบน iPhone)
 * - ⚠️ manifest (ติดตั้งเป็นแอป "เป้าหมาย") ตั้งที่ page.tsx ทุกหน้าผ่าน pwa-metadata.ts — ตั้งที่นี่จะโดน manifest กลางทับ
 * - เปลือก client (topbar โฟกัส) อยู่ใน GoalsShell
 */
import type { Metadata } from "next";
import { GoalsShell } from "./goals-shell";

export const metadata: Metadata = {
  title: "เป้าหมาย & เส้นทางสู่ความสำเร็จ",
  appleWebApp: { capable: true, title: "เป้าหมาย", statusBarStyle: "default" },
};

export default function GoalsLayout({ children }: { children: React.ReactNode }) {
  return <GoalsShell>{children}</GoalsShell>;
}
