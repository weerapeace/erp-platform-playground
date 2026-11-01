"use client";

// หน้า /tasks/plan — 📋 แผนงานทีม (Todo ตามความด่วน + ตาราง 4 ช่อง) · เนื้อหาจริงที่ components/team-plan
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StandaloneShell } from "@/components/standalone-shell";
import { TeamPlanBoard } from "@/components/team-plan";

function PlanPageInner() {
  const sp = useSearchParams();
  return (
    <StandaloneShell title="แผนงาน" icon="📋" accent="violet">
      <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <h1 className="text-2xl font-bold text-slate-900">แผนงาน</h1>
        <p className="mt-1 text-slate-500">งานที่ต้องทำของทีม จัดตามความด่วน · ปักดาว 3 งานหลักของวันนี้ · มอบงานแล้วคนนั้นได้แจ้งเตือน</p>
      </div>
      <div className="px-4 py-4 sm:px-8"><TeamPlanBoard initialItemId={sp.get("item")} /></div>
    </StandaloneShell>
  );
}

export default function TeamPlanPage() {
  return <Suspense fallback={null}><PlanPageInner /></Suspense>;
}
