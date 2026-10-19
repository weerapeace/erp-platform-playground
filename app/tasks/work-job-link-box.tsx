"use client";

// ============================================================
// 🛠 งานชุดรุ่น (หน้า SKU การตลาด › โหมดทำงาน) ที่ผูกกับงานนี้ — โชว์ใน drawer งาน
//   ความคืบหน้าคิดจากงานชุดรุ่น (ติ๊กที่หน้านั้น) · % และสถานะของการ์ดนี้ซิงก์ฝั่งเซิร์ฟเวอร์ (lib/marketing/work-jobs-db)
//   ไม่ผูก = ไม่โชว์อะไร · ข้อมูล: GET /api/creative-tasks/[id]/work-job (สิทธิ์ tasks.view)
// ============================================================

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";

type Info = {
  id: string; name: string; status: string; kind_label: string; kind_icon: string; due_date: string | null;
  steps: string[]; models: number; models_done: number; steps_done: number; steps_total: number; pct: number;
};

export function WorkJobLinkBox({ taskId }: { taskId: string }) {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    let alive = true;
    setInfo(null);
    apiFetch(`/api/creative-tasks/${taskId}/work-job`)
      .then((r) => r.json())
      .then((j) => { if (alive && j?.data) setInfo(j.data as Info); })
      .catch(() => { /* โหลดไม่ได้ = ไม่โชว์กล่อง (งานยังใช้ได้ปกติ) */ });
    return () => { alive = false; };
  }, [taskId]);
  if (!info) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-violet-700">🛠 {t("งานชุดรุ่น", "Model batch job")} · {info.kind_icon} {info.kind_label}{info.status === "done" ? ` · ✓ ${t("ปิดงานแล้ว", "Closed")}` : ""}</p>
          <p className="truncate text-sm font-semibold text-slate-800" title={info.name}>{info.name}</p>
        </div>
        <a href={`/marketing/skus?job=${info.id}`} className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700">
          {info.models ? t("เปิดงานรุ่น →", "Open job →") : t("＋ ใส่รุ่น →", "＋ Add models →")}
        </a>
      </div>
      {info.models > 0 ? (
        <>
          <div className="mt-2 flex justify-between text-xs text-slate-600">
            <span>{t("รุ่นที่เสร็จ", "Models done")} {info.models_done.toLocaleString("th-TH")}/{info.models.toLocaleString("th-TH")} · {t("ขั้นตอน", "Steps")} {info.steps_done.toLocaleString("th-TH")}/{info.steps_total.toLocaleString("th-TH")}</span>
            <span className="font-medium text-slate-800">{info.pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${info.pct}%` }} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-amber-700">{t("ยังไม่มีรุ่นในงาน — กด “ใส่รุ่น” แล้วเลือกรุ่นแบบการ์ด", "No models yet — click “Add models”")}</p>
      )}
      {info.steps.length > 0 && <p className="mt-1.5 text-[11px] text-slate-500">{t("ขั้นตอน", "Steps")}: {info.steps.join(" → ")}</p>}
      <p className="mt-1 text-[10px] text-slate-400">{t("ติ๊กความคืบหน้าที่หน้า SKU การตลาด › โหมดทำงาน — % และสถานะของการ์ดนี้อัปเดตเอง", "Tick progress on Marketing SKUs › Work mode — this card’s % and status update automatically")}</p>
    </div>
  );
}
