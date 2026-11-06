"use client";

/**
 * หน้า "ประวัติการใช้งาน (Audit Log)" — ใคร ทำอะไร ที่หน้าไหน รายการไหน เปลี่ยนจากอะไรเป็นอะไร
 * ด่านสิทธิ์ (admin.audit_log) + เปลือกหน้า · เนื้อหาอยู่ที่ audit-log-view.tsx · เอกสาร: docs/audit-log.md
 */
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, AccessDenied } from "@/components/auth";
import { LoadingState } from "@/components/state-views";
import { AuditLogView } from "./audit-log-view";

export default function AuditLogPage() {
  const { can, permsReady } = useAuth();
  // รอสิทธิ์โหลดเสร็จก่อน — ไม่งั้นแวบหน้า "ไม่มีสิทธิ์" ให้คนที่มีสิทธิ์เห็น
  if (!permsReady) return <PlaygroundShell><LoadingState /></PlaygroundShell>;
  if (!can("admin.audit_log")) {
    return <PlaygroundShell><AccessDenied message="หน้าประวัติการใช้งานต้องเป็นผู้จัดการขึ้นไป" /></PlaygroundShell>;
  }
  return <PlaygroundShell><AuditLogView /></PlaygroundShell>;
}
