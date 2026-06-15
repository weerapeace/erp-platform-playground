"use client";

// ============================================================
// CampaignDrawer (ของกลางในโมดูล) — drawer รายละเอียดแคมเปญ + งานในแคมเปญ + แก้สถานะ
// ใช้ที่: หน้า list แคมเปญ และหน้า Canvas ของแคมเปญ
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_META, getCampaign, updateCampaign, type CampaignDetail, type CreativeStatus } from "../data";

export const CAMPAIGN_STATUS: { value: string; label: string; cls: string }[] = [
  { value: "planning", label: "วางแผน", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "active",   label: "กำลังทำ", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "done",     label: "จบแล้ว",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelled",label: "ยกเลิก",  cls: "bg-slate-100 text-slate-400 border-slate-200" },
];

type ToastType = "success" | "error" | "info";

export function CampaignDrawer({ campaignId, onClose, onChanged, pushToast }: { campaignId: string; onClose: () => void; onChanged?: () => void; pushToast: (type: ToastType, m: string) => void }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const load = useCallback(async () => { try { setDetail(await getCampaign(campaignId)); } catch (e) { pushToast("error", (e as Error).message); } }, [campaignId, pushToast]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => { try { await updateCampaign(campaignId, { status }); await load(); onChanged?.(); pushToast("success", "อัปเดตสถานะแล้ว"); } catch (e) { pushToast("error", (e as Error).message); } };

  const summaryItems = useMemo(() => detail ? Object.entries(detail.summary).sort((a, b) => b[1] - a[1]) : [], [detail]);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 truncate">{detail.campaign.name}</h3>
                <span className="text-xs text-slate-500">{detail.task_count} งานในแคมเปญ</span>
              </div>
              <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><p className="text-xs text-slate-400 mb-0.5">แบรนด์</p><p className="font-medium text-slate-800">{detail.campaign.brand_label || "—"}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">ผู้ดูแล</p><p className="font-medium text-slate-800">{detail.campaign.owner_label || "—"}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">ช่วงเวลา</p><p className="font-medium text-slate-800">{detail.campaign.start_date ?? "?"} → {detail.campaign.end_date ?? "?"}</p></div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">สถานะ</p>
                  <select value={detail.campaign.status} onChange={(e) => setStatus(e.target.value)} className="text-sm border border-slate-200 rounded-md px-2 py-1">
                    {CAMPAIGN_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {detail.campaign.objective && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">วัตถุประสงค์</p>{detail.campaign.objective}</div>}

              {/* status summary */}
              {summaryItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">สรุปสถานะงาน</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summaryItems.map(([st, n]) => { const m = STATUS_META[st as CreativeStatus] ?? STATUS_META.backlog; return <span key={st} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label} {n}</span>; })}
                  </div>
                </div>
              )}

              {/* task list */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">งานในแคมเปญ ({detail.tasks.length})</p>
                {detail.tasks.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">ยังไม่มีงาน — สร้างการ์ดงานบนกระดาน หรือสร้างที่หน้างาน แล้วเลือกแคมเปญนี้</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.tasks.map((t) => { const m = STATUS_META[t.status] ?? STATUS_META.backlog; return (
                      <div key={t.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.dot}`} />
                        <span className="text-sm text-slate-700 flex-1 line-clamp-1">{t.title}</span>
                        <span className="text-xs text-slate-400">{t.assignee_label || "—"}</span>
                        <span className="text-[11px] text-slate-400">{t.progress_percent}%</span>
                      </div>
                    ); })}
                  </div>
                )}
                <a href="/tasks" className="inline-block mt-3 text-sm text-violet-700 hover:underline">→ ไปที่ตารางงานทั้งหมด</a>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
