"use client";

// หน้า /admin/family-template — ครอบ FamilyTemplateView (เนื้อหาจริงอยู่ใน view.tsx เพื่อให้ import ฝังที่อื่นได้)
// เปิดตรงได้เฉพาะผู้ดูแลระบบ (หน้า admin orphan ไม่ผูกแอป) — ฝังในหน้าอื่นยังใช้ <FamilyTemplateView/> ได้ตามเดิม
import { PermissionGate, AccessDenied } from "@/components/auth";
import { FamilyTemplateView } from "./view";

export default function FamilyTemplatePage() {
  return <PermissionGate perm="admin.users" fallback={<AccessDenied message="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />}><FamilyTemplateView /></PermissionGate>;
}
