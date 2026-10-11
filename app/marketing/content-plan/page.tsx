"use client";

// 🗓️ วางแผนคอนเทนต์ — เปลือกหน้า: เชลล์ + สิทธิ์ · ตัวหน้าจออยู่ที่ view.tsx
// สิทธิ์ข้อมูลคอนเทนต์ใช้ชุดเดิมของโมดูลคอนเทนต์ (tasks.*) · แนวคอนเทนต์ = marketing.label.manage
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth } from "@/components/auth";
import { ContentPlanView } from "./view";

export default function ContentPlanPage() {
  const { can } = useAuth();
  return (
    <PlaygroundShell>
      <ContentPlanView canCreate={can("tasks.create" as never)} canEdit={can("tasks.edit" as never)} canPillars={can("marketing.label.manage" as never)} />
    </PlaygroundShell>
  );
}
