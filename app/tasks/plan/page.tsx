"use client";

// หน้า /tasks/plan — 📋 แผนงานทีม (Todo ตามความด่วน + ตาราง 4 ช่อง + ปฏิทิน) · เนื้อหาจริงที่ components/team-plan
// ?item=<id> เปิดป๊อปงานนั้น · ?view=calendar เปิดมุมมองปฏิทินก่อน (ปฏิทินรวมฝังแบบนี้ + embed=1 = ไม่มีหัวหน้า)
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StandaloneShell } from "@/components/standalone-shell";
import { TeamPlanBoard, type PlanView } from "@/components/team-plan";

const VIEW_PARAM: PlanView[] = ["priority", "matrix", "calendar"];

function PlanPageInner() {
  const sp = useSearchParams();
  const v = sp.get("view") as PlanView | null;
  const embedded = sp.get("embed") === "1";
  return (
    <StandaloneShell title="แผนงาน" icon="📋" accent="violet">
      {!embedded && <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <h1 className="text-2xl font-bold text-slate-900">แผนงาน</h1>
        <p className="mt-1 text-slate-500">งานที่ต้องทำของทีม จัดตามความด่วน · ปักดาว 3 งานหลักของวันนี้ · มอบงานแล้วคนนั้นได้แจ้งเตือน</p>
      </div>}
      <div className="px-4 py-4 sm:px-8"><TeamPlanBoard initialItemId={sp.get("item")} initialView={v && VIEW_PARAM.includes(v) ? v : null} /></div>
    </StandaloneShell>
  );
}

export default function TeamPlanPage() {
  return <Suspense fallback={null}><PlanPageInner /></Suspense>;
}
