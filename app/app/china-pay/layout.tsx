"use client";

/**
 * Layout ของแอปเดี่ยว "โอนเงินจีน" (/app/china-pay) — guard กลางระดับ route
 * หน้านี้เป็น page custom ใหญ่ (ไม่ผ่าน /app/[appKey] ที่ guard เอง) เลยต้องห่อ guard ที่ layout
 * → บังคับสิทธิ์ app.china_pay (กันคนไม่มีสิทธิ์พิมพ์ URL ตรง)
 */
import { AppAccessGate } from "@/components/app-access-gate";

export default function ChinaPayAppLayout({ children }: { children: React.ReactNode }) {
  return <AppAccessGate appKey="china-pay">{children}</AppAccessGate>;
}
