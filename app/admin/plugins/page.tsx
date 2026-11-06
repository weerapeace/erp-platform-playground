"use client";

// ============================================================
// /admin/plugins — ของกลางในระบบ (Plugin Registry)
//   ทะเบียน = lib/shared-parts-registry.ts (ชื่อ · ใช้ทำอะไร · ใช้/ห้ามใช้เมื่อไหร่ · ตัวซ้ำ · ตัวเก่า)
//   ใช้กี่ที่ ที่ไหน = นับจากโค้ดจริงทุกครั้งที่ build (scripts/shared-parts-scan.mjs) ผ่าน /api/admin/shared-parts
//   แท็บ "ทะเบียนเดิม" = หน้าเดิม (ตาราง erp_plugins กรอกมือ) เก็บไว้ก่อน — legacy-tab.tsx
// คู่มือ: docs/shared-parts-registry.md
// ============================================================

import { PlaygroundShell } from "@/components/playground-shell";
import { usePermission, AccessDenied } from "@/components/auth";
import { SharedPartsView } from "./shared-parts-view";

export default function AdminPluginsPage() {
  const canView = usePermission("plugins.view");
  return (
    <PlaygroundShell>
      {canView ? <SharedPartsView /> : <AccessDenied />}
    </PlaygroundShell>
  );
}
