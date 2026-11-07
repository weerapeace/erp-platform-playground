"use client";

// ============================================================
// /admin/plugins — ของกลางในระบบ (Plugin Registry)
//   ทะเบียน = lib/shared-parts-registry.ts (ชื่อ · ใช้ทำอะไร · ใช้/ห้ามใช้เมื่อไหร่ · ตัวซ้ำ · ตัวเก่า)
//   ใช้กี่ที่ ที่ไหน = นับจากโค้ดจริงทุกครั้งที่ build (scripts/shared-parts-scan.mjs) ผ่าน /api/admin/shared-parts
//   แท็บ "ทะเบียนเดิม" = ตาราง erp_plugins กรอกมือ แบบดูอย่างเดียว (เอาสวิตช์ออก 2026-11-07) — legacy-tab.tsx
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
