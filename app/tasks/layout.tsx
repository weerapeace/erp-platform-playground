"use client";

/**
 * Layout ของแอป "จัดการงาน" (/tasks/*) — guard กลางระดับ route
 * หน้า tasks ใช้ StandaloneShell (ไม่ใช่ PlaygroundShell) เลยไม่มี app-lock guard ในตัว
 * → ห่อด้วย AppAccessGate ที่ layout เพื่อบังคับสิทธิ์ทุกหน้า /tasks/* (กันพิมพ์ URL ตรง)
 */
import { AppAccessGate } from "@/components/app-access-gate";

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <AppAccessGate appKey="tasks">{children}</AppAccessGate>;
}
