"use client";

/**
 * ศูนย์งานแก้แอป (/admin/app-changes) — รวมงานแก้ดีไซน์/จุกจิกทุกหน้า ผูกหน้า + ของกลาง + แผนผังการทำงาน + แผนทีม
 * หน้าจอ = components/app-change/hub.tsx · คู่มือ docs/app-changes.md
 */
import { Suspense } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { LoadingState } from "@/components/state-views";
import { AppChangeHub } from "@/components/app-change/hub";

export default function AppChangesPage() {
  return (
    <PlaygroundShell>
      <Suspense fallback={<LoadingState label="กำลังโหลด…" />}><AppChangeHub /></Suspense>
    </PlaygroundShell>
  );
}
