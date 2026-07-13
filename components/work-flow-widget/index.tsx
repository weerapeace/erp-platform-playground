"use client";

/**
 * WorkFlowSteps — แสดง flow งานเป็นการ์ดขั้นตอนแนวนอน (กด "เก็บที่" เปิดโมดูล/โฟลเดอร์ได้)
 * WorkFlowWidget — เวอร์ชันย่อ สำหรับแปะบนแดชบอร์ด/หน้าแรกแอป (โหลด flow ตาม flowKey)
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { WorkFlow, WorkFlowStep } from "@/app/api/work-flows/route";

// ชนิดที่เก็บ → ไอคอน + สี
const KIND: Record<string, { icon: string; cls: string }> = {
  module: { icon: "📋", cls: "bg-blue-50 text-blue-700 border-blue-100" },
  drive:  { icon: "📁", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  r2:     { icon: "🗄️", cls: "bg-purple-50 text-purple-700 border-purple-100" },
  attach: { icon: "📎", cls: "bg-amber-50 text-amber-700 border-amber-100" },
  other:  { icon: "📍", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

export function WorkFlowSteps({ steps }: { steps: WorkFlowStep[] }) {
  const router = useRouter();
  const go = (url: string | null) => {
    if (!url) return;
    if (url.startsWith("/")) router.push(url); else window.open(url, "_blank");
  };
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-stretch min-w-min">
        {steps.map((s, i) => {
          const k = KIND[s.storage_kind ?? "module"] ?? KIND.other;
          const clickable = !!s.link_url;
          const hasFiles = s.files_note && s.files_note !== "—";
          return (
            <div key={s.id} className="flex items-stretch">
              <div className="w-52 shrink-0 bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs flex items-center justify-center shrink-0">{s.step_no}</span>
                  <span className="text-lg">{s.icon}</span>
                </div>
                <div className="text-sm font-medium text-slate-800 mb-1.5">{s.title}</div>
                {hasFiles ? (
                  <>
                    <div className="text-[11px] text-slate-400">ไฟล์ที่เกิด</div>
                    <div className="text-xs text-slate-500 mb-2 flex-1">{s.files_note}</div>
                  </>
                ) : <div className="flex-1" />}
                <button type="button" onClick={() => go(s.link_url)} disabled={!clickable}
                  className={`text-left text-xs border rounded-lg px-2.5 py-2 ${k.cls} ${clickable ? "hover:brightness-95 cursor-pointer" : "cursor-default"}`}>
                  <span className="opacity-70">{k.icon} เก็บที่:</span> <b className="font-medium">{s.storage_label}</b>
                  {clickable && <span className="block text-[10px] opacity-70 mt-0.5">กดเพื่อเปิด →</span>}
                </button>
              </div>
              {i < steps.length - 1 && <div className="flex items-center px-1.5 text-slate-300 text-xl">→</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkFlowWidget({ flowKey, title }: { flowKey: string; title?: string }) {
  const [flow, setFlow] = useState<WorkFlow | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    apiFetch("/api/work-flows").then((r) => r.json())
      .then((j) => setFlow(((j.data ?? []) as WorkFlow[]).find((x) => x.flow_key === flowKey) ?? null))
      .catch(() => {}).finally(() => setDone(true));
  }, [flowKey]);
  if (done && (!flow || flow.steps.length === 0)) return null;   // ไม่มี flow นี้ → ไม่โชว์ widget
  if (!flow) return null;
  return (
    <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span>{flow.icon}</span>
        <span className="text-sm font-medium text-slate-700">{title ?? `ขั้นตอน${flow.name} — เก็บอะไรไว้ที่ไหน`}</span>
        <a href="/master/work-flows" className="text-[11px] text-indigo-600 hover:underline ml-auto whitespace-nowrap">คู่มือทั้งหมด →</a>
      </div>
      <WorkFlowSteps steps={flow.steps} />
    </div>
  );
}
