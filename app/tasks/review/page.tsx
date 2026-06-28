"use client";

// คิวรอตรวจ/อนุมัติ (หน้าเต็ม) — ใช้ของกลาง ReviewQueueView · หน้าภาพรวมก็ฝังตัวเดียวกัน
import { StandaloneShell } from "@/components/standalone-shell";
import { ReviewQueueView } from "../review-queue-view";
import { useT } from "@/components/i18n";

export default function ReviewQueuePage() {
  const t = useT();
  return (
    <StandaloneShell title={t("รอตรวจ/อนุมัติ", "Review queue")} icon="🟡" accent="violet">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🟡 {t("รอตรวจ/อนุมัติ", "Review queue")}</h1>
            <p className="text-slate-500 mt-1">{t("งานย่อยที่ส่งมารออนุมัติ · กด \"ดูงาน\" เพื่อดูรูปแล้วอนุมัติ/ตีกลับได้เลย", "Submitted subtasks awaiting approval · click \"View\" to see images then approve/return")}</p>
          </div>
          <a href="/tasks" className="h-10 px-4 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">← {t("งาน", "Tasks")}</a>
        </div>
      </div>
      <div className="px-4 sm:px-8 py-6"><ReviewQueueView /></div>
    </StandaloneShell>
  );
}
