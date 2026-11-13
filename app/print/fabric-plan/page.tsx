"use client";

/**
 * พิมพ์ใบตัดผ้า — /print/fabric-plan?mo_nos=a,b[&sku=X] (จากหน้า วางแผนตัดผ้า)
 * คำนวณแผนใหม่ทุกครั้งที่เปิด (ตัวเดียวกับหน้าแผน lib/fabric-plan) · 1 ผ้า = 1 แผ่น · บันทึกประวัติพิมพ์ต่อใบสั่งผลิต (usePrintLog "fabric_plan")
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PrintFrame, PrintDocLinkButton, printReportHtmlInNewWindow } from "@/components/report";
import { usePrintLog } from "@/components/report/use-print-log";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { planGroup, type PlanGroupInput, type PlanGroupResult } from "@/lib/fabric-plan";
import { renderFabricPlanHtml } from "@/lib/fabric-plan-print";
import { Icon } from "@/components/icon";
import type { FabricPlanMo } from "@/app/api/mo/fabric-plan/route";

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const moNos = (sp.get("mo_nos") ?? "").trim();
  const sku = (sp.get("sku") ?? "").trim();
  const [groups, setGroups] = useState<PlanGroupResult[] | null>(null);
  const [mos, setMos] = useState<Record<string, FabricPlanMo>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!moNos) { setError("ไม่ได้เลือกใบสั่งผลิต"); setGroups([]); return; }
    let alive = true;
    apiFetch(`/api/mo/fabric-plan?mo_nos=${encodeURIComponent(moNos)}${sku ? `&sku=${encodeURIComponent(sku)}` : ""}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error) { setError(j.error); setGroups([]); return; } setMos(j.data.mos ?? {}); setGroups(((j.data.groups ?? []) as PlanGroupInput[]).map(planGroup)); })
      .catch(() => { if (alive) { setError("โหลดแผนตัดผ้าไม่สำเร็จ"); setGroups([]); } });
    return () => { alive = false; };
  }, [moNos, sku]);

  const fileName = docFileName("ใบตัดผ้า", groups?.length === 1 ? groups[0].name ?? groups[0].sku : `${groups?.length ?? 0} ผ้า`);
  const html = useMemo(() => (groups && groups.length ? renderFabricPlanHtml(groups, mos, { title: fileName, date: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) }) : ""), [groups, mos, fileName]);
  const logItems = useMemo(() => [...new Set((groups ?? []).flatMap((g) => g.mos))].map((no) => ({ doc_id: mos[no]?.id ?? no, doc_no: no, qty: mos[no]?.qty ?? null })).filter((x) => !!mos[x.doc_no]), [groups, mos]);
  usePrintLog("fabric_plan", logItems);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-100 px-6 py-3">
        <button onClick={() => router.back()} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">← กลับ</button>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600"><Icon name="print" /> ใบตัดผ้า {groups && <><b>{groups.length}</b> ผ้า · {logItems.length} ใบสั่งผลิต</>}</span>
        <div className="flex-1" />
        <PrintDocLinkButton html={html} fileName={fileName} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700">พิมพ์ / บันทึก PDF</PrintDocLinkButton>
      </div>
      <div className="px-4 py-6">
        {error && !groups?.length ? <div className="py-20 text-center text-red-500">{error}</div>
          : groups === null ? <div className="py-20 text-center text-slate-400">กำลังวางผ้า…</div>
          : groups.length === 0 ? <div className="py-20 text-center text-slate-400">ไม่มีผ้าให้พิมพ์</div>
          : <PrintFrame html={html} fileName={fileName} onPrint={() => html && printReportHtmlInNewWindow(html)} />}
      </div>
    </div>
  );
}

export default function FabricPlanPrintPage() {
  return <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}><Inner /></Suspense>;
}
